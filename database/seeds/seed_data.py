#!/usr/bin/env python3
"""
Blockd Database Seed Script
Generates realistic test data for development and testing.

Usage:
    python seed_data.py [--conn-string CONNECTION_STRING]

Environment Variables:
    BLOCKD_DATABASE_URL - PostgreSQL connection string
    Default: postgresql://blockd:password@localhost:5432/blockd_db
"""

import os
import sys
import argparse
import hashlib
import uuid
from datetime import datetime, timedelta
import random
import json

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


def hash_password(password: str) -> str:
    """Generate a SHA-256 hash of the password."""
    return hashlib.sha256(password.encode()).hexdigest()


def generate_session_token() -> str:
    """Generate a unique session token."""
    return hashlib.sha256(str(uuid.uuid4()).encode()).hexdigest()


def seed_organizations(cur, count=3):
    """Create test organizations."""
    print(f"\n📊 Creating {count} organizations...")
    org_ids = []

    orgs = [
        {
            'name': 'Demo Corporation',
            'slug': 'demo-corp',
            'tier': 'enterprise',
            'max_sessions': 1000
        },
        {
            'name': 'Startup Inc',
            'slug': 'startup-inc',
            'tier': 'pro',
            'max_sessions': 100
        },
        {
            'name': 'Small Business LLC',
            'slug': 'small-biz',
            'tier': 'free',
            'max_sessions': 10
        }
    ]

    for org in orgs[:count]:
        org_id = str(uuid.uuid4())
        cur.execute("""
            INSERT INTO organizations (id, name, slug, subscription_tier, max_monthly_sessions, settings)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            org_id,
            org['name'],
            org['slug'],
            org['tier'],
            org['max_sessions'],
            Json({
                'features': {
                    'ai_detection': org['tier'] in ['pro', 'enterprise'],
                    'advanced_analytics': org['tier'] == 'enterprise',
                    'api_access': org['tier'] in ['pro', 'enterprise']
                }
            })
        ))
        org_ids.append(org_id)
        print(f"  ✓ Created {org['name']} ({org['tier']})")

    return org_ids


def seed_users(cur, org_ids, users_per_org=5):
    """Create test users."""
    print(f"\n👥 Creating users ({users_per_org} per organization)...")
    user_ids = {'interviewers': [], 'interviewees': [], 'admins': []}

    # Create admin user
    admin_id = str(uuid.uuid4())
    cur.execute("""
        INSERT INTO users (id, email, password_hash, full_name, role, organization_id, metadata)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (
        admin_id,
        'admin@blockd.ai',
        hash_password('admin123'),
        'Admin User',
        'admin',
        org_ids[0],
        Json({'department': 'Engineering', 'is_demo': True})
    ))
    user_ids['admins'].append(admin_id)
    print(f"  ✓ Created admin: admin@blockd.ai / admin123")

    # Create users for each organization
    for org_id in org_ids:
        # Create interviewers
        for i in range(users_per_org // 2):
            user_id = str(uuid.uuid4())
            email = f"interviewer{i+1}@{org_id[:8]}.com"
            cur.execute("""
                INSERT INTO users (id, email, password_hash, full_name, role, organization_id, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                user_id,
                email,
                hash_password('password123'),
                fake.name(),
                'interviewer',
                org_id,
                Json({'department': random.choice(['Engineering', 'Product', 'HR'])})
            ))
            user_ids['interviewers'].append(user_id)

        # Create interviewees
        for i in range(users_per_org // 2):
            user_id = str(uuid.uuid4())
            email = fake.email()
            cur.execute("""
                INSERT INTO users (id, email, password_hash, full_name, role, organization_id, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                user_id,
                email,
                hash_password('password123'),
                fake.name(),
                'interviewee',
                org_id,
                Json({'source': random.choice(['LinkedIn', 'Referral', 'Job Board'])})
            ))
            user_ids['interviewees'].append(user_id)

    print(f"  ✓ Created {len(user_ids['interviewers'])} interviewers")
    print(f"  ✓ Created {len(user_ids['interviewees'])} interviewees")

    return user_ids


def seed_sessions(cur, org_ids, user_ids, count=20):
    """Create test sessions."""
    print(f"\n🎤 Creating {count} interview sessions...")
    session_ids = []

    statuses = ['scheduled', 'active', 'completed', 'cancelled']
    status_weights = [0.3, 0.1, 0.5, 0.1]  # More completed sessions for analytics

    for i in range(count):
        session_id = str(uuid.uuid4())
        org_id = random.choice(org_ids)
        interviewer_id = random.choice(user_ids['interviewers'])
        interviewee_id = random.choice(user_ids['interviewees'])
        status = random.choices(statuses, weights=status_weights)[0]

        # Generate realistic timestamps based on status
        scheduled_time = fake.date_time_between(start_date='-30d', end_date='+30d')

        if status in ['active', 'completed']:
            actual_start = scheduled_time + timedelta(minutes=random.randint(-5, 15))
        else:
            actual_start = None

        if status == 'completed':
            end_time = actual_start + timedelta(minutes=random.randint(30, 90))
        else:
            end_time = None

        cur.execute("""
            INSERT INTO sessions (
                id, interviewer_id, interviewee_id, organization_id,
                session_token, status, scheduled_start_time,
                actual_start_time, end_time, interview_url,
                detection_settings
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            session_id,
            interviewer_id,
            interviewee_id,
            org_id,
            generate_session_token(),
            status,
            scheduled_time,
            actual_start,
            end_time,
            f"https://meet.google.com/{fake.lexify('???-????-???')}",
            Json({
                'eye_tracking_enabled': True,
                'keystroke_analysis_enabled': True,
                'ai_detection_enabled': random.choice([True, False]),
                'screen_monitoring_enabled': True,
                'sensitivity': random.choice(['low', 'medium', 'high'])
            })
        ))
        session_ids.append({'id': session_id, 'status': status, 'start': actual_start})

    print(f"  ✓ Created {count} sessions")
    return session_ids


def seed_detection_events(cur, session_ids, events_per_session=50):
    """Create test detection events."""
    print(f"\n🔍 Creating detection events...")

    event_types = [
        'eye_tracking', 'keystroke', 'screen_change',
        'ai_similarity', 'multi_monitor', 'tab_switch', 'window_blur'
    ]
    severities = ['low', 'medium', 'high', 'critical']

    total_events = 0
    for session in session_ids:
        if session['status'] not in ['active', 'completed']:
            continue

        if session['start'] is None:
            continue

        # Generate events throughout the session
        num_events = random.randint(events_per_session // 2, events_per_session * 2)

        for i in range(num_events):
            event_type = random.choice(event_types)
            timestamp = session['start'] + timedelta(seconds=random.randint(0, 3600))

            # Generate event-specific data
            if event_type == 'eye_tracking':
                event_data = {
                    'gaze_x': random.uniform(0, 1920),
                    'gaze_y': random.uniform(0, 1080),
                    'looking_away': random.choice([True, False]),
                    'duration_ms': random.randint(100, 5000)
                }
            elif event_type == 'keystroke':
                event_data = {
                    'wpm': random.randint(20, 120),
                    'pattern': random.choice(['normal', 'suspicious', 'copy_paste']),
                    'typing_rhythm_score': random.uniform(0.3, 1.0)
                }
            elif event_type == 'ai_similarity':
                event_data = {
                    'similarity_score': random.uniform(0.6, 0.99),
                    'matched_question_hash': hashlib.sha256(fake.text().encode()).hexdigest(),
                    'model_name': random.choice(['gpt-4', 'claude-3'])
                }
            else:
                event_data = {
                    'details': fake.sentence(),
                    'metadata': {'test': True}
                }

            cur.execute("""
                INSERT INTO detection_events (
                    session_id, event_type, timestamp, confidence_score,
                    event_data, severity, is_false_positive
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                session['id'],
                event_type,
                timestamp,
                random.uniform(0.5, 1.0),
                Json(event_data),
                random.choice(severities),
                random.random() < 0.05  # 5% false positives
            ))
            total_events += 1

    print(f"  ✓ Created {total_events} detection events")


def seed_alerts(cur, session_ids):
    """Create test alerts."""
    print(f"\n⚠️  Creating alerts...")

    alert_types = [
        'sustained_distraction',
        'ai_assistance_detected',
        'suspicious_typing_pattern',
        'multiple_screens_detected'
    ]

    total_alerts = 0
    for session in session_ids:
        if session['status'] not in ['completed']:
            continue

        # Generate 0-5 alerts per completed session
        num_alerts = random.randint(0, 5)

        for i in range(num_alerts):
            alert_type = random.choice(alert_types)
            severity = random.choices(['low', 'medium', 'high', 'critical'], weights=[0.4, 0.3, 0.2, 0.1])[0]

            cur.execute("""
                INSERT INTO alerts (
                    session_id, alert_type, title, description, severity,
                    triggered_at, metadata
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                session['id'],
                alert_type,
                f"{alert_type.replace('_', ' ').title()} Alert",
                fake.sentence(),
                severity,
                session['start'] + timedelta(minutes=random.randint(5, 45)),
                Json({'auto_generated': True})
            ))
            total_alerts += 1

    print(f"  ✓ Created {total_alerts} alerts")


def seed_session_analytics(cur, session_ids):
    """Create session analytics."""
    print(f"\n📈 Creating session analytics...")

    count = 0
    for session in session_ids:
        if session['status'] != 'completed':
            continue

        risk_score = random.uniform(0.1, 0.9)
        if risk_score < 0.3:
            risk_category = 'low'
        elif risk_score < 0.6:
            risk_category = 'medium'
        elif risk_score < 0.8:
            risk_category = 'high'
        else:
            risk_category = 'critical'

        cur.execute("""
            INSERT INTO session_analytics (
                session_id, total_events_detected, high_severity_events,
                critical_severity_events, avg_eye_tracking_confidence,
                suspicious_keystroke_patterns, ai_similarity_incidents,
                screen_switches, tab_switches, window_blur_events,
                overall_risk_score, risk_category, raw_metrics
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            session['id'],
            random.randint(20, 200),
            random.randint(0, 20),
            random.randint(0, 5),
            random.uniform(0.7, 0.95),
            random.randint(0, 10),
            random.randint(0, 5),
            random.randint(5, 50),
            random.randint(10, 100),
            random.randint(5, 30),
            risk_score,
            risk_category,
            Json({
                'average_response_time_ms': random.randint(500, 3000),
                'total_typing_time_seconds': random.randint(300, 2400)
            })
        ))
        count += 1

    print(f"  ✓ Created {count} session analytics records")


def seed_ai_cache(cur, count=100):
    """Create AI cache entries."""
    print(f"\n🤖 Creating {count} AI cache entries...")

    models = ['gpt-4', 'gpt-3.5-turbo', 'claude-3-opus', 'claude-3-sonnet']

    for i in range(count):
        question_text = fake.sentence() + "?"
        question_hash = hashlib.sha256(question_text.encode()).hexdigest()

        # Note: In production, this would be actual embeddings from OpenAI
        # For now, we'll skip the embedding column or use NULL
        cur.execute("""
            INSERT INTO ai_cache (
                question_hash, question_text, model_name,
                response_text, access_count, metadata
            )
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            question_hash,
            question_text,
            random.choice(models),
            fake.paragraph(),
            random.randint(0, 50),
            Json({'cached_at': datetime.now().isoformat()})
        ))

    print(f"  ✓ Created {count} AI cache entries")


def main():
    """Main seeding function."""
    parser = argparse.ArgumentParser(description='Seed Blockd database with test data')
    parser.add_argument(
        '--conn-string',
        default=os.getenv('BLOCKD_DATABASE_URL', 'postgresql://blockd:password@localhost:5432/blockd_db'),
        help='PostgreSQL connection string'
    )
    parser.add_argument('--organizations', type=int, default=3, help='Number of organizations to create')
    parser.add_argument('--users-per-org', type=int, default=6, help='Number of users per organization')
    parser.add_argument('--sessions', type=int, default=20, help='Number of sessions to create')
    parser.add_argument('--events-per-session', type=int, default=50, help='Average events per session')
    parser.add_argument('--ai-cache-size', type=int, default=100, help='Number of AI cache entries')

    args = parser.parse_args()

    print("🌱 Blockd Database Seeder")
    print("=" * 60)
    print(f"Connection: {args.conn_string.split('@')[1] if '@' in args.conn_string else args.conn_string}")

    try:
        conn = psycopg2.connect(args.conn_string)
        conn.autocommit = False
        cur = conn.cursor()

        # Seed data
        org_ids = seed_organizations(cur, args.organizations)
        user_ids = seed_users(cur, org_ids, args.users_per_org)
        session_ids = seed_sessions(cur, org_ids, user_ids, args.sessions)
        seed_detection_events(cur, session_ids, args.events_per_session)
        seed_alerts(cur, session_ids)
        seed_session_analytics(cur, session_ids)
        seed_ai_cache(cur, args.ai_cache_size)

        conn.commit()

        print("\n" + "=" * 60)
        print("✅ Database seeding completed successfully!")
        print("\n📝 Test Credentials:")
        print("   Admin: admin@blockd.ai / admin123")
        print("   All users: password123")

        cur.close()
        conn.close()

    except Exception as e:
        print(f"\n❌ Error seeding database: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
