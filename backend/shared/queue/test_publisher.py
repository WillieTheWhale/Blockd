"""
Test script for RabbitMQ Publisher
Tests connection, publishing, and load testing
"""

import sys
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Tuple
import random

from publisher import (
    RabbitMQPublisher,
    publish_video_task,
    publish_ai_task,
    publish_security_event,
    publish_gaze_task
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def test_connection():
    """Test RabbitMQ connection"""
    logger.info("=== Testing RabbitMQ Connection ===")

    publisher = RabbitMQPublisher()
    success = publisher.connect()

    if success:
        logger.info("✓ Connection successful")
        publisher.disconnect()
        return True
    else:
        logger.error("✗ Connection failed")
        return False


def test_basic_publishing():
    """Test basic message publishing to all exchanges"""
    logger.info("\n=== Testing Basic Publishing ===")

    with RabbitMQPublisher() as publisher:
        results = []

        # Test video task
        logger.info("Publishing video encoding task...")
        success = publish_video_task(
            "encode",
            "test_video_001",
            {"quality": "1080p", "codec": "h264"},
            publisher
        )
        results.append(("video_encode", success))

        # Test AI task
        logger.info("Publishing AI analysis task...")
        success = publish_ai_task(
            "analyze",
            "test_exam_001",
            {"answer_id": "ans_001", "text": "Sample answer for testing"},
            publisher
        )
        results.append(("ai_analyze", success))

        # Test security event
        logger.info("Publishing security event...")
        success = publish_security_event(
            "test_event",
            {"user_id": "user_001", "severity": "medium", "description": "Test event"},
            publisher
        )
        results.append(("security_event", success))

        # Test gaze task
        logger.info("Publishing gaze processing task...")
        success = publish_gaze_task(
            "process",
            "test_session_001",
            {"gaze_data": [{"x": 100, "y": 200, "timestamp": time.time()}]},
            publisher
        )
        results.append(("gaze_process", success))

        # Print results
        logger.info("\nPublishing Results:")
        success_count = 0
        for task_type, success in results:
            status = "✓" if success else "✗"
            logger.info(f"  {status} {task_type}")
            if success:
                success_count += 1

        logger.info(f"\nTotal: {success_count}/{len(results)} successful")
        return success_count == len(results)


def test_batch_publishing():
    """Test batch publishing"""
    logger.info("\n=== Testing Batch Publishing ===")

    with RabbitMQPublisher() as publisher:
        messages = []
        batch_size = 100

        for i in range(batch_size):
            routing_key = f"video.encode.batch_test_{i}"
            message = {
                "video_id": f"batch_test_{i}",
                "quality": "720p",
                "codec": "h264"
            }
            messages.append((routing_key, message))

        start_time = time.time()
        success_count = publisher.publish_batch("video_processing", messages)
        elapsed = time.time() - start_time

        logger.info(f"Published {success_count}/{batch_size} messages")
        logger.info(f"Time: {elapsed:.2f}s")
        logger.info(f"Rate: {success_count/elapsed:.2f} msg/s")

        return success_count == batch_size


def test_retry_logic():
    """Test retry logic with simulated failures"""
    logger.info("\n=== Testing Retry Logic ===")

    # Create publisher with invalid host to test retry
    publisher = RabbitMQPublisher(
        hosts=["invalid-host-1", "invalid-host-2", "localhost"],
        connection_attempts=3,
        retry_delay=1
    )

    start_time = time.time()
    success = publisher.connect()
    elapsed = time.time() - start_time

    if success:
        logger.info(f"✓ Connected after retries ({elapsed:.2f}s)")
        publisher.disconnect()
        return True
    else:
        logger.error("✗ Failed to connect even with valid fallback host")
        return False


def load_test(messages_per_second: int = 1000, duration_seconds: int = 10):
    """Load test with specified throughput"""
    logger.info(f"\n=== Load Test: {messages_per_second} msg/s for {duration_seconds}s ===")

    total_messages = messages_per_second * duration_seconds
    batch_size = 100
    delay_between_batches = batch_size / messages_per_second

    logger.info(f"Total messages: {total_messages}")
    logger.info(f"Batch size: {batch_size}")
    logger.info(f"Delay between batches: {delay_between_batches:.3f}s")

    with RabbitMQPublisher() as publisher:
        total_sent = 0
        total_failed = 0
        start_time = time.time()

        for batch_num in range(total_messages // batch_size):
            batch_start = time.time()

            # Publish batch
            messages = []
            for i in range(batch_size):
                msg_id = batch_num * batch_size + i
                routing_key = f"ai.analyze.load_test_{msg_id}"
                message = {
                    "exam_id": f"load_test_{msg_id}",
                    "answer_id": f"ans_{msg_id}",
                    "text": f"Sample answer {msg_id}"
                }
                messages.append((routing_key, message))

            success_count = publisher.publish_batch("ai_detection", messages)
            total_sent += success_count
            total_failed += (batch_size - success_count)

            # Progress update
            if (batch_num + 1) % 10 == 0:
                elapsed = time.time() - start_time
                rate = total_sent / elapsed if elapsed > 0 else 0
                logger.info(f"Progress: {total_sent}/{total_messages} ({rate:.0f} msg/s)")

            # Rate limiting
            batch_elapsed = time.time() - batch_start
            if batch_elapsed < delay_between_batches:
                time.sleep(delay_between_batches - batch_elapsed)

        # Final stats
        total_elapsed = time.time() - start_time
        actual_rate = total_sent / total_elapsed

        logger.info(f"\n=== Load Test Results ===")
        logger.info(f"Messages sent: {total_sent}")
        logger.info(f"Messages failed: {total_failed}")
        logger.info(f"Total time: {total_elapsed:.2f}s")
        logger.info(f"Actual rate: {actual_rate:.2f} msg/s")
        logger.info(f"Target rate: {messages_per_second} msg/s")
        logger.info(f"Success rate: {(total_sent/total_messages)*100:.1f}%")

        return total_sent >= total_messages * 0.95  # 95% success threshold


def stress_test_concurrent_publishers(num_publishers: int = 10, messages_per_publisher: int = 100):
    """Stress test with concurrent publishers"""
    logger.info(f"\n=== Stress Test: {num_publishers} concurrent publishers ===")

    def publisher_task(publisher_id: int) -> Tuple[int, int]:
        """Task for each publisher"""
        with RabbitMQPublisher() as publisher:
            success_count = 0
            for i in range(messages_per_publisher):
                message = {
                    "publisher_id": publisher_id,
                    "message_id": i,
                    "data": f"Message {i} from publisher {publisher_id}"
                }
                routing_key = f"video.encode.stress_test_{publisher_id}_{i}"

                if publisher.publish("video_processing", routing_key, message):
                    success_count += 1

            return publisher_id, success_count

    start_time = time.time()

    with ThreadPoolExecutor(max_workers=num_publishers) as executor:
        futures = [executor.submit(publisher_task, i) for i in range(num_publishers)]

        total_success = 0
        for future in as_completed(futures):
            publisher_id, success_count = future.result()
            total_success += success_count
            logger.info(f"Publisher {publisher_id}: {success_count}/{messages_per_publisher} messages")

    elapsed = time.time() - start_time
    total_messages = num_publishers * messages_per_publisher
    rate = total_success / elapsed

    logger.info(f"\n=== Stress Test Results ===")
    logger.info(f"Total messages: {total_success}/{total_messages}")
    logger.info(f"Total time: {elapsed:.2f}s")
    logger.info(f"Throughput: {rate:.2f} msg/s")
    logger.info(f"Success rate: {(total_success/total_messages)*100:.1f}%")

    return total_success >= total_messages * 0.95


def run_all_tests():
    """Run all tests"""
    logger.info("=" * 60)
    logger.info("RabbitMQ Publisher Test Suite")
    logger.info("=" * 60)

    tests = [
        ("Connection Test", test_connection),
        ("Basic Publishing Test", test_basic_publishing),
        ("Batch Publishing Test", test_batch_publishing),
        ("Retry Logic Test", test_retry_logic),
        ("Load Test (1000 msg/s)", lambda: load_test(1000, 10)),
        ("Stress Test (10 concurrent publishers)", lambda: stress_test_concurrent_publishers(10, 100)),
    ]

    results = []

    for test_name, test_func in tests:
        try:
            logger.info(f"\n{'=' * 60}")
            success = test_func()
            results.append((test_name, success))

            if success:
                logger.info(f"✓ {test_name} PASSED")
            else:
                logger.error(f"✗ {test_name} FAILED")
        except Exception as e:
            logger.error(f"✗ {test_name} FAILED with exception: {str(e)}")
            results.append((test_name, False))

    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("TEST SUMMARY")
    logger.info("=" * 60)

    passed = sum(1 for _, success in results if success)
    total = len(results)

    for test_name, success in results:
        status = "✓ PASS" if success else "✗ FAIL"
        logger.info(f"{status}: {test_name}")

    logger.info(f"\nTotal: {passed}/{total} tests passed")

    return passed == total


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
