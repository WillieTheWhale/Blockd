"""
RabbitMQ Publisher for Blockd Platform
Handles message publishing to RabbitMQ exchanges with retry logic and error handling
"""

import json
import logging
import time
from typing import Dict, Any, Optional, List
from datetime import datetime
import pika
from pika import BlockingConnection, ConnectionParameters, PlainCredentials
from pika.exceptions import AMQPConnectionError, AMQPChannelError, ConnectionClosedByBroker
import random

logger = logging.getLogger(__name__)


class RabbitMQPublisher:
    """
    RabbitMQ Publisher with connection pooling, retry logic, and exponential backoff
    """

    def __init__(
        self,
        hosts: List[str] = None,
        port: int = 5672,
        username: str = "blockd_user",
        password: str = "blockd_password_change_in_production",
        virtual_host: str = "blockd",
        connection_attempts: int = 5,
        retry_delay: int = 2,
        heartbeat: int = 60,
        blocked_connection_timeout: int = 300
    ):
        """
        Initialize RabbitMQ Publisher

        Args:
            hosts: List of RabbitMQ host addresses (default: localhost cluster)
            port: RabbitMQ port
            username: Authentication username
            password: Authentication password
            virtual_host: Virtual host name
            connection_attempts: Number of connection attempts
            retry_delay: Initial retry delay in seconds
            heartbeat: Heartbeat interval in seconds
            blocked_connection_timeout: Timeout for blocked connections
        """
        self.hosts = hosts or ["localhost", "127.0.0.1"]
        self.port = port
        self.username = username
        self.password = password
        self.virtual_host = virtual_host
        self.connection_attempts = connection_attempts
        self.retry_delay = retry_delay
        self.heartbeat = heartbeat
        self.blocked_connection_timeout = blocked_connection_timeout

        self.connection: Optional[BlockingConnection] = None
        self.channel = None
        self._is_connected = False

    def connect(self) -> bool:
        """
        Establish connection to RabbitMQ cluster with retry logic

        Returns:
            bool: True if connection successful, False otherwise
        """
        for attempt in range(self.connection_attempts):
            try:
                # Try each host in round-robin fashion
                host = self.hosts[attempt % len(self.hosts)]

                credentials = PlainCredentials(self.username, self.password)
                parameters = ConnectionParameters(
                    host=host,
                    port=self.port,
                    virtual_host=self.virtual_host,
                    credentials=credentials,
                    heartbeat=self.heartbeat,
                    blocked_connection_timeout=self.blocked_connection_timeout,
                    connection_attempts=3,
                    retry_delay=1
                )

                self.connection = BlockingConnection(parameters)
                self.channel = self.connection.channel()

                # Enable publisher confirms for reliability
                self.channel.confirm_delivery()

                self._is_connected = True
                logger.info(f"Connected to RabbitMQ at {host}:{self.port}/{self.virtual_host}")
                return True

            except (AMQPConnectionError, ConnectionClosedByBroker) as e:
                logger.warning(
                    f"Connection attempt {attempt + 1}/{self.connection_attempts} failed: {str(e)}"
                )
                if attempt < self.connection_attempts - 1:
                    time.sleep(self.retry_delay * (2 ** attempt))  # Exponential backoff

        logger.error("Failed to connect to RabbitMQ after all attempts")
        self._is_connected = False
        return False

    def disconnect(self):
        """Close RabbitMQ connection"""
        try:
            if self.connection and not self.connection.is_closed:
                self.connection.close()
                logger.info("Disconnected from RabbitMQ")
        except Exception as e:
            logger.error(f"Error closing connection: {str(e)}")
        finally:
            self._is_connected = False
            self.connection = None
            self.channel = None

    def _ensure_connection(self) -> bool:
        """
        Ensure connection is active, reconnect if needed

        Returns:
            bool: True if connected, False otherwise
        """
        if not self._is_connected or not self.connection or self.connection.is_closed:
            return self.connect()
        return True

    def publish(
        self,
        exchange: str,
        routing_key: str,
        message: Dict[str, Any],
        priority: int = 0,
        expiration: Optional[int] = None,
        correlation_id: Optional[str] = None,
        retry_count: int = 3
    ) -> bool:
        """
        Publish message to RabbitMQ exchange with retry logic

        Args:
            exchange: Exchange name
            routing_key: Routing key for message routing
            message: Message payload (will be JSON serialized)
            priority: Message priority (0-9)
            expiration: Message TTL in milliseconds
            correlation_id: Correlation ID for request/response patterns
            retry_count: Number of retry attempts

        Returns:
            bool: True if published successfully, False otherwise
        """
        if not self._ensure_connection():
            logger.error("Cannot publish: not connected to RabbitMQ")
            return False

        # Add metadata to message
        enriched_message = {
            "timestamp": datetime.utcnow().isoformat(),
            "exchange": exchange,
            "routing_key": routing_key,
            "data": message
        }

        body = json.dumps(enriched_message)

        # Message properties
        properties = pika.BasicProperties(
            delivery_mode=2,  # Persistent
            content_type="application/json",
            priority=priority,
            correlation_id=correlation_id,
            timestamp=int(time.time())
        )

        if expiration:
            properties.expiration = str(expiration)

        # Retry logic with exponential backoff
        for attempt in range(retry_count):
            try:
                self.channel.basic_publish(
                    exchange=exchange,
                    routing_key=routing_key,
                    body=body,
                    properties=properties,
                    mandatory=True  # Return message if unroutable
                )

                logger.debug(
                    f"Published message to {exchange} with routing_key {routing_key}"
                )
                return True

            except AMQPChannelError as e:
                logger.error(f"Channel error on publish attempt {attempt + 1}: {str(e)}")
                if attempt < retry_count - 1:
                    # Recreate channel
                    try:
                        self.channel = self.connection.channel()
                        self.channel.confirm_delivery()
                    except Exception as reconnect_error:
                        logger.error(f"Failed to recreate channel: {str(reconnect_error)}")
                        self._is_connected = False
                        self._ensure_connection()
                    time.sleep(0.5 * (2 ** attempt))

            except Exception as e:
                logger.error(f"Unexpected error on publish attempt {attempt + 1}: {str(e)}")
                if attempt < retry_count - 1:
                    time.sleep(0.5 * (2 ** attempt))

        logger.error(f"Failed to publish message after {retry_count} attempts")
        return False

    def publish_batch(
        self,
        exchange: str,
        messages: List[tuple[str, Dict[str, Any]]],
        priority: int = 0
    ) -> int:
        """
        Publish multiple messages in a batch

        Args:
            exchange: Exchange name
            messages: List of (routing_key, message) tuples
            priority: Message priority

        Returns:
            int: Number of successfully published messages
        """
        if not self._ensure_connection():
            logger.error("Cannot publish batch: not connected to RabbitMQ")
            return 0

        success_count = 0

        for routing_key, message in messages:
            if self.publish(exchange, routing_key, message, priority=priority):
                success_count += 1

        logger.info(f"Published {success_count}/{len(messages)} messages in batch")
        return success_count

    def __enter__(self):
        """Context manager entry"""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.disconnect()


# Convenience functions for common exchanges

def publish_video_task(
    task_type: str,
    video_id: str,
    data: Dict[str, Any],
    publisher: Optional[RabbitMQPublisher] = None
) -> bool:
    """
    Publish video processing task

    Args:
        task_type: Type of task (encode, thumbnail, upload)
        video_id: Video identifier
        data: Task data
        publisher: Optional publisher instance (creates new if not provided)

    Returns:
        bool: Success status
    """
    message = {
        "video_id": video_id,
        "task_type": task_type,
        **data
    }

    routing_key = f"video.{task_type}.{video_id}"

    if publisher:
        return publisher.publish("video_processing", routing_key, message)
    else:
        with RabbitMQPublisher() as pub:
            return pub.publish("video_processing", routing_key, message)


def publish_ai_task(
    task_type: str,
    exam_id: str,
    data: Dict[str, Any],
    publisher: Optional[RabbitMQPublisher] = None
) -> bool:
    """
    Publish AI detection task

    Args:
        task_type: Type of task (analyze, embedding, cache)
        exam_id: Exam identifier
        data: Task data
        publisher: Optional publisher instance

    Returns:
        bool: Success status
    """
    message = {
        "exam_id": exam_id,
        "task_type": task_type,
        **data
    }

    routing_key = f"ai.{task_type}.{exam_id}"

    if publisher:
        return publisher.publish("ai_detection", routing_key, message)
    else:
        with RabbitMQPublisher() as pub:
            return pub.publish("ai_detection", routing_key, message)


def publish_security_event(
    event_type: str,
    data: Dict[str, Any],
    publisher: Optional[RabbitMQPublisher] = None
) -> bool:
    """
    Publish security event (fanout to all listeners)

    Args:
        event_type: Type of security event
        data: Event data
        publisher: Optional publisher instance

    Returns:
        bool: Success status
    """
    message = {
        "event_type": event_type,
        "severity": data.get("severity", "info"),
        **data
    }

    # Fanout exchange ignores routing key, but we include it for logging
    routing_key = f"security.{event_type}"

    if publisher:
        return publisher.publish("security_events", routing_key, message, priority=5)
    else:
        with RabbitMQPublisher() as pub:
            return pub.publish("security_events", routing_key, message, priority=5)


def publish_gaze_task(
    task_type: str,
    session_id: str,
    data: Dict[str, Any],
    publisher: Optional[RabbitMQPublisher] = None
) -> bool:
    """
    Publish gaze analysis task

    Args:
        task_type: Type of task (process, anomaly)
        session_id: Session identifier
        data: Task data
        publisher: Optional publisher instance

    Returns:
        bool: Success status
    """
    message = {
        "session_id": session_id,
        "task_type": task_type,
        **data
    }

    routing_key = f"gaze.{task_type}.{session_id}"

    if publisher:
        return publisher.publish("gaze_analysis", routing_key, message)
    else:
        with RabbitMQPublisher() as pub:
            return pub.publish("gaze_analysis", routing_key, message)


if __name__ == "__main__":
    # Example usage
    logging.basicConfig(level=logging.INFO)

    # Test connection and publishing
    with RabbitMQPublisher() as publisher:
        # Test video task
        publish_video_task(
            "encode",
            "video_123",
            {"quality": "1080p", "codec": "h264"},
            publisher
        )

        # Test AI task
        publish_ai_task(
            "analyze",
            "exam_456",
            {"answer_id": "ans_789", "text": "Sample answer"},
            publisher
        )

        # Test security event
        publish_security_event(
            "suspicious_activity",
            {"user_id": "user_123", "severity": "high", "description": "Multiple tab switches"},
            publisher
        )

        # Test gaze task
        publish_gaze_task(
            "process",
            "session_999",
            {"gaze_data": [{"x": 100, "y": 200, "timestamp": time.time()}]},
            publisher
        )
