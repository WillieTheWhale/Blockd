#!/usr/bin/env python3
"""
Generate test detection events for a specific session.
Useful for testing real-time detection systems.

Usage:
    python generate_test_events.py <session_id> [--count 100]
"""

import os
import sys
import argparse
import random
import json
import hashlib
from datetime import datetime, timedelta

try:
    import psycopg2
    from psycopg2.extras import Json
except ImportError:
    print("Error: psycopg2 is required. Install with: pip install psycopg2-binary")
    sys.exit(1)

try:
    from faker import Faker
except ImportError:
    print("Error: Faker is required. Install with: pip install Faker")
    sys.exit(1)


fake = Faker()


EVENT_GENERATORS = {
    'eye_tracking': lambda: {
        'gaze_x': random.uniform(0, 1920),
        'gaze_y': random.uniform(0, 1080),
        'looking_away': random.random() < 0.2,
        'duration_ms': random.randint(100, 5000),
        'pupil_dilation': random.uniform(2.0, 8.0)
    },
    'keystroke': lambda: {
        'wpm': random.randint(20, 120),
        'pattern': random.choice(['normal', 'suspicious', 'copy_paste', 'burst']),
        'typing_rhythm_score': random.uniform(0.3, 1.0),
        'pause_duration_ms': random.randint(50, 2000)
    },
    'screen_change': lambda: {
        'from_window': fake.sentence(nb_words=3),
        'to_window': fake.sentence(nb_words=3),
        'duration_ms': random.randint(100, 30000)
    },
    'ai_similarity': lambda: {
        'similarity_score': random.uniform(0.6, 0.99),
        'matched_question_hash': hashlib.sha256(fake.text().encode()).hexdigest(),
        'model_name': random.choice(['gpt-4', 'claude-3-opus', 'gpt-3.5-turbo']),
        'matched_sources': random.randint(1, 5)
    },
    'multi_monitor': lambda: {
        'monitor_count': random.randint(2, 4),
        'active_monitor': random.randint(1, 3),
        'suspected_reference_material': random.random() < 0.3
    },
    'tab_switch': lambda: {
        'from_tab': fake.url(),
        'to_tab': fake.url(),
        'switch_count_in_window': random.randint(1, 10)
    },
    'window_blur': lambda: {
        'blur_duration_ms': random.randint(1000, 30000),
        'application_switched_to': random.choice(['Chrome', 'Slack', 'VS Code', 'Terminal', 'Unknown'])
    }
}


def generate_event(event_type: str, severity: str) -> dict:
    """Generate event data based on type."""
    if event_type in EVENT_GENERATORS:
        return EVENT_GENERATORS[event_type]()
    else:
        return {'description': fake.sentence()}


def insert_events(conn_string: str, session_id: str, count: int, time_spread_minutes: int = 60):
    """Insert test events for a session."""
    print(f"🔍 Generating {count} detection events for session {session_id}")

    conn = psycopg2.connect(conn_string)
    cur = conn.cursor()

    # Verify session exists
    cur.execute("SELECT id, status, actual_start_time FROM sessions WHERE id = %s", (session_id,))
    session = cur.fetchone()

    if not session:
        print(f"❌ Session {session_id} not found!")
        return

    print(f"   Session status: {session[1]}")

    # Determine start time for events
    if session[2]:  # actual_start_time exists
        base_time = session[2]
    else:
        base_time = datetime.now() - timedelta(minutes=time_spread_minutes // 2)

    event_types = list(EVENT_GENERATORS.keys())
    severities = ['low', 'medium', 'high', 'critical']
    severity_weights = [0.5, 0.3, 0.15, 0.05]

    inserted = 0
    for i in range(count):
        event_type = random.choice(event_types)
        severity = random.choices(severities, weights=severity_weights)[0]

        # Distribute events over time
        timestamp = base_time + timedelta(
            seconds=random.randint(0, time_spread_minutes * 60)
        )

        event_data = generate_event(event_type, severity)
        confidence_score = random.uniform(0.5, 1.0)

        # Higher severity -> higher confidence
        if severity in ['high', 'critical']:
            confidence_score = random.uniform(0.7, 1.0)

        try:
            cur.execute("""
                INSERT INTO detection_events (
                    session_id, event_type, timestamp, confidence_score,
                    event_data, severity, is_false_positive
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                session_id,
                event_type,
                timestamp,
                confidence_score,
                Json(event_data),
                severity,
                random.random() < 0.03  # 3% false positives
            ))
            inserted += 1

            if (i + 1) % 100 == 0:
                print(f"   Progress: {i + 1}/{count} events inserted")

        except Exception as e:
            print(f"   ⚠️  Error inserting event: {e}")

    conn.commit()
    cur.close()
    conn.close()

    print(f"✅ Successfully inserted {inserted} events")


def main():
    parser = argparse.ArgumentParser(description='Generate test detection events')
    parser.add_argument('session_id', help='UUID of the session to add events to')
    parser.add_argument('--count', type=int, default=100, help='Number of events to generate')
    parser.add_argument('--time-spread', type=int, default=60, help='Time spread in minutes')
    parser.add_argument(
        '--conn-string',
        default=os.getenv('BLOCKD_DATABASE_URL', 'postgresql://blockd:password@localhost:5432/blockd_db'),
        help='PostgreSQL connection string'
    )

    args = parser.parse_args()

    try:
        insert_events(args.conn_string, args.session_id, args.count, args.time_spread)
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
