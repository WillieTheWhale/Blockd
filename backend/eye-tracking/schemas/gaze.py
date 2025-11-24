"""
Pydantic Schemas for Gaze Data
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class GazeFrameRequest(BaseModel):
    """Request schema for processing a gaze frame"""
    session_id: UUID
    frame: str = Field(..., description="Base64-encoded image frame")
    timestamp: Optional[datetime] = None

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "550e8400-e29b-41d4-a716-446655440000",
                "frame": "base64_encoded_image_data...",
                "timestamp": "2025-11-24T12:00:00Z"
            }
        }


class GazeDataResponse(BaseModel):
    """Response schema for gaze data"""
    session_id: UUID
    gaze_x: float = Field(..., ge=0, le=1, description="Normalized gaze X coordinate (0-1)")
    gaze_y: float = Field(..., ge=0, le=1, description="Normalized gaze Y coordinate (0-1)")
    is_off_screen: bool
    off_screen_direction: Optional[str] = Field(None, description="left, right, up, down")
    confidence: float = Field(..., ge=0, le=1)
    timestamp: datetime

    # Optional detailed data
    gaze_vector_x: Optional[float] = None
    gaze_vector_y: Optional[float] = None
    gaze_vector_z: Optional[float] = None
    head_pitch: Optional[float] = None
    head_yaw: Optional[float] = None
    head_roll: Optional[float] = None
    is_filtered: Optional[bool] = None

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "550e8400-e29b-41d4-a716-446655440000",
                "gaze_x": 0.52,
                "gaze_y": 0.48,
                "is_off_screen": False,
                "off_screen_direction": None,
                "confidence": 0.92,
                "timestamp": "2025-11-24T12:00:00Z"
            }
        }


class CalibrationPointRequest(BaseModel):
    """Schema for calibration point"""
    ground_truth_x: float = Field(..., ge=0, le=1)
    ground_truth_y: float = Field(..., ge=0, le=1)
    observed_x: float = Field(..., ge=0, le=1)
    observed_y: float = Field(..., ge=0, le=1)


class CalibrationRequest(BaseModel):
    """Request schema for gaze calibration"""
    session_id: UUID
    calibration_points: List[CalibrationPointRequest] = Field(
        ..., min_length=4, description="At least 4 calibration points required"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "550e8400-e29b-41d4-a716-446655440000",
                "calibration_points": [
                    {"ground_truth_x": 0.1, "ground_truth_y": 0.1, "observed_x": 0.12, "observed_y": 0.11},
                    {"ground_truth_x": 0.9, "ground_truth_y": 0.1, "observed_x": 0.88, "observed_y": 0.12},
                    {"ground_truth_x": 0.1, "ground_truth_y": 0.9, "observed_x": 0.11, "observed_y": 0.89},
                    {"ground_truth_x": 0.9, "ground_truth_y": 0.9, "observed_x": 0.87, "observed_y": 0.88}
                ]
            }
        }


class CalibrationResponse(BaseModel):
    """Response schema for calibration"""
    session_id: UUID
    success: bool
    message: str
    calibration_applied: bool


class GazeSessionStart(BaseModel):
    """Schema for starting a gaze session"""
    session_id: UUID
    user_id: UUID
    camera_resolution_width: Optional[int] = None
    camera_resolution_height: Optional[int] = None
    screen_resolution_width: Optional[int] = None
    screen_resolution_height: Optional[int] = None


class GazeSessionEnd(BaseModel):
    """Schema for ending a gaze session"""
    session_id: UUID


class StreamConnectionRequest(BaseModel):
    """Request to establish WebSocket stream"""
    session_id: UUID
    user_id: UUID


class StreamFrameMessage(BaseModel):
    """WebSocket message for streaming frame"""
    message_type: str = "frame"
    session_id: UUID
    frame: str
    timestamp: Optional[datetime] = None


class StreamGazeMessage(BaseModel):
    """WebSocket message for gaze data"""
    message_type: str = "gaze"
    session_id: UUID
    gaze_x: float
    gaze_y: float
    is_off_screen: bool
    off_screen_direction: Optional[str]
    confidence: float
    timestamp: datetime


class StreamErrorMessage(BaseModel):
    """WebSocket error message"""
    message_type: str = "error"
    error: str
    timestamp: datetime


class StreamStatsMessage(BaseModel):
    """WebSocket stats message"""
    message_type: str = "stats"
    fps: float
    latency_ms: float
    frames_processed: int
    timestamp: datetime
