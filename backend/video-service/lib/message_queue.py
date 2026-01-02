"""
Message Queue Client
RabbitMQ integration for event publishing and consumption
"""

import logging
import json
from typing import Dict, Any, Optional, Callable
import asyncio

import aio_pika
from aio_pika import connect_robust, Message, ExchangeType
from aio_pika.abc import AbstractConnection, AbstractChannel, AbstractExchange

from src.config import settings

logger = logging.getLogger(__name__)


class MessageQueueError(Exception):
    """Base exception for message queue errors"""
    pass


class MessageQueueClient:
    """Async RabbitMQ client for event publishing"""

    def __init__(self):
        self.connection: Optional[AbstractConnection] = None
        self.channel: Optional[AbstractChannel] = None
        self.exchanges: Dict[str, AbstractExchange] = {}
        self.is_connected = False

    async def connect(self):
        """Establish connection to RabbitMQ"""
        try:
            logger.info(f"Connecting to RabbitMQ at {settings.RABBITMQ_HOST}:{settings.RABBITMQ_PORT}")

            self.connection = await connect_robust(
                settings.rabbitmq_url,
                client_properties={"connection_name": settings.SERVICE_NAME}
            )

            self.channel = await self.connection.channel()
            await self.channel.set_qos(prefetch_count=10)

            # Declare video processing exchange
            self.exchanges[settings.VIDEO_PROCESSING_EXCHANGE] = await self.channel.declare_exchange(
                settings.VIDEO_PROCESSING_EXCHANGE,
                ExchangeType.TOPIC,
                durable=True
            )

            self.is_connected = True
            logger.info("Connected to RabbitMQ successfully")

        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            raise MessageQueueError(f"Failed to connect to RabbitMQ: {e}")

    async def close(self):
        """Close RabbitMQ connection"""
        if self.connection and not self.connection.is_closed:
            await self.connection.close()
            self.is_connected = False
            logger.info("Closed RabbitMQ connection")

    async def publish(
        self,
        exchange: str,
        routing_key: str,
        message: Dict[str, Any],
        persistent: bool = True
    ):
        """
        Publish message to exchange

        Args:
            exchange: Exchange name
            routing_key: Routing key
            message: Message payload (will be JSON serialized)
            persistent: Whether message should be persistent
        """
        if not self.is_connected:
            raise MessageQueueError("Not connected to RabbitMQ")

        try:
            exchange_obj = self.exchanges.get(exchange)
            if not exchange_obj:
                # Declare exchange if not already declared
                exchange_obj = await self.channel.declare_exchange(
                    exchange,
                    ExchangeType.TOPIC,
                    durable=True
                )
                self.exchanges[exchange] = exchange_obj

            # Serialize message
            body = json.dumps(message).encode()

            # Create message
            msg = Message(
                body,
                content_type='application/json',
                delivery_mode=2 if persistent else 1  # 2 = persistent
            )

            # Publish
            await exchange_obj.publish(
                msg,
                routing_key=routing_key
            )

            logger.debug(f"Published message to {exchange}/{routing_key}")

        except Exception as e:
            logger.error(f"Failed to publish message: {e}")
            raise MessageQueueError(f"Failed to publish message: {e}")

    async def consume(
        self,
        queue_name: str,
        callback: Callable,
        exchange: str = None,
        routing_keys: list = None
    ):
        """
        Consume messages from queue

        Args:
            queue_name: Queue name
            callback: Async callback function to process messages
            exchange: Optional exchange to bind to
            routing_keys: Optional routing keys for binding
        """
        if not self.is_connected:
            raise MessageQueueError("Not connected to RabbitMQ")

        try:
            # Declare queue
            queue = await self.channel.declare_queue(
                queue_name,
                durable=True
            )

            # Bind to exchange if specified
            if exchange and routing_keys:
                exchange_obj = self.exchanges.get(exchange)
                if not exchange_obj:
                    exchange_obj = await self.channel.declare_exchange(
                        exchange,
                        ExchangeType.TOPIC,
                        durable=True
                    )
                    self.exchanges[exchange] = exchange_obj

                for routing_key in routing_keys:
                    await queue.bind(exchange_obj, routing_key=routing_key)
                    logger.info(f"Bound queue {queue_name} to {exchange}/{routing_key}")

            # Start consuming
            async with queue.iterator() as queue_iter:
                async for message in queue_iter:
                    async with message.process():
                        try:
                            # Deserialize message
                            body = json.loads(message.body.decode())

                            # Call callback
                            await callback(body)

                        except Exception as e:
                            logger.error(f"Error processing message: {e}")
                            # Message will be requeued by default

        except Exception as e:
            logger.error(f"Error consuming from queue {queue_name}: {e}")
            raise MessageQueueError(f"Failed to consume messages: {e}")

    async def declare_queue(
        self,
        queue_name: str,
        exchange: str = None,
        routing_keys: list = None,
        durable: bool = True
    ):
        """
        Declare queue and optionally bind to exchange

        Args:
            queue_name: Queue name
            exchange: Optional exchange to bind to
            routing_keys: Optional routing keys for binding
            durable: Whether queue should be durable
        """
        if not self.is_connected:
            raise MessageQueueError("Not connected to RabbitMQ")

        try:
            # Declare queue
            queue = await self.channel.declare_queue(
                queue_name,
                durable=durable
            )

            # Bind to exchange if specified
            if exchange and routing_keys:
                exchange_obj = self.exchanges.get(exchange)
                if not exchange_obj:
                    exchange_obj = await self.channel.declare_exchange(
                        exchange,
                        ExchangeType.TOPIC,
                        durable=True
                    )
                    self.exchanges[exchange] = exchange_obj

                for routing_key in routing_keys:
                    await queue.bind(exchange_obj, routing_key=routing_key)

            logger.info(f"Declared queue {queue_name}")

        except Exception as e:
            logger.error(f"Failed to declare queue {queue_name}: {e}")
            raise MessageQueueError(f"Failed to declare queue: {e}")


# Event publisher convenience functions
async def publish_recording_event(event_type: str, session_id: str, data: Dict[str, Any]):
    """
    Publish recording event

    Args:
        event_type: Event type (recording_started, recording_completed, etc.)
        session_id: Session UUID
        data: Event data
    """
    client = MessageQueueClient()

    try:
        await client.connect()

        message = {
            'event': event_type,
            'session_id': session_id,
            'timestamp': data.get('timestamp'),
            'data': data
        }

        await client.publish(
            exchange=settings.VIDEO_PROCESSING_EXCHANGE,
            routing_key=f"recording.{event_type}",
            message=message
        )

    finally:
        await client.close()


async def publish_stream_event(event_type: str, session_id: str, data: Dict[str, Any]):
    """
    Publish stream event

    Args:
        event_type: Event type (stream_started, stream_ended, etc.)
        session_id: Session UUID
        data: Event data
    """
    client = MessageQueueClient()

    try:
        await client.connect()

        message = {
            'event': event_type,
            'session_id': session_id,
            'timestamp': data.get('timestamp'),
            'data': data
        }

        await client.publish(
            exchange=settings.VIDEO_PROCESSING_EXCHANGE,
            routing_key=f"stream.{event_type}",
            message=message
        )

    finally:
        await client.close()
