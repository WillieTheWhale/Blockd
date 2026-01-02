"""
Training Data Collection Script for AI Detection Models
Collects labeled data from the database for XGBoost and LSTM model training

Usage:
    python scripts/collect_training_data.py --output ./training_data
    python scripts/collect_training_data.py --xgboost-only --min-samples 100
    python scripts/collect_training_data.py --lstm-only --session-id <uuid>
"""

import os
import sys
import argparse
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
import csv

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

settings = get_settings()


class TrainingDataCollector:
    """Collects and prepares training data for ML models"""

    # XGBoost feature names (15 features)
    XGBOOST_FEATURES = [
        'max_similarity_score',
        'avg_similarity_score',
        'gpt4_similarity',
        'claude_similarity',
        'gemini_similarity',
        'perplexity_score',
        'trigram_overlap',
        'fourgram_overlap',
        'vocabulary_richness',
        'avg_sentence_length',
        'punctuation_density',
        'response_time_ms',
        'gaze_off_screen_percentage',
        'security_event_count',
        'answer_length'
    ]

    def __init__(self, database_url: str = None):
        """
        Initialize the training data collector

        Args:
            database_url: PostgreSQL connection string
        """
        self.database_url = database_url or settings.DATABASE_URL
        self.engine = create_engine(self.database_url)
        self.Session = sessionmaker(bind=self.engine)

        logger.info(f"Initialized TrainingDataCollector")

    def collect_xgboost_data(
        self,
        min_samples: int = 0,
        labeled_only: bool = True,
        session_ids: List[str] = None
    ) -> pd.DataFrame:
        """
        Collect training data for XGBoost AI detection model

        Args:
            min_samples: Minimum number of samples required
            labeled_only: Only include records with is_ai_generated label
            session_ids: Optional list of session IDs to filter

        Returns:
            DataFrame with features and labels
        """
        logger.info("Collecting XGBoost training data...")

        query = """
        SELECT
            aa.id AS analysis_id,
            aa.question_id,
            aa.answer_text,
            aa.risk_score,
            aa.similarity_scores,
            aa.response_timing,
            aa.perplexity_score,
            aa.is_ai_generated,
            aa.confidence_score,
            aa.metadata,
            q.session_id,
            q.difficulty,
            -- Count security events for this session
            (SELECT COUNT(*) FROM security_events se WHERE se.session_id = q.session_id) AS security_event_count,
            -- Count off-screen gaze events
            (SELECT COUNT(*) FROM gaze_events ge WHERE ge.session_id = q.session_id AND ge.is_off_screen = TRUE) AS off_screen_count,
            (SELECT COUNT(*) FROM gaze_events ge WHERE ge.session_id = q.session_id) AS total_gaze_count
        FROM answer_analysis aa
        JOIN questions q ON aa.question_id = q.id
        WHERE 1=1
        """

        params = {}

        if labeled_only:
            query += " AND aa.is_ai_generated IS NOT NULL"

        if session_ids:
            query += " AND q.session_id = ANY(:session_ids)"
            params['session_ids'] = session_ids

        query += " ORDER BY aa.created_at DESC"

        with self.engine.connect() as conn:
            result = conn.execute(text(query), params)
            rows = result.fetchall()

        if len(rows) < min_samples:
            logger.warning(f"Only found {len(rows)} samples, minimum required: {min_samples}")

        logger.info(f"Found {len(rows)} answer analysis records")

        # Process into features
        data = []
        for row in rows:
            features = self._extract_xgboost_features(row)
            if features is not None:
                data.append(features)

        if not data:
            logger.warning("No valid training samples extracted")
            return pd.DataFrame(columns=self.XGBOOST_FEATURES + ['label', 'session_id', 'analysis_id'])

        df = pd.DataFrame(data)
        logger.info(f"Extracted {len(df)} valid training samples")

        # Summary statistics
        if 'label' in df.columns:
            label_counts = df['label'].value_counts()
            logger.info(f"Label distribution: Human={label_counts.get(0, 0)}, AI={label_counts.get(1, 0)}")

        return df

    def _extract_xgboost_features(self, row) -> Optional[Dict[str, Any]]:
        """
        Extract XGBoost features from a database row

        Args:
            row: Database row with answer analysis data

        Returns:
            Dictionary of features or None if extraction fails
        """
        try:
            # Parse JSON fields
            similarity_scores = row.similarity_scores or {}
            response_timing = row.response_timing or {}
            metadata = row.metadata or {}

            # Handle different JSON formats
            if isinstance(similarity_scores, str):
                similarity_scores = json.loads(similarity_scores)
            if isinstance(response_timing, str):
                response_timing = json.loads(response_timing)
            if isinstance(metadata, str):
                metadata = json.loads(metadata)

            # Extract similarity scores
            gpt4_sim = similarity_scores.get('gpt-4', similarity_scores.get('gpt4', 0.0))
            claude_sim = similarity_scores.get('claude-3.5-sonnet', similarity_scores.get('claude', 0.0))
            gemini_sim = similarity_scores.get('gemini-1.5-pro', similarity_scores.get('gemini', 0.0))

            all_sims = [s for s in [gpt4_sim, claude_sim, gemini_sim] if s > 0]
            max_sim = max(all_sims) if all_sims else 0.0
            avg_sim = sum(all_sims) / len(all_sims) if all_sims else 0.0

            # Extract timing metrics
            response_time_ms = response_timing.get('response_latency_ms',
                                response_timing.get('latency_ms', 30000))

            # Extract n-gram overlaps from metadata if available
            ngram_data = metadata.get('ngram_overlap', {})
            trigram_overlap = ngram_data.get('trigram', 0.0)
            fourgram_overlap = ngram_data.get('fourgram', 0.0)

            # Extract stylometric features from metadata
            stylometric = metadata.get('stylometric', {})
            vocab_richness = stylometric.get('vocabulary_richness', 0.5)
            avg_sentence_len = stylometric.get('avg_sentence_length', 18.0)
            punct_density = stylometric.get('punctuation_density', 0.06)

            # Calculate gaze off-screen percentage
            total_gaze = row.total_gaze_count or 0
            off_screen = row.off_screen_count or 0
            gaze_off_screen_pct = (off_screen / total_gaze * 100) if total_gaze > 0 else 0.0

            # Answer length
            answer_text = row.answer_text or ""
            answer_length = len(answer_text)

            # Build feature dictionary
            features = {
                'max_similarity_score': float(max_sim),
                'avg_similarity_score': float(avg_sim),
                'gpt4_similarity': float(gpt4_sim),
                'claude_similarity': float(claude_sim),
                'gemini_similarity': float(gemini_sim),
                'perplexity_score': float(row.perplexity_score or 75.0),
                'trigram_overlap': float(trigram_overlap),
                'fourgram_overlap': float(fourgram_overlap),
                'vocabulary_richness': float(vocab_richness),
                'avg_sentence_length': float(avg_sentence_len),
                'punctuation_density': float(punct_density),
                'response_time_ms': float(response_time_ms),
                'gaze_off_screen_percentage': float(gaze_off_screen_pct),
                'security_event_count': int(row.security_event_count or 0),
                'answer_length': int(answer_length),
                # Metadata
                'label': 1 if row.is_ai_generated else 0,
                'session_id': str(row.session_id),
                'analysis_id': str(row.analysis_id),
                'confidence_score': float(row.confidence_score or 0.5),
            }

            return features

        except Exception as e:
            logger.warning(f"Failed to extract features: {e}")
            return None

    def collect_lstm_data(
        self,
        session_ids: List[str] = None,
        sequence_length: int = 30,
        min_sequences: int = 0
    ) -> Tuple[np.ndarray, List[Dict]]:
        """
        Collect gaze sequences for LSTM anomaly detector training

        Args:
            session_ids: Optional list of session IDs to filter
            sequence_length: Number of gaze points per sequence
            min_sequences: Minimum sequences required

        Returns:
            Tuple of (sequences array, metadata list)
        """
        logger.info("Collecting LSTM training data...")

        query = """
        SELECT
            ge.session_id,
            ge.timestamp,
            ge.gaze_x,
            ge.gaze_y,
            ge.is_off_screen,
            ge.confidence,
            s.risk_score AS session_risk_score
        FROM gaze_events ge
        JOIN interview_sessions s ON ge.session_id = s.id
        WHERE ge.gaze_x IS NOT NULL
          AND ge.gaze_y IS NOT NULL
          AND ge.confidence >= 0.5
        """

        params = {}

        if session_ids:
            query += " AND ge.session_id = ANY(:session_ids)"
            params['session_ids'] = session_ids

        query += " ORDER BY ge.session_id, ge.timestamp"

        with self.engine.connect() as conn:
            result = conn.execute(text(query), params)
            rows = result.fetchall()

        logger.info(f"Found {len(rows)} gaze events")

        # Group by session
        sessions = {}
        for row in rows:
            session_id = str(row.session_id)
            if session_id not in sessions:
                sessions[session_id] = {
                    'gaze_points': [],
                    'risk_score': row.session_risk_score
                }
            sessions[session_id]['gaze_points'].append({
                'x': float(row.gaze_x),
                'y': float(row.gaze_y),
                'is_off_screen': bool(row.is_off_screen),
                'confidence': float(row.confidence or 0.5)
            })

        # Create sequences
        sequences = []
        metadata = []

        for session_id, session_data in sessions.items():
            gaze_points = session_data['gaze_points']
            risk_score = session_data['risk_score'] or 0.0

            # Skip sessions with insufficient data
            if len(gaze_points) < sequence_length:
                continue

            # Create sliding window sequences
            for i in range(0, len(gaze_points) - sequence_length + 1, sequence_length // 2):
                seq = gaze_points[i:i + sequence_length]

                # Extract x, y coordinates
                coords = np.array([[p['x'], p['y']] for p in seq])
                sequences.append(coords)

                # Determine if this is a "normal" sequence (low risk session)
                is_normal = risk_score < 0.3

                metadata.append({
                    'session_id': session_id,
                    'start_index': i,
                    'is_normal': is_normal,
                    'risk_score': float(risk_score)
                })

        if len(sequences) < min_sequences:
            logger.warning(f"Only found {len(sequences)} sequences, minimum required: {min_sequences}")

        sequences_array = np.array(sequences) if sequences else np.array([]).reshape(0, sequence_length, 2)

        logger.info(f"Created {len(sequences)} gaze sequences")

        # Summary
        normal_count = sum(1 for m in metadata if m['is_normal'])
        logger.info(f"Sequence distribution: Normal={normal_count}, Anomalous={len(metadata) - normal_count}")

        return sequences_array, metadata

    def collect_labeling_candidates(
        self,
        unlabeled_only: bool = True,
        limit: int = 100
    ) -> pd.DataFrame:
        """
        Collect candidates for manual labeling

        Args:
            unlabeled_only: Only include unlabeled records
            limit: Maximum records to return

        Returns:
            DataFrame with candidates for labeling
        """
        logger.info("Collecting labeling candidates...")

        query = """
        SELECT
            aa.id AS analysis_id,
            aa.question_id,
            q.question_text,
            aa.answer_text,
            aa.risk_score,
            aa.similarity_scores,
            aa.perplexity_score,
            aa.is_ai_generated,
            aa.analyzed_at,
            s.id AS session_id
        FROM answer_analysis aa
        JOIN questions q ON aa.question_id = q.id
        JOIN interview_sessions s ON q.session_id = s.id
        WHERE 1=1
        """

        if unlabeled_only:
            query += " AND aa.is_ai_generated IS NULL"

        query += f" ORDER BY aa.risk_score DESC NULLS LAST LIMIT {limit}"

        with self.engine.connect() as conn:
            result = conn.execute(text(query))
            rows = result.fetchall()

        data = []
        for row in rows:
            data.append({
                'analysis_id': str(row.analysis_id),
                'session_id': str(row.session_id),
                'question_text': row.question_text[:200] + '...' if len(row.question_text or '') > 200 else row.question_text,
                'answer_text': row.answer_text[:500] + '...' if len(row.answer_text or '') > 500 else row.answer_text,
                'risk_score': float(row.risk_score) if row.risk_score else None,
                'perplexity_score': float(row.perplexity_score) if row.perplexity_score else None,
                'similarity_scores': row.similarity_scores,
                'current_label': row.is_ai_generated,
                'analyzed_at': str(row.analyzed_at) if row.analyzed_at else None
            })

        df = pd.DataFrame(data)
        logger.info(f"Found {len(df)} labeling candidates")

        return df

    def apply_labels(
        self,
        labels_file: str
    ) -> int:
        """
        Apply labels from a CSV file to the database

        Args:
            labels_file: Path to CSV with analysis_id and is_ai_generated columns

        Returns:
            Number of records updated
        """
        logger.info(f"Applying labels from {labels_file}")

        df = pd.read_csv(labels_file)

        if 'analysis_id' not in df.columns or 'is_ai_generated' not in df.columns:
            raise ValueError("CSV must have 'analysis_id' and 'is_ai_generated' columns")

        updated = 0

        with self.engine.connect() as conn:
            for _, row in df.iterrows():
                analysis_id = row['analysis_id']
                label = bool(row['is_ai_generated'])

                result = conn.execute(
                    text("""
                        UPDATE answer_analysis
                        SET is_ai_generated = :label
                        WHERE id = :id
                    """),
                    {'id': analysis_id, 'label': label}
                )

                if result.rowcount > 0:
                    updated += 1

            conn.commit()

        logger.info(f"Updated {updated} records with labels")
        return updated

    def export_xgboost_data(
        self,
        output_path: str,
        df: pd.DataFrame = None,
        **kwargs
    ):
        """
        Export XGBoost training data to CSV

        Args:
            output_path: Path to save CSV
            df: DataFrame to export (or collect if None)
            **kwargs: Arguments for collect_xgboost_data
        """
        if df is None:
            df = self.collect_xgboost_data(**kwargs)

        # Select only feature columns and label
        feature_cols = self.XGBOOST_FEATURES + ['label']
        export_df = df[[c for c in feature_cols if c in df.columns]]

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        export_df.to_csv(output_path, index=False)

        logger.info(f"Exported {len(export_df)} samples to {output_path}")

    def export_lstm_data(
        self,
        output_path: str,
        sequences: np.ndarray = None,
        metadata: List[Dict] = None,
        **kwargs
    ):
        """
        Export LSTM training data to NPZ file

        Args:
            output_path: Path to save NPZ
            sequences: Sequence array (or collect if None)
            metadata: Metadata list
            **kwargs: Arguments for collect_lstm_data
        """
        if sequences is None:
            sequences, metadata = self.collect_lstm_data(**kwargs)

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Save sequences
        np.savez(
            output_path,
            sequences=sequences,
            is_normal=np.array([m['is_normal'] for m in metadata]),
            session_ids=np.array([m['session_id'] for m in metadata]),
            risk_scores=np.array([m['risk_score'] for m in metadata])
        )

        logger.info(f"Exported {len(sequences)} sequences to {output_path}")

    def generate_statistics_report(self) -> Dict:
        """
        Generate statistics about available training data

        Returns:
            Dictionary with data statistics
        """
        stats = {}

        with self.engine.connect() as conn:
            # Total sessions
            result = conn.execute(text("SELECT COUNT(*) FROM interview_sessions"))
            stats['total_sessions'] = result.scalar()

            # Completed sessions
            result = conn.execute(text("SELECT COUNT(*) FROM interview_sessions WHERE status = 'ended'"))
            stats['completed_sessions'] = result.scalar()

            # Total answers analyzed
            result = conn.execute(text("SELECT COUNT(*) FROM answer_analysis"))
            stats['total_answers'] = result.scalar()

            # Labeled answers
            result = conn.execute(text("SELECT COUNT(*) FROM answer_analysis WHERE is_ai_generated IS NOT NULL"))
            stats['labeled_answers'] = result.scalar()

            # AI-generated answers
            result = conn.execute(text("SELECT COUNT(*) FROM answer_analysis WHERE is_ai_generated = TRUE"))
            stats['ai_generated_answers'] = result.scalar()

            # Human answers
            result = conn.execute(text("SELECT COUNT(*) FROM answer_analysis WHERE is_ai_generated = FALSE"))
            stats['human_answers'] = result.scalar()

            # Total gaze events
            result = conn.execute(text("SELECT COUNT(*) FROM gaze_events"))
            stats['total_gaze_events'] = result.scalar()

            # Sessions with gaze data
            result = conn.execute(text("SELECT COUNT(DISTINCT session_id) FROM gaze_events"))
            stats['sessions_with_gaze'] = result.scalar()

            # Security events
            result = conn.execute(text("SELECT COUNT(*) FROM security_events"))
            stats['total_security_events'] = result.scalar()

        return stats


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='Collect training data for AI detection models')

    parser.add_argument('--output', type=str, default='./training_data',
                        help='Output directory for training data')
    parser.add_argument('--xgboost-only', action='store_true',
                        help='Only collect XGBoost data')
    parser.add_argument('--lstm-only', action='store_true',
                        help='Only collect LSTM data')
    parser.add_argument('--min-samples', type=int, default=0,
                        help='Minimum samples required')
    parser.add_argument('--session-id', type=str, action='append',
                        help='Filter by session ID (can be specified multiple times)')
    parser.add_argument('--labeled-only', action='store_true', default=True,
                        help='Only include labeled data')
    parser.add_argument('--sequence-length', type=int, default=30,
                        help='LSTM sequence length')
    parser.add_argument('--stats', action='store_true',
                        help='Only show statistics, do not export')
    parser.add_argument('--export-candidates', type=str,
                        help='Export labeling candidates to specified CSV')
    parser.add_argument('--apply-labels', type=str,
                        help='Apply labels from specified CSV file')
    parser.add_argument('--database-url', type=str,
                        help='PostgreSQL connection string')

    args = parser.parse_args()

    # Initialize collector
    collector = TrainingDataCollector(database_url=args.database_url)

    # Show statistics
    if args.stats:
        stats = collector.generate_statistics_report()
        print("\n=== Training Data Statistics ===")
        for key, value in stats.items():
            print(f"  {key}: {value}")
        print()
        return

    # Export labeling candidates
    if args.export_candidates:
        df = collector.collect_labeling_candidates()
        df.to_csv(args.export_candidates, index=False)
        print(f"Exported {len(df)} labeling candidates to {args.export_candidates}")
        return

    # Apply labels
    if args.apply_labels:
        updated = collector.apply_labels(args.apply_labels)
        print(f"Applied labels to {updated} records")
        return

    # Create output directory
    os.makedirs(args.output, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    # Collect and export XGBoost data
    if not args.lstm_only:
        xgboost_df = collector.collect_xgboost_data(
            min_samples=args.min_samples,
            labeled_only=args.labeled_only,
            session_ids=args.session_id
        )

        if len(xgboost_df) > 0:
            output_path = os.path.join(args.output, f'xgboost_training_{timestamp}.csv')
            collector.export_xgboost_data(output_path, xgboost_df)
        else:
            print("No XGBoost training data available")

    # Collect and export LSTM data
    if not args.xgboost_only:
        sequences, metadata = collector.collect_lstm_data(
            session_ids=args.session_id,
            sequence_length=args.sequence_length,
            min_sequences=args.min_samples
        )

        if len(sequences) > 0:
            output_path = os.path.join(args.output, f'lstm_training_{timestamp}.npz')
            collector.export_lstm_data(output_path, sequences, metadata)
        else:
            print("No LSTM training data available")

    # Print summary
    print("\n=== Collection Complete ===")
    stats = collector.generate_statistics_report()
    print(f"Total labeled answers: {stats['labeled_answers']}")
    print(f"  - Human: {stats['human_answers']}")
    print(f"  - AI-generated: {stats['ai_generated_answers']}")
    print(f"Sessions with gaze data: {stats['sessions_with_gaze']}")
    print(f"Output directory: {args.output}")


if __name__ == "__main__":
    main()
