"""
Pydantic Schemas for Gaze Session Summaries
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID

from .analysis import OffScreenEvent, AnomalyResult, RiskFactor, GazeStatistics


class PatternsDetected(BaseModel):
    """Schema for detected patterns"""
    reading: bool
    attention_drift: bool
    shifty_eyes: dict = Field(..., description="Shifty eyes detection result")


class SummaryRequest(BaseModel):
    """Request schema for session summary"""
    session_id: UUID
    generate_heatmap: bool = True

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "550e8400-e29b-41d4-a716-446655440000",
                "generate_heatmap": True
            }
        }


class SummaryResponse(BaseModel):
    """Response schema for session summary"""
    session_id: str
    total_duration_seconds: float
    on_screen_percentage: float
    off_screen_events: List[OffScreenEvent]
    patterns_detected: PatternsDetected
    anomalies: List[AnomalyResult]
    heatmap_url: Optional[str]
    average_confidence: float
    risk_score: float = Field(..., ge=0, le=1)
    risk_factors: List[RiskFactor]
    statistics: GazeStatistics

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "550e8400-e29b-41d4-a716-446655440000",
                "total_duration_seconds": 1800.0,
                "on_screen_percentage": 87.5,
                "off_screen_events": [
                    {
                        "direction": "left",
                        "duration_seconds": 5.2,
                        "timestamp": "2025-11-24T12:05:30Z"
                    }
                ],
                "patterns_detected": {
                    "reading": True,
                    "attention_drift": False,
                    "shifty_eyes": {
                        "detected": False,
                        "direction": None
                    }
                },
                "anomalies": [],
                "heatmap_url": "/heatmaps/550e8400-e29b-41d4-a716-446655440000_heatmap.png",
                "average_confidence": 0.91,
                "risk_score": 0.45,
                "risk_factors": [
                    {
                        "factor": "reading_pattern_detected",
                        "severity": "high",
                        "description": "Reading pattern suggests external reference material usage",
                        "weight": 0.4
                    }
                ],
                "statistics": {
                    "total_gaze_points": 54000,
                    "on_screen_points": 47250,
                    "off_screen_points": 6750,
                    "num_off_screen_events": 12,
                    "num_anomalies": 0
                }
            }
        }


class SessionListItem(BaseModel):
    """Schema for session list item"""
    session_id: UUID
    user_id: UUID
    started_at: str
    ended_at: Optional[str]
    duration_seconds: Optional[float]
    risk_score: Optional[float]
    is_calibrated: bool


class SessionListResponse(BaseModel):
    """Response schema for session list"""
    sessions: List[SessionListItem]
    total_count: int
    page: int
    page_size: int
