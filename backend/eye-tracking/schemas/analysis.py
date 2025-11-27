"""
Pydantic Schemas for Gaze Analysis
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime
from uuid import UUID


class PatternDetectionResult(BaseModel):
    """Schema for pattern detection results"""
    is_reading: bool
    reading_confidence: Optional[float] = None
    is_drifting: bool
    max_drift_seconds: Optional[float] = None
    shifty_eyes_detected: bool
    shifty_eyes_direction: Optional[str] = None


class AnomalyResult(BaseModel):
    """Schema for anomaly detection result"""
    timestamp: datetime
    anomaly_score: float
    anomaly_type: str
    description: str


class AnalysisBatchRequest(BaseModel):
    """Request schema for batch analysis"""
    session_id: UUID
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    detect_patterns: bool = True
    detect_anomalies: bool = True

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "550e8400-e29b-41d4-a716-446655440000",
                "start_time": "2025-11-24T12:00:00Z",
                "end_time": "2025-11-24T12:30:00Z",
                "detect_patterns": True,
                "detect_anomalies": True
            }
        }


class AnalysisResponse(BaseModel):
    """Response schema for gaze analysis"""
    session_id: UUID
    analysis_timestamp: datetime
    num_gaze_points_analyzed: int

    # Pattern detection
    patterns: Optional[PatternDetectionResult] = None

    # Anomaly detection
    anomalies: Optional[List[AnomalyResult]] = None

    # Statistics
    on_screen_percentage: float
    average_confidence: float

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "550e8400-e29b-41d4-a716-446655440000",
                "analysis_timestamp": "2025-11-24T12:30:00Z",
                "num_gaze_points_analyzed": 5420,
                "patterns": {
                    "is_reading": True,
                    "reading_confidence": 0.85,
                    "is_drifting": False,
                    "shifty_eyes_detected": False
                },
                "anomalies": [],
                "on_screen_percentage": 92.3,
                "average_confidence": 0.89
            }
        }


class OffScreenEvent(BaseModel):
    """Schema for off-screen event"""
    direction: str
    duration_seconds: float
    timestamp: datetime


class RiskFactor(BaseModel):
    """Schema for risk factor"""
    factor: str
    severity: str
    description: str
    weight: float
    details: Optional[Dict] = None


class GazeStatistics(BaseModel):
    """Schema for gaze statistics"""
    total_gaze_points: int
    on_screen_points: int
    off_screen_points: int
    num_off_screen_events: int
    num_anomalies: int
    pattern_details: Optional[Dict] = None
