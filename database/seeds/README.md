# Blockd Database Seed Data

This directory contains seed data scripts for populating the Blockd database with test data.

## Seed Files

1. **01_seed_organizations.sql** - Creates test organizations with different subscription tiers
2. **02_seed_users.sql** - Creates test users (admin, interviewers, interviewees)
3. **03_seed_ai_cache.sql** - Populates AI answer cache with sample embeddings
4. **04_seed_sample_sessions.sql** - Creates sample interview sessions with associated data
5. **seed_all.sh** - Master script to run all seed files in order

## Quick Start

### Run all seeds
```bash
cd /home/user/Blockd/database/seeds
chmod +x seed_all.sh
./seed_all.sh
```

### Run individual seed files
```bash
psql -U postgres -d blockd -f 01_seed_organizations.sql
psql -U postgres -d blockd -f 02_seed_users.sql
psql -U postgres -d blockd -f 03_seed_ai_cache.sql
psql -U postgres -d blockd -f 04_seed_sample_sessions.sql
```

## Environment Variables

The `seed_all.sh` script supports the following environment variables:

- `DB_HOST` - Database host (default: localhost)
- `DB_PORT` - Database port (default: 5432)
- `DB_NAME` - Database name (default: blockd)
- `DB_USER` - Database user (default: postgres)
- `DB_PASSWORD` - Database password (default: postgres)

### Example with custom connection
```bash
export DB_HOST=db.example.com
export DB_PORT=5432
export DB_NAME=blockd_dev
export DB_USER=blockd_app
export DB_PASSWORD=secure_password
./seed_all.sh
```

## Test Data Created

### Organizations (3 total)
- **Blockd Demo Corp** - Free tier (5 concurrent sessions, 100/month limit)
- **Tech Startup Inc** - Professional tier (25 concurrent, 500/month)
- **Enterprise Solutions Ltd** - Enterprise tier (100 concurrent, unlimited)

### Users (6 total)
All users have password: `Blockd2025!`

| Email | Role | Organization | Name | MFA |
|-------|------|--------------|------|-----|
| admin@blockd.com | admin | Blockd Demo Corp | System Administrator | Yes |
| interviewer1@blockd.com | interviewer | Blockd Demo Corp | Sarah Johnson | No |
| interviewer2@techstartup.com | interviewer | Tech Startup Inc | Michael Chen | Yes |
| john.doe@blockd.com | interviewer | Enterprise Solutions Ltd | John Doe | No |
| interviewee1@example.com | interviewee | None | Alice Williams | No |
| interviewee2@example.com | interviewee | None | Bob Martinez | No |

### Interview Sessions (3 total)
1. **Ended session** - Low risk (0.15), Sarah Johnson → Alice Williams
2. **Active session** - Medium risk (0.68), Michael Chen → Bob Martinez
3. **Scheduled session** - Future, John Doe → candidate@example.com

### AI Answer Cache (6 entries)
Sample AI-generated answers for common interview questions with vector embeddings:
- JavaScript closures (GPT-4, Claude-3)
- Database indexing (GPT-3.5)
- Machine learning concepts (GPT-4)
- REST API principles (Gemini)
- Python decorators (Claude-3)

### Time-Series Data
- **Gaze Events**: 100 sample events for active session
- **Browser Telemetry**: 50 sample records for active session

### Security Events (3 total)
For the active session:
- Window focus changed (medium severity)
- Suspicious process detected (high severity)
- Copy/paste detected (medium severity)

## Resetting Seed Data

To reset and re-run seed data:
```bash
# Delete existing seed data
psql -U postgres -d blockd -c "DELETE FROM interview_sessions WHERE id LIKE '20000000-%'"
psql -U postgres -d blockd -c "DELETE FROM users WHERE email LIKE '%@blockd.com' OR email LIKE '%@techstartup.com'"
psql -U postgres -d blockd -c "DELETE FROM organizations WHERE name IN ('Blockd Demo Corp', 'Tech Startup Inc', 'Enterprise Solutions Ltd')"

# Re-run seeds
./seed_all.sh
```

## Testing Vector Similarity

After seeding, you can test pgvector similarity search:

```sql
-- Find similar AI answers using cosine similarity
SELECT
    question_text,
    model_name,
    LEFT(answer_text, 100) AS answer_preview,
    1 - (embedding <=> (SELECT embedding FROM ai_answer_cache WHERE question_hash = '1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p' LIMIT 1)) AS similarity
FROM ai_answer_cache
WHERE embedding IS NOT NULL
ORDER BY embedding <=> (SELECT embedding FROM ai_answer_cache WHERE question_hash = '1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p' LIMIT 1)
LIMIT 5;
```

## Notes

- All UUIDs are deterministic for testing purposes (starting with 00000000-, 10000000-, 20000000-)
- Password hashes are bcrypt with cost factor 10
- Vector embeddings are placeholder values (384 dimensions)
- In production, use real embeddings from sentence-transformers models
- TimescaleDB hypertables are automatically populated with time-series data
