"""
WebRTC API Routes
Endpoints for WebRTC signaling and transport management
"""

import logging
from typing import Dict, Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
import httpx

from src.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webrtc")


# Request/Response models
class CreateTransportRequest(BaseModel):
    """Request to create WebRTC transport"""
    session_id: str = Field(..., description="Interview session UUID")
    direction: str = Field(..., description="Transport direction: 'send' or 'recv'")


class CreateTransportResponse(BaseModel):
    """Response with transport parameters"""
    transport_id: str
    ice_parameters: Dict[str, Any]
    ice_candidates: list
    dtls_parameters: Dict[str, Any]


class ConnectTransportRequest(BaseModel):
    """Request to connect WebRTC transport"""
    transport_id: str
    dtls_parameters: Dict[str, Any]


class ProduceRequest(BaseModel):
    """Request to create media producer"""
    transport_id: str
    kind: str = Field(..., description="Media kind: 'audio' or 'video'")
    rtp_parameters: Dict[str, Any]


class ProduceResponse(BaseModel):
    """Response with producer ID"""
    producer_id: str


class ConsumeRequest(BaseModel):
    """Request to create media consumer"""
    transport_id: str
    producer_id: str
    rtp_capabilities: Dict[str, Any]


class ConsumeResponse(BaseModel):
    """Response with consumer parameters"""
    consumer_id: str
    producer_id: str
    kind: str
    rtp_parameters: Dict[str, Any]


class ResumeConsumerRequest(BaseModel):
    """Request to resume consumer"""
    consumer_id: str


class RTPCapabilitiesResponse(BaseModel):
    """Response with router RTP capabilities"""
    rtp_capabilities: Dict[str, Any]


# Helper function to call mediasoup server
async def mediasoup_request(method: str, path: str, json: Dict = None) -> Dict:
    """
    Make request to mediasoup server

    Args:
        method: HTTP method
        path: API path
        json: Optional JSON payload

    Returns:
        Response JSON

    Raises:
        HTTPException: If request fails
    """
    url = f"{settings.MEDIASOUP_URL}{path}"

    try:
        async with httpx.AsyncClient() as client:
            if method == "GET":
                response = await client.get(url, timeout=10.0)
            elif method == "POST":
                response = await client.post(url, json=json, timeout=10.0)
            elif method == "DELETE":
                response = await client.delete(url, timeout=10.0)
            else:
                raise ValueError(f"Unsupported method: {method}")

            response.raise_for_status()
            return response.json()

    except httpx.HTTPStatusError as e:
        logger.error(f"mediasoup request failed: {e.response.text}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"mediasoup error: {e.response.text}"
        )
    except httpx.RequestError as e:
        logger.error(f"mediasoup request error: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"mediasoup server unavailable: {str(e)}"
        )


@router.get("/routers/{session_id}/capabilities", response_model=RTPCapabilitiesResponse)
async def get_router_capabilities(session_id: str):
    """
    Get router RTP capabilities for a session

    The client needs these capabilities to configure their RTP parameters.
    """
    logger.info(f"Getting router capabilities for session {session_id}")

    try:
        result = await mediasoup_request(
            "GET",
            f"/routers/{session_id}/capabilities"
        )

        return RTPCapabilitiesResponse(**result)

    except Exception as e:
        logger.error(f"Failed to get router capabilities: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transports", response_model=CreateTransportResponse)
async def create_transport(request: CreateTransportRequest):
    """
    Create WebRTC transport for sending or receiving media

    Send transport: Used by client to send audio/video to server
    Recv transport: Used by client to receive audio/video from server
    """
    logger.info(
        f"Creating {request.direction} transport for session {request.session_id}"
    )

    try:
        result = await mediasoup_request(
            "POST",
            "/transports",
            json={
                "session_id": request.session_id,
                "direction": request.direction
            }
        )

        return CreateTransportResponse(
            transport_id=result['id'],
            ice_parameters=result['iceParameters'],
            ice_candidates=result['iceCandidates'],
            dtls_parameters=result['dtlsParameters']
        )

    except Exception as e:
        logger.error(f"Failed to create transport: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transports/{transport_id}/connect")
async def connect_transport(transport_id: str, request: ConnectTransportRequest):
    """
    Connect WebRTC transport with DTLS parameters

    Called after client receives transport parameters and establishes ICE connection.
    """
    logger.info(f"Connecting transport {transport_id}")

    try:
        await mediasoup_request(
            "POST",
            f"/transports/{transport_id}/connect",
            json={
                "dtlsParameters": request.dtls_parameters
            }
        )

        return {"success": True}

    except Exception as e:
        logger.error(f"Failed to connect transport: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transports/{transport_id}/produce", response_model=ProduceResponse)
async def create_producer(transport_id: str, request: ProduceRequest):
    """
    Create media producer (audio or video)

    Called when client starts sending media through send transport.
    """
    logger.info(f"Creating {request.kind} producer on transport {transport_id}")

    try:
        result = await mediasoup_request(
            "POST",
            f"/transports/{transport_id}/produce",
            json={
                "kind": request.kind,
                "rtpParameters": request.rtp_parameters
            }
        )

        return ProduceResponse(producer_id=result['producerId'])

    except Exception as e:
        logger.error(f"Failed to create producer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transports/{transport_id}/consume", response_model=ConsumeResponse)
async def create_consumer(transport_id: str, request: ConsumeRequest):
    """
    Create media consumer to receive media from producer

    Called when client wants to receive media from another participant.
    """
    logger.info(
        f"Creating consumer for producer {request.producer_id} on transport {transport_id}"
    )

    try:
        result = await mediasoup_request(
            "POST",
            f"/transports/{transport_id}/consume",
            json={
                "producerId": request.producer_id,
                "rtpCapabilities": request.rtp_capabilities
            }
        )

        return ConsumeResponse(
            consumer_id=result['id'],
            producer_id=result['producerId'],
            kind=result['kind'],
            rtp_parameters=result['rtpParameters']
        )

    except Exception as e:
        logger.error(f"Failed to create consumer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/consumers/{consumer_id}/resume")
async def resume_consumer(consumer_id: str):
    """
    Resume paused consumer

    Consumers are created in paused state and must be resumed to receive media.
    """
    logger.info(f"Resuming consumer {consumer_id}")

    try:
        await mediasoup_request(
            "POST",
            f"/consumers/{consumer_id}/resume"
        )

        return {"success": True}

    except Exception as e:
        logger.error(f"Failed to resume consumer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sessions/{session_id}")
async def close_session(session_id: str):
    """
    Close WebRTC session and cleanup resources

    Closes all transports, producers, and consumers for the session.
    """
    logger.info(f"Closing WebRTC session {session_id}")

    try:
        await mediasoup_request(
            "DELETE",
            f"/sessions/{session_id}"
        )

        return {"success": True}

    except Exception as e:
        logger.error(f"Failed to close session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/{session_id}")
async def get_session_stats(session_id: str):
    """
    Get statistics for WebRTC session

    Returns information about transports, producers, and consumers.
    """
    logger.info(f"Getting stats for session {session_id}")

    try:
        # This would need to be implemented in mediasoup server
        # For now, return a placeholder
        return {
            "session_id": session_id,
            "message": "Stats endpoint not yet implemented"
        }

    except Exception as e:
        logger.error(f"Failed to get session stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))
