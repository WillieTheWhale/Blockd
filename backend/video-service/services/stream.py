"""
Stream Management Service
Manages WebRTC stream sessions, participants, and state
"""

import logging
from typing import Dict, List, Optional, Set
from datetime import datetime
from uuid import UUID
import asyncio

from src.config import settings

logger = logging.getLogger(__name__)


class StreamError(Exception):
    """Base exception for stream errors"""
    pass


class StreamSession:
    """Represents a streaming session"""

    def __init__(self, session_id: str, interviewer_id: str, candidate_id: str):
        self.session_id = session_id
        self.interviewer_id = interviewer_id
        self.candidate_id = candidate_id
        self.created_at = datetime.utcnow()
        self.started_at: Optional[datetime] = None
        self.ended_at: Optional[datetime] = None

        # Participant tracking
        self.connected_participants: Set[str] = set()
        self.producer_ids: Dict[str, List[str]] = {}  # user_id -> [producer_ids]
        self.consumer_ids: Dict[str, List[str]] = {}  # user_id -> [consumer_ids]
        self.transport_ids: Dict[str, List[str]] = {}  # user_id -> [transport_ids]

        # Stream state
        self.is_active = False
        self.is_recording = False

    def add_participant(self, user_id: str):
        """Add participant to session"""
        self.connected_participants.add(user_id)
        logger.info(f"Participant {user_id} joined session {self.session_id}")

    def remove_participant(self, user_id: str):
        """Remove participant from session"""
        self.connected_participants.discard(user_id)
        logger.info(f"Participant {user_id} left session {self.session_id}")

    def add_producer(self, user_id: str, producer_id: str):
        """Track producer for user"""
        if user_id not in self.producer_ids:
            self.producer_ids[user_id] = []
        self.producer_ids[user_id].append(producer_id)

    def add_consumer(self, user_id: str, consumer_id: str):
        """Track consumer for user"""
        if user_id not in self.consumer_ids:
            self.consumer_ids[user_id] = []
        self.consumer_ids[user_id].append(consumer_id)

    def add_transport(self, user_id: str, transport_id: str):
        """Track transport for user"""
        if user_id not in self.transport_ids:
            self.transport_ids[user_id] = []
        self.transport_ids[user_id].append(transport_id)

    def get_participant_count(self) -> int:
        """Get number of connected participants"""
        return len(self.connected_participants)

    def is_participant_connected(self, user_id: str) -> bool:
        """Check if participant is connected"""
        return user_id in self.connected_participants

    def get_session_info(self) -> Dict:
        """Get session information"""
        return {
            'session_id': self.session_id,
            'interviewer_id': self.interviewer_id,
            'candidate_id': self.candidate_id,
            'created_at': self.created_at.isoformat(),
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'ended_at': self.ended_at.isoformat() if self.ended_at else None,
            'is_active': self.is_active,
            'is_recording': self.is_recording,
            'participant_count': self.get_participant_count(),
            'connected_participants': list(self.connected_participants),
            'producer_count': sum(len(p) for p in self.producer_ids.values()),
            'consumer_count': sum(len(c) for c in self.consumer_ids.values()),
        }


class StreamManager:
    """Manages all active stream sessions"""

    def __init__(self):
        self.active_sessions: Dict[str, StreamSession] = {}
        self._lock = asyncio.Lock()

    async def create_session(
        self,
        session_id: str,
        interviewer_id: str,
        candidate_id: str
    ) -> StreamSession:
        """
        Create new stream session

        Args:
            session_id: Interview session UUID
            interviewer_id: Interviewer user ID
            candidate_id: Candidate user ID

        Returns:
            StreamSession instance
        """
        async with self._lock:
            if session_id in self.active_sessions:
                logger.warning(f"Session {session_id} already exists")
                return self.active_sessions[session_id]

            # Check concurrent limit
            if len(self.active_sessions) >= settings.MAX_CONCURRENT_STREAMS:
                raise StreamError(
                    f"Maximum concurrent streams reached ({settings.MAX_CONCURRENT_STREAMS})"
                )

            session = StreamSession(session_id, interviewer_id, candidate_id)
            self.active_sessions[session_id] = session

            logger.info(
                f"Created stream session {session_id} "
                f"(interviewer: {interviewer_id}, candidate: {candidate_id})"
            )

            return session

    async def get_session(self, session_id: str) -> Optional[StreamSession]:
        """Get stream session by ID"""
        return self.active_sessions.get(session_id)

    async def start_session(self, session_id: str):
        """Mark session as started"""
        session = self.active_sessions.get(session_id)
        if not session:
            raise StreamError(f"Session {session_id} not found")

        session.is_active = True
        session.started_at = datetime.utcnow()

        logger.info(f"Started stream session {session_id}")

    async def end_session(self, session_id: str):
        """End stream session and cleanup"""
        async with self._lock:
            session = self.active_sessions.get(session_id)
            if not session:
                logger.warning(f"Session {session_id} not found")
                return

            session.is_active = False
            session.ended_at = datetime.utcnow()

            # Cleanup mediasoup resources
            await self._cleanup_mediasoup_session(session_id)

            # Remove from active sessions
            del self.active_sessions[session_id]

            duration = (session.ended_at - session.started_at).total_seconds() if session.started_at else 0

            logger.info(
                f"Ended stream session {session_id} "
                f"(duration: {duration:.1f}s, participants: {session.get_participant_count()})"
            )

    async def add_participant(self, session_id: str, user_id: str):
        """Add participant to session"""
        session = self.active_sessions.get(session_id)
        if not session:
            raise StreamError(f"Session {session_id} not found")

        session.add_participant(user_id)

    async def remove_participant(self, session_id: str, user_id: str):
        """Remove participant from session"""
        session = self.active_sessions.get(session_id)
        if not session:
            logger.warning(f"Session {session_id} not found")
            return

        session.remove_participant(user_id)

        # End session if no participants remain
        if session.get_participant_count() == 0:
            logger.info(f"No participants remaining, ending session {session_id}")
            await self.end_session(session_id)

    async def list_active_sessions(self) -> List[Dict]:
        """Get list of all active sessions"""
        return [
            session.get_session_info()
            for session in self.active_sessions.values()
        ]

    async def get_session_stats(self) -> Dict:
        """Get statistics for all sessions"""
        total_participants = sum(
            session.get_participant_count()
            for session in self.active_sessions.values()
        )

        total_producers = sum(
            sum(len(p) for p in session.producer_ids.values())
            for session in self.active_sessions.values()
        )

        total_consumers = sum(
            sum(len(c) for c in session.consumer_ids.values())
            for session in self.active_sessions.values()
        )

        return {
            'active_sessions': len(self.active_sessions),
            'total_participants': total_participants,
            'total_producers': total_producers,
            'total_consumers': total_consumers,
            'max_concurrent_streams': settings.MAX_CONCURRENT_STREAMS,
        }

    async def _cleanup_mediasoup_session(self, session_id: str):
        """Cleanup mediasoup resources for session"""
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    f"{settings.MEDIASOUP_URL}/sessions/{session_id}",
                    timeout=5.0
                )
                if response.status_code == 200:
                    logger.info(f"Cleaned up mediasoup resources for session {session_id}")
                else:
                    logger.warning(
                        f"Failed to cleanup mediasoup session {session_id}: "
                        f"{response.status_code}"
                    )
        except Exception as e:
            logger.error(f"Error cleaning up mediasoup session {session_id}: {e}")

    async def cleanup_all_sessions(self):
        """Cleanup all active sessions (for shutdown)"""
        logger.info(f"Cleaning up {len(self.active_sessions)} active sessions")

        for session_id in list(self.active_sessions.keys()):
            try:
                await self.end_session(session_id)
            except Exception as e:
                logger.error(f"Error ending session {session_id}: {e}")
