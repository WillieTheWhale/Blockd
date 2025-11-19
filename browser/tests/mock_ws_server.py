#!/usr/bin/env python3
"""
Mock WebSocket Server for Blockd Integration Testing

This server simulates the Blockd backend WebSocket endpoint for testing
the browser WebSocket client implementation.

Usage:
    python mock_ws_server.py [--port PORT] [--host HOST]

Features:
- Echoes received messages back to client
- Validates message format
- Simulates server commands (ALERT, CONFIG_UPDATE, SESSION_END)
- Logs all traffic for debugging
"""

import asyncio
import websockets
import json
import argparse
import logging
from datetime import datetime
from urllib.parse import urlparse, parse_qs

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class BlockdMockServer:
    """Mock WebSocket server for Blockd testing"""

    def __init__(self, host='localhost', port=8765):
        self.host = host
        self.port = port
        self.connections = {}
        self.message_count = 0

    async def handle_client(self, websocket, path):
        """Handle individual client connection"""

        # Parse session_id from query parameters
        parsed = urlparse(path)
        query_params = parse_qs(parsed.query)
        session_id = query_params.get('session_id', ['unknown'])[0]

        client_id = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
        self.connections[client_id] = {
            'websocket': websocket,
            'session_id': session_id,
            'connected_at': datetime.now()
        }

        logger.info(f"Client connected: {client_id}, Session: {session_id}")

        try:
            async for message in websocket:
                await self.handle_message(client_id, message)

        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client disconnected: {client_id}")
        except Exception as e:
            logger.error(f"Error handling client {client_id}: {e}")
        finally:
            if client_id in self.connections:
                del self.connections[client_id]

    async def handle_message(self, client_id, message):
        """Process received message"""

        try:
            self.message_count += 1
            msg_data = json.loads(message)

            # Validate message structure
            if not self.validate_message(msg_data):
                logger.warning(f"Invalid message from {client_id}: {message}")
                await self.send_error(client_id, "Invalid message format")
                return

            msg_type = msg_data.get('type')
            payload = msg_data.get('payload', {})
            session_id = msg_data.get('session_id')

            logger.info(f"Received [{msg_type}] from {client_id} (session: {session_id})")
            logger.debug(f"Payload: {json.dumps(payload, indent=2)}")

            # Handle different message types
            if msg_type == 'CLIENT_CONNECTED':
                await self.handle_client_connected(client_id, payload)
            elif msg_type == 'EYE_TRACKING_DATA':
                await self.handle_eye_tracking(client_id, payload)
            elif msg_type == 'KEYSTROKE_EVENT':
                await self.handle_keystroke(client_id, payload)
            elif msg_type == 'SCREEN_CHANGE':
                await self.handle_screen_change(client_id, payload)
            elif msg_type == 'HEARTBEAT':
                await self.handle_heartbeat(client_id)
            else:
                logger.warning(f"Unknown message type: {msg_type}")

            # Echo message back for testing
            echo_response = {
                'type': 'ECHO',
                'payload': {
                    'original_type': msg_type,
                    'received_at': datetime.now().isoformat(),
                    'message_number': self.message_count
                }
            }
            await self.send_message(client_id, echo_response)

        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {e}")
            await self.send_error(client_id, "Invalid JSON")
        except Exception as e:
            logger.error(f"Error processing message: {e}")

    def validate_message(self, msg_data):
        """Validate message structure"""
        required_fields = ['type', 'payload', 'timestamp', 'session_id']
        return all(field in msg_data for field in required_fields)

    async def handle_client_connected(self, client_id, payload):
        """Handle CLIENT_CONNECTED message"""
        logger.info(f"Client {client_id} connected with session: {payload.get('session_id')}")

        # Send welcome message
        welcome = {
            'type': 'CONFIG_UPDATE',
            'payload': {
                'eye_tracking_frequency': 30,
                'enable_keystroke_monitoring': True,
                'message': 'Welcome to Blockd Mock Server'
            }
        }
        await self.send_message(client_id, welcome)

    async def handle_eye_tracking(self, client_id, payload):
        """Handle EYE_TRACKING_DATA message"""
        x = payload.get('x', 0)
        y = payload.get('y', 0)
        confidence = payload.get('confidence', 0)

        logger.debug(f"Eye tracking: x={x:.2f}, y={y:.2f}, confidence={confidence:.2f}")

        # Simulate alert if looking away (low confidence)
        if confidence < 0.5:
            alert = {
                'type': 'ALERT',
                'payload': {
                    'severity': 'medium',
                    'message': 'Low eye tracking confidence detected',
                    'action': 'warn'
                }
            }
            await self.send_message(client_id, alert)

    async def handle_keystroke(self, client_id, payload):
        """Handle KEYSTROKE_EVENT message"""
        key = payload.get('key', '')
        duration = payload.get('duration', 0)

        logger.debug(f"Keystroke: key={key}, duration={duration}ms")

    async def handle_screen_change(self, client_id, payload):
        """Handle SCREEN_CHANGE message"""
        monitor_count = payload.get('monitor_count', 1)
        active_window = payload.get('active_window', '')

        logger.info(f"Screen change: monitors={monitor_count}, window={active_window}")

        # Simulate alert for multiple monitors
        if monitor_count > 1:
            alert = {
                'type': 'ALERT',
                'payload': {
                    'severity': 'high',
                    'message': f'Multiple monitors detected ({monitor_count})',
                    'action': 'pause'
                }
            }
            await self.send_message(client_id, alert)

    async def handle_heartbeat(self, client_id):
        """Handle HEARTBEAT message"""
        logger.debug(f"Heartbeat from {client_id}")

    async def send_message(self, client_id, message):
        """Send message to client"""
        if client_id not in self.connections:
            logger.warning(f"Cannot send to disconnected client: {client_id}")
            return

        websocket = self.connections[client_id]['websocket']

        try:
            await websocket.send(json.dumps(message))
            logger.debug(f"Sent [{message['type']}] to {client_id}")
        except Exception as e:
            logger.error(f"Error sending message to {client_id}: {e}")

    async def send_error(self, client_id, error_message):
        """Send error message to client"""
        error = {
            'type': 'ERROR',
            'payload': {
                'message': error_message
            }
        }
        await self.send_message(client_id, error)

    async def broadcast(self, message):
        """Broadcast message to all connected clients"""
        logger.info(f"Broadcasting [{message['type']}] to {len(self.connections)} clients")

        for client_id in list(self.connections.keys()):
            await self.send_message(client_id, message)

    async def start(self):
        """Start the WebSocket server"""
        logger.info(f"Starting mock WebSocket server on {self.host}:{self.port}")

        async with websockets.serve(self.handle_client, self.host, self.port):
            logger.info("Server started successfully")
            logger.info(f"Listening on ws://{self.host}:{self.port}")
            logger.info("Press Ctrl+C to stop")

            # Keep server running
            await asyncio.Future()


async def simulate_server_commands(server):
    """Simulate periodic server commands for testing"""
    await asyncio.sleep(10)  # Wait for clients to connect

    while True:
        await asyncio.sleep(30)  # Every 30 seconds

        # Simulate random alert
        import random
        if random.random() < 0.3:  # 30% chance
            alert = {
                'type': 'ALERT',
                'payload': {
                    'severity': random.choice(['low', 'medium', 'high']),
                    'message': 'Random test alert',
                    'action': 'warn'
                }
            }
            await server.broadcast(alert)


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='Blockd Mock WebSocket Server')
    parser.add_argument('--host', default='localhost', help='Host to bind to')
    parser.add_argument('--port', type=int, default=8765, help='Port to bind to')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    parser.add_argument('--simulate', action='store_true', help='Simulate server commands')

    args = parser.parse_args()

    if args.debug:
        logger.setLevel(logging.DEBUG)

    server = BlockdMockServer(host=args.host, port=args.port)

    try:
        loop = asyncio.get_event_loop()

        # Start server
        server_task = loop.create_task(server.start())

        # Optionally start command simulation
        if args.simulate:
            loop.create_task(simulate_server_commands(server))

        loop.run_forever()

    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}")
    finally:
        logger.info("Shutting down...")


if __name__ == '__main__':
    main()
