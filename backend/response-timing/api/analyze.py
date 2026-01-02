"""Audio analysis endpoints"""

import logging
import os
import tempfile
from typing import Optional
from datetime import datetime
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text

from src.database import get_db
from src.config import get_settings
from schemas.analysis import (
    AnalysisRequest,
    AnalysisResponse,
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

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_audio(
    request: AnalysisRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Analyze audio for timing metrics and anomalies

    Args:
        request: Analysis request with audio URL and metadata
        background_tasks: FastAPI background tasks
        db: Database session

    Returns:
        Complete timing analysis with transcription, metrics, and anomalies
    """
    settings = get_settings()
    analysis_id = uuid4()
    temp_files = []

    try:
        logger.info(f"Starting analysis {analysis_id} for question {request.question_id}")

        # Initialize services
        transcription_service = TranscriptionService()
        audio_service = AudioProcessingService()
        timing_service = TimingAnalysisService()
        pause_service = PauseDetectionService()
        filler_service = FillerDetectionService()
        anomaly_service = AnomalyDetectionService()

        # Step 1: Download audio from S3
        logger.info(f"Downloading audio from {request.audio_url}")
        audio_path = await download_audio_from_s3(request.audio_url)
        temp_files.append(audio_path)

        # Step 2: Validate and process audio
        logger.info("Validating audio file")
        await audio_service.validate_audio_file(audio_path)

        logger.info("Processing audio")
        processed_audio_path = await audio_service.process_audio(audio_path)
        temp_files.append(processed_audio_path)

        # Get audio duration
        total_duration = await audio_service.get_audio_duration(processed_audio_path)

        # Step 3: Transcribe audio
        logger.info("Transcribing audio")
        transcription = await transcription_service.transcribe_audio(processed_audio_path)

        if not transcription:
            raise TimingServiceError(
                "Transcription failed",
                {"audio_url": request.audio_url}
            )

        # Step 4: Load audio for analysis
        logger.info("Loading audio for pause detection")
        audio_data, sample_rate = await audio_service.load_audio_for_analysis(processed_audio_path)

        # Step 5: Detect pauses
        logger.info("Detecting pauses")
        pauses = await pause_service.detect_pauses(audio_data, sample_rate)
        pause_metrics = pause_service.calculate_pause_metrics(pauses, total_duration)
        pause_patterns = pause_service.detect_unnatural_pause_patterns(pauses)

        # Step 6: Detect filler words
        logger.info("Detecting filler words")
        filler_detection = filler_service.detect_filler_words(transcription['words'])
        filler_distribution = filler_service.analyze_filler_distribution(
            filler_detection['filler_instances'],
            total_duration
        )
        filler_absence = filler_service.detect_unnatural_filler_absence(
            filler_detection['filler_ratio'],
            total_duration
        )

        # Step 7: Calculate timing metrics
        logger.info("Calculating timing metrics")

        # Response latency
        response_latency_ms = timing_service.calculate_response_latency(
            request.question_asked_at,
            request.answer_start_timestamp
        )

        # Speech duration (total - pauses)
        speech_duration_calc = timing_service.calculate_speech_duration(
            transcription['words'],
            pauses,
            total_duration
        )

        # Speech rate (WPM)
        speech_rate_wpm = timing_service.calculate_speech_rate(
            transcription['words'],
            speech_duration_calc['speech_duration'],
            exclude_fillers=True
        )

        # Timing patterns
        timing_patterns = timing_service.analyze_timing_patterns(
            transcription['words'],
            pauses
        )

        # Latency evaluation
        latency_eval = timing_service.evaluate_latency_against_baseline(
            response_latency_ms,
            request.difficulty
        )

        # Step 8: Detect anomalies
        logger.info("Detecting anomalies")
        timing_metrics_for_anomaly = {
            'speech_rate_wpm': speech_rate_wpm,
            'pause_percentage': pause_metrics['pause_percentage'],
            'pause_count': pause_metrics['pause_count'],
            'pause_duration_std': pause_metrics['pause_duration_std']
        }

        filler_analysis_for_anomaly = {
            'filler_ratio': filler_detection['filler_ratio'],
            'total_words': filler_detection['total_words']
        }

        pause_patterns_for_anomaly = {
            'consistency_score': pause_patterns['consistency_score'],
            'regular_spacing': pause_patterns['regular_spacing'],
            'uniform_duration': pause_patterns['uniform_duration'],
            'pause_percentage': pause_metrics['pause_percentage']
        }

        anomalies = anomaly_service.detect_all_anomalies(
            timing_metrics_for_anomaly,
            latency_eval,
            pause_patterns_for_anomaly,
            filler_analysis_for_anomaly,
            request.difficulty
        )

        # Calculate risk score
        risk_result = anomaly_service.calculate_risk_score(anomalies)

        # Step 9: Save to database
        logger.info("Saving analysis to database")
        response_timing_data = {
            'response_latency_ms': response_latency_ms,
            'speech_duration_seconds': speech_duration_calc['speech_duration'],
            'total_duration_seconds': total_duration,
            'speech_rate_wpm': speech_rate_wpm,
            'pause_count': pause_metrics['pause_count'],
            'pause_percentage': pause_metrics['pause_percentage'],
            'avg_pause_duration_seconds': pause_metrics['avg_pause_duration'],
            'filler_word_count': filler_detection['filler_count'],
            'filler_word_ratio': filler_detection['filler_ratio'],
            'anomalies': {
                'instant_response': anomalies['instant_response'],
                'unnatural_consistency': anomalies['unnatural_consistency'],
                'delayed_then_fluent': anomalies['delayed_then_fluent'],
                'robotic_speech_pattern': anomalies['robotic_speech_pattern']
            },
            'risk_score': risk_result['risk_score']
        }

        # Update answer_analysis table
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
            'question_id': str(request.question_id),
            'transcription_text': transcription['text'],
            'response_timing': str(response_timing_data),
            'risk_score': risk_result['risk_score'],
            'metadata': str({
                'analysis_id': str(analysis_id),
                'analyzed_at': datetime.utcnow().isoformat(),
                'transcription_confidence': transcription['confidence'],
                'language': transcription['language']
            })
        })
        db.commit()

        logger.info(f"Analysis {analysis_id} completed successfully")

        # Schedule cleanup of temp files
        background_tasks.add_task(cleanup_temp_files, temp_files)

        # Build response
        return AnalysisResponse(
            analysis_id=analysis_id,
            transcription=TranscriptionResult(
                text=transcription['text'],
                confidence=transcription['confidence'],
                words=transcription['words'][:100]  # Limit word list in response
            ),
            timing_metrics=TimingMetrics(
                response_latency_ms=response_latency_ms,
                speech_duration_seconds=speech_duration_calc['speech_duration'],
                total_duration_seconds=total_duration,
                speech_rate_wpm=speech_rate_wpm,
                pause_count=pause_metrics['pause_count'],
                pause_percentage=pause_metrics['pause_percentage'],
                avg_pause_duration_seconds=pause_metrics['avg_pause_duration'],
                filler_word_count=filler_detection['filler_count'],
                filler_word_ratio=filler_detection['filler_ratio']
            ),
            anomalies=AnomalyResult(
                instant_response=anomalies['instant_response'],
                unnatural_consistency=anomalies['unnatural_consistency'],
                delayed_then_fluent=anomalies['delayed_then_fluent'],
                robotic_speech_pattern=anomalies['robotic_speech_pattern']
            ),
            risk_score=risk_result['risk_score'],
            recommendation=risk_result['recommendation']
        )

    except TimingServiceError as e:
        logger.error(f"Analysis failed: {e.message}")
        # Cleanup temp files
        await cleanup_temp_files(temp_files)
        raise HTTPException(status_code=e.status_code, detail=e.message)

    except Exception as e:
        logger.error(f"Unexpected error during analysis: {e}", exc_info=True)
        # Cleanup temp files
        await cleanup_temp_files(temp_files)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/status/{analysis_id}")
async def get_analysis_status(
    analysis_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Get status of an analysis job

    Args:
        analysis_id: Analysis ID
        db: Database session

    Returns:
        Analysis status and results if complete
    """
    try:
        # Query answer_analysis table
        query = text("""
            SELECT
                aa.id,
                aa.question_id,
                aa.response_timing,
                aa.risk_score,
                aa.analyzed_at,
                aa.metadata
            FROM answer_analysis aa
            WHERE aa.metadata->>'analysis_id' = :analysis_id
            LIMIT 1
        """)

        result = db.execute(query, {'analysis_id': str(analysis_id)}).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Analysis not found")

        return {
            "analysis_id": analysis_id,
            "question_id": result[1],
            "status": "completed",
            "response_timing": result[2],
            "risk_score": float(result[3]) if result[3] else None,
            "analyzed_at": result[4].isoformat() if result[4] else None,
            "metadata": result[5]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get analysis status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get status: {str(e)}")
