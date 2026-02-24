"""
Audio analysis endpoints

This module provides both public async endpoints and internal sync endpoints:
- Public: POST /analyze - Dispatches async job, returns immediately
- Public: GET /status/{job_id} - Check job status and results
- Internal: POST /internal/* - Called by Celery workers (protected by service token)
"""

import json
import logging
import os
from typing import Optional
from datetime import datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
import redis

from src.database import get_db
from src.config import get_settings
from schemas.analysis import (
    AnalysisRequest,
    TimingMetrics,
    TranscriptionResult,
    AnomalyResult
)
from services.transcription import TranscriptionService
from services.audio_processing import AudioProcessingService
from services.timing_analysis import TimingAnalysisService
from services.pause_detection import PauseDetectionService
from services.filler_detection import FillerDetectionService
from services.anomaly_detection import AnomalyDetectionService
from lib.audio_utils import download_audio_from_s3, cleanup_temp_files
from lib.errors import TimingServiceError
from lib.circuit_breaker import whisper_breaker, s3_breaker, CircuitOpenError

logger = logging.getLogger(__name__)

router = APIRouter()

# Redis configuration for job status
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
REDIS_DB = int(os.getenv('REDIS_DB', '0'))
JOB_STATUS_PREFIX = 'timing_job:'

# Internal service token for worker authentication
INTERNAL_SERVICE_TOKEN = os.getenv('INTERNAL_SERVICE_TOKEN')
if not INTERNAL_SERVICE_TOKEN:
    raise RuntimeError('INTERNAL_SERVICE_TOKEN environment variable must be set')


async def verify_internal_token(
    x_internal_token: Optional[str] = Header(None, alias="X-Internal-Token")
):
    """
    Verify internal service token for worker-to-service communication.

    This provides basic protection for internal endpoints. In production,
    this should be combined with network policies that restrict access
    to internal endpoints from only the Kubernetes pod network.
    """
    if not x_internal_token:
        raise HTTPException(
            status_code=401,
            detail="Missing X-Internal-Token header"
        )

    if x_internal_token != INTERNAL_SERVICE_TOKEN:
        logger.warning(f"Invalid internal token attempt")
        raise HTTPException(
            status_code=403,
            detail="Invalid internal service token"
        )

    return True


def get_redis_client():
    """Get Redis client for job status"""
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        decode_responses=True,
    )


# =============================================================================
# Public Endpoints
# =============================================================================


class AsyncAnalysisResponse(BaseModel):
    """Response for async analysis job dispatch"""
    job_id: str
    status: str
    message: str
    status_url: str


@router.post("/analyze", response_model=AsyncAnalysisResponse)
async def analyze_audio(
    request: AnalysisRequest,
    db: Session = Depends(get_db)
):
    """
    Submit audio for async timing analysis.

    This endpoint dispatches the analysis to a background worker and returns
    immediately with a job ID. Use the status endpoint to poll for results.

    Args:
        request: Analysis request with audio URL and metadata

    Returns:
        Job ID and status URL for polling
    """
    settings = get_settings()
    job_id = str(uuid4())

    try:
        logger.info(f"Submitting analysis job {job_id} for question {request.question_id}")

        # Import Celery app and dispatch task
        from celery import Celery

        # Create Celery client to send task
        celery_app = Celery('blockd')
        celery_app.conf.update(
            broker_url=settings.RABBITMQ_URL,
            result_backend=f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}",
        )

        # Dispatch the task
        celery_app.send_task(
            'tasks.timing.analyze',
            kwargs={
                'job_id': job_id,
                'question_id': str(request.question_id),
                'audio_url': request.audio_url,
                'question_asked_at': request.question_asked_at.isoformat() if request.question_asked_at else None,
                'answer_start_timestamp': request.answer_start_timestamp.isoformat() if request.answer_start_timestamp else None,
                'difficulty': request.difficulty or 'medium',
                'session_id': str(request.session_id) if hasattr(request, 'session_id') and request.session_id else None,
            },
            queue='timing_analyze',
            routing_key=f'timing.analyze.{job_id}',
        )

        logger.info(f"Job {job_id} dispatched successfully")

        return AsyncAnalysisResponse(
            job_id=job_id,
            status='pending',
            message='Analysis job submitted. Poll status endpoint for results.',
            status_url=f'/api/v1/timing/status/{job_id}'
        )

    except Exception as e:
        logger.error(f"Failed to submit analysis job: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to submit analysis job: {str(e)}"
        )


class JobStatusResponse(BaseModel):
    """Response for job status check"""
    job_id: str
    status: str
    progress: int = 0
    message: str = ""
    result: Optional[dict] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


@router.get("/status/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    db: Session = Depends(get_db)
):
    """
    Get status of an analysis job.

    Args:
        job_id: Job ID returned from /analyze endpoint

    Returns:
        Job status, progress, and results if complete
    """
    try:
        # First check Redis for job status
        redis_client = get_redis_client()
        job_data = redis_client.get(f"{JOB_STATUS_PREFIX}{job_id}")

        if job_data:
            data = json.loads(job_data)
            return JobStatusResponse(
                job_id=job_id,
                status=data.get('status', 'unknown'),
                progress=data.get('progress', 0),
                message=data.get('message', ''),
                result=data.get('result'),
                updated_at=data.get('updated_at')
            )

        # Fallback: Check database for completed analysis
        query = text("""
            SELECT
                aa.id,
                aa.question_id,
                aa.response_timing,
                aa.risk_score,
                aa.analyzed_at,
                aa.metadata
            FROM answer_analysis aa
            WHERE aa.metadata->>'job_id' = :job_id
            LIMIT 1
        """)

        result = db.execute(query, {'job_id': job_id}).fetchone()

        if result:
            return JobStatusResponse(
                job_id=job_id,
                status='completed',
                progress=100,
                message='Analysis complete',
                result={
                    'question_id': str(result[1]),
                    'response_timing': result[2],
                    'risk_score': float(result[3]) if result[3] else None,
                    'analyzed_at': result[4].isoformat() if result[4] else None,
                },
                updated_at=result[4].isoformat() if result[4] else None
            )

        # Job not found
        raise HTTPException(
            status_code=404,
            detail=f"Job {job_id} not found. It may have expired or never existed."
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get job status: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get job status: {str(e)}"
        )


# =============================================================================
# Internal Endpoints (called by Celery workers)
# =============================================================================


class ProcessAudioRequest(BaseModel):
    audio_path: str


class ProcessAudioResponse(BaseModel):
    processed_path: str
    duration: float


@router.post("/internal/process-audio", response_model=ProcessAudioResponse)
async def internal_process_audio(
    request: ProcessAudioRequest,
    _: bool = Depends(verify_internal_token)
):
    """
    Internal endpoint: Process and validate audio file.
    Called by Celery worker. Protected by internal service token.
    """
    try:
        audio_service = AudioProcessingService()

        await audio_service.validate_audio_file(request.audio_path)
        processed_path = await audio_service.process_audio(request.audio_path)
        duration = await audio_service.get_audio_duration(processed_path)

        return ProcessAudioResponse(
            processed_path=processed_path,
            duration=duration
        )

    except Exception as e:
        logger.error(f"Audio processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class TranscribeRequest(BaseModel):
    audio_path: str


@router.post("/internal/transcribe")
async def internal_transcribe(
    request: TranscribeRequest,
    _: bool = Depends(verify_internal_token)
):
    """
    Internal endpoint: Transcribe audio using Whisper.
    Called by Celery worker. Protected by internal token and circuit breaker.
    """
    try:
        transcription_service = TranscriptionService()

        # Use circuit breaker for Whisper API
        async def do_transcription():
            return await transcription_service.transcribe_audio(request.audio_path)

        try:
            result = await whisper_breaker.call(do_transcription)
        except CircuitOpenError as e:
            logger.error(f"Whisper circuit breaker open: {e}")
            raise HTTPException(
                status_code=503,
                detail="Whisper API temporarily unavailable. Please retry later."
            )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class DetectPausesRequest(BaseModel):
    audio_path: str
    duration: float


@router.post("/internal/detect-pauses")
async def internal_detect_pauses(
    request: DetectPausesRequest,
    _: bool = Depends(verify_internal_token)
):
    """
    Internal endpoint: Detect pauses in audio.
    Called by Celery worker. Protected by internal service token.
    """
    try:
        audio_service = AudioProcessingService()
        pause_service = PauseDetectionService()

        audio_data, sample_rate = await audio_service.load_audio_for_analysis(request.audio_path)
        pauses = await pause_service.detect_pauses(audio_data, sample_rate)
        metrics = pause_service.calculate_pause_metrics(pauses, request.duration)
        patterns = pause_service.detect_unnatural_pause_patterns(pauses)

        return {
            'pauses': pauses,
            'metrics': metrics,
            'patterns': patterns,
        }

    except Exception as e:
        logger.error(f"Pause detection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class DetectFillersRequest(BaseModel):
    words: list
    duration: float


@router.post("/internal/detect-fillers")
async def internal_detect_fillers(
    request: DetectFillersRequest,
    _: bool = Depends(verify_internal_token)
):
    """
    Internal endpoint: Detect filler words.
    Called by Celery worker. Protected by internal service token.
    """
    try:
        filler_service = FillerDetectionService()

        detection = filler_service.detect_filler_words(request.words)
        distribution = filler_service.analyze_filler_distribution(
            detection['filler_instances'],
            request.duration
        )
        absence = filler_service.detect_unnatural_filler_absence(
            detection['filler_ratio'],
            request.duration
        )

        return {
            'detection': detection,
            'distribution': distribution,
            'absence_analysis': absence,
        }

    except Exception as e:
        logger.error(f"Filler detection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class CalculateMetricsRequest(BaseModel):
    transcription: dict
    pauses: dict
    fillers: dict
    duration: float
    question_asked_at: Optional[str] = None
    answer_start_timestamp: Optional[str] = None
    difficulty: str = "medium"


@router.post("/internal/calculate-metrics")
async def internal_calculate_metrics(
    request: CalculateMetricsRequest,
    _: bool = Depends(verify_internal_token)
):
    """
    Internal endpoint: Calculate timing metrics and anomalies.
    Called by Celery worker. Protected by internal service token.
    """
    try:
        timing_service = TimingAnalysisService()
        anomaly_service = AnomalyDetectionService()

        # Parse timestamps
        question_asked_at = None
        answer_start_timestamp = None

        if request.question_asked_at:
            question_asked_at = datetime.fromisoformat(request.question_asked_at.replace('Z', '+00:00'))
        if request.answer_start_timestamp:
            answer_start_timestamp = datetime.fromisoformat(request.answer_start_timestamp.replace('Z', '+00:00'))

        # Calculate response latency
        response_latency_ms = 0
        if question_asked_at and answer_start_timestamp:
            response_latency_ms = timing_service.calculate_response_latency(
                question_asked_at,
                answer_start_timestamp
            )

        # Speech duration
        words = request.transcription.get('words', [])
        pauses_list = request.pauses.get('pauses', [])

        speech_duration_calc = timing_service.calculate_speech_duration(
            words,
            pauses_list,
            request.duration
        )

        # Speech rate
        speech_rate_wpm = timing_service.calculate_speech_rate(
            words,
            speech_duration_calc['speech_duration'],
            exclude_fillers=True
        )

        # Timing patterns
        timing_patterns = timing_service.analyze_timing_patterns(words, pauses_list)

        # Latency evaluation
        latency_eval = timing_service.evaluate_latency_against_baseline(
            response_latency_ms,
            request.difficulty
        )

        # Build metrics for anomaly detection
        pause_metrics = request.pauses.get('metrics', {})
        filler_detection = request.fillers.get('detection', {})
        pause_patterns = request.pauses.get('patterns', {})

        timing_metrics_for_anomaly = {
            'speech_rate_wpm': speech_rate_wpm,
            'pause_percentage': pause_metrics.get('pause_percentage', 0),
            'pause_count': pause_metrics.get('pause_count', 0),
            'pause_duration_std': pause_metrics.get('pause_duration_std', 0)
        }

        filler_analysis_for_anomaly = {
            'filler_ratio': filler_detection.get('filler_ratio', 0),
            'total_words': filler_detection.get('total_words', 0)
        }

        pause_patterns_for_anomaly = {
            'consistency_score': pause_patterns.get('consistency_score', 0),
            'regular_spacing': pause_patterns.get('regular_spacing', False),
            'uniform_duration': pause_patterns.get('uniform_duration', False),
            'pause_percentage': pause_metrics.get('pause_percentage', 0)
        }

        # Detect anomalies
        anomalies = anomaly_service.detect_all_anomalies(
            timing_metrics_for_anomaly,
            latency_eval,
            pause_patterns_for_anomaly,
            filler_analysis_for_anomaly,
            request.difficulty
        )

        # Calculate risk score
        risk_result = anomaly_service.calculate_risk_score(anomalies)

        return {
            'timing_metrics': {
                'response_latency_ms': response_latency_ms,
                'speech_duration_seconds': speech_duration_calc['speech_duration'],
                'total_duration_seconds': request.duration,
                'speech_rate_wpm': speech_rate_wpm,
                'pause_count': pause_metrics.get('pause_count', 0),
                'pause_percentage': pause_metrics.get('pause_percentage', 0),
                'avg_pause_duration_seconds': pause_metrics.get('avg_pause_duration', 0),
                'filler_word_count': filler_detection.get('filler_count', 0),
                'filler_word_ratio': filler_detection.get('filler_ratio', 0),
            },
            'anomalies': anomalies,
            'risk_score': risk_result['risk_score'],
            'recommendation': risk_result['recommendation'],
        }

    except Exception as e:
        logger.error(f"Metrics calculation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class SaveResultRequest(BaseModel):
    question_id: str
    transcription: dict
    analysis: dict


@router.post("/internal/save-result")
async def internal_save_result(
    request: SaveResultRequest,
    db: Session = Depends(get_db),
    _: bool = Depends(verify_internal_token)
):
    """
    Internal endpoint: Save analysis result to database.
    Called by Celery worker. Protected by internal service token.
    """
    try:
        response_timing_data = {
            'response_latency_ms': request.analysis['timing_metrics'].get('response_latency_ms', 0),
            'speech_duration_seconds': request.analysis['timing_metrics'].get('speech_duration_seconds', 0),
            'total_duration_seconds': request.analysis['timing_metrics'].get('total_duration_seconds', 0),
            'speech_rate_wpm': request.analysis['timing_metrics'].get('speech_rate_wpm', 0),
            'pause_count': request.analysis['timing_metrics'].get('pause_count', 0),
            'pause_percentage': request.analysis['timing_metrics'].get('pause_percentage', 0),
            'avg_pause_duration_seconds': request.analysis['timing_metrics'].get('avg_pause_duration_seconds', 0),
            'filler_word_count': request.analysis['timing_metrics'].get('filler_word_count', 0),
            'filler_word_ratio': request.analysis['timing_metrics'].get('filler_word_ratio', 0),
            'anomalies': request.analysis.get('anomalies', {}),
            'risk_score': request.analysis.get('risk_score', 0),
        }

        query = text("""
            UPDATE answer_analysis
            SET
                transcription_text = :transcription_text,
                response_timing = :response_timing::jsonb,
                risk_score = :risk_score,
                metadata = jsonb_set(
                    COALESCE(metadata, '{}'::jsonb),
                    '{timing_analysis}',
                    :metadata::jsonb
                ),
                analyzed_at = NOW()
            WHERE question_id = :question_id
        """)

        db.execute(query, {
            'question_id': request.question_id,
            'transcription_text': request.transcription.get('text', ''),
            'response_timing': json.dumps(response_timing_data),
            'risk_score': request.analysis.get('risk_score', 0),
            'metadata': json.dumps({
                'analyzed_at': datetime.utcnow().isoformat(),
                'transcription_confidence': request.transcription.get('confidence', 0),
                'language': request.transcription.get('language', 'en'),
            })
        })
        db.commit()

        return {'status': 'saved'}

    except Exception as e:
        logger.error(f"Failed to save result: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
