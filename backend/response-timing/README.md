# Response Timing Service

Production-grade response timing analysis service for the Blockd platform using OpenAI Whisper for speech-to-text, analyzing speech rate, pause frequency, filler words, and detecting timing anomalies.

**Agent 11: Response Timing Service Developer**
**Version**: 1.0.0
**Last Updated**: 2025-11-24

## Overview

The Response Timing Service analyzes audio recordings of interview answers to detect timing anomalies that may indicate AI-assisted responses or pre-prepared answers. It uses advanced audio processing and statistical analysis to identify patterns inconsistent with natural human speech.

## Features

### Core Analysis
- **Speech-to-Text Transcription**: OpenAI Whisper API or self-hosted Whisper models
- **Response Latency Calculation**: Time from question to answer start
- **Speech Rate Analysis**: Words per minute (WPM) calculation
- **Pause Detection**: Energy-based silence detection and analysis
- **Filler Word Detection**: Identification of um, uh, like, you know, etc.
- **Anomaly Detection**: Statistical detection of suspicious timing patterns

### Anomaly Types Detected
1. **Instant Response**: Complex questions answered too quickly
2. **Unnatural Consistency**: Robotic pause patterns (TTS-like)
3. **Delayed Then Fluent**: Long pause followed by fluent speech (reading)
4. **Robotic Speech Pattern**: Consistent WPM, minimal pauses/fillers
5. **No Fillers**: Absence of natural hesitation markers
6. **Excessive Speed**: Speech rate >200 WPM (reading aloud)

## Technology Stack

- **Python**: 3.14.0
- **FastAPI**: 0.121.3
- **OpenAI Whisper**: API or self-hosted
- **librosa**: Audio processing and analysis
- **pydub**: Audio format conversion
- **NumPy/SciPy**: Statistical analysis
- **PostgreSQL**: Data persistence
- **RabbitMQ**: Async job processing
- **S3**: Audio file storage

## Architecture

```
┌─────────────────┐
│   API Gateway   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   Response Timing Service (Port 8006) │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────────────────────────┐  │
│  │   Transcription Service      │  │
│  │   - Whisper API/Local        │  │
│  │   - Word-level timestamps    │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   Audio Processing Service   │  │
│  │   - Format conversion        │  │
│  │   - Normalization            │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   Pause Detection Service    │  │
│  │   - Energy-based detection   │  │
│  │   - Pattern analysis         │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   Filler Detection Service   │  │
│  │   - Word matching            │  │
│  │   - Distribution analysis    │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   Timing Analysis Service    │  │
│  │   - WPM calculation          │  │
│  │   - Latency evaluation       │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   Anomaly Detection Service  │  │
│  │   - Risk scoring             │  │
│  │   - Pattern detection        │  │
│  └──────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │
│   (answer_      │
│    analysis)    │
└─────────────────┘
```

## Installation

### Prerequisites
- Python 3.14.0
- PostgreSQL 18.1+
- FFmpeg (for audio processing)
- OpenAI API key (if using API mode)

### Setup

1. **Install dependencies**:
```bash
cd /backend/response-timing
pip install -r requirements.txt
```

2. **Install FFmpeg** (required for audio processing):
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

3. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Database setup**:
The service uses the existing PostgreSQL schema (Agent 1). Ensure the `answer_analysis` table exists with the `response_timing` JSONB column.

## Configuration

### Whisper Mode

**API Mode** (Recommended for production):
```env
WHISPER_MODE=api
OPENAI_API_KEY=sk-your-api-key
WHISPER_MODEL=whisper-1
```

**Local Mode** (Self-hosted):
```env
WHISPER_MODE=local
LOCAL_WHISPER_MODEL=base  # tiny, base, small, medium, large
```

### Expected Response Latencies

Configure expected thinking times by difficulty:
```env
EXPECTED_LATENCY_SIMPLE=3000      # 3 seconds
EXPECTED_LATENCY_ANALYTICAL=8000  # 8 seconds
EXPECTED_LATENCY_COMPLEX=15000    # 15 seconds
```

### Anomaly Detection Tuning

```env
INSTANT_RESPONSE_THRESHOLD=0.5     # <50% of expected = instant
UNNATURAL_CONSISTENCY_THRESHOLD=0.1 # Low pause variation
LOW_FILLER_THRESHOLD=0.01          # <1% fillers
HIGH_FILLER_THRESHOLD=0.15         # >15% fillers
PAUSE_PERCENTAGE_THRESHOLD=10.0    # <10% pause time
```

## API Endpoints

### Analyze Audio

```http
POST /api/v1/timing/analyze
Content-Type: application/json

{
  "question_id": "550e8400-e29b-41d4-a716-446655440000",
  "audio_url": "s3://blockd-audio/sessions/session123/answer456.mp3",
  "question_asked_at": "2025-11-24T10:30:00Z",
  "answer_start_timestamp": "2025-11-24T10:30:05Z",
  "difficulty": "analytical"
}
```

**Response**:
```json
{
  "analysis_id": "660e8400-e29b-41d4-a716-446655440001",
  "transcription": {
    "text": "Well, I think the answer to this question involves...",
    "confidence": 0.95,
    "words": [...]
  },
  "timing_metrics": {
    "response_latency_ms": 4500,
    "speech_duration_seconds": 45.2,
    "total_duration_seconds": 52.8,
    "speech_rate_wpm": 145.3,
    "pause_count": 8,
    "pause_percentage": 14.4,
    "avg_pause_duration_seconds": 0.95,
    "filler_word_count": 6,
    "filler_word_ratio": 0.035
  },
  "anomalies": {
    "instant_response": false,
    "unnatural_consistency": false,
    "delayed_then_fluent": false,
    "robotic_speech_pattern": false
  },
  "risk_score": 0.15,
  "recommendation": "Timing patterns appear natural"
}
```

### Get Analysis Status

```http
GET /api/v1/timing/status/{analysis_id}
```

### Health Check

```http
GET /api/v1/health
GET /api/v1/health/ready
GET /api/v1/health/live
```

## Usage

### Running the Service

**Development**:
```bash
cd /backend/response-timing
python -m src.main
```

**Production**:
```bash
uvicorn src.main:app --host 0.0.0.0 --port 8006 --workers 4
```

**Docker**:
```bash
docker build -t blockd/response-timing .
docker run -p 8006:8006 --env-file .env blockd/response-timing
```

### Example Integration

```python
import httpx

async def analyze_interview_answer(
    question_id: str,
    audio_url: str,
    question_asked_at: str,
    answer_start_timestamp: str,
    difficulty: str
):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8006/api/v1/timing/analyze",
            json={
                "question_id": question_id,
                "audio_url": audio_url,
                "question_asked_at": question_asked_at,
                "answer_start_timestamp": answer_start_timestamp,
                "difficulty": difficulty
            },
            timeout=120.0
        )
        return response.json()
```

## Performance

### Benchmarks

| Audio Duration | Transcription | Processing | Total |
|---------------|---------------|------------|-------|
| 1 minute      | ~5s          | ~2s        | ~7s   |
| 5 minutes     | ~10s         | ~3s        | ~13s  |
| 10 minutes    | ~15s         | ~4s        | ~19s  |

*Using Whisper API mode with base model*

### Optimization Tips

1. **Use API mode** for best transcription quality and speed
2. **Audio preprocessing**: Convert to WAV 16kHz mono before analysis
3. **Batch processing**: Process multiple audio files in parallel
4. **Caching**: Enable Redis for transcription caching
5. **Local Whisper**: Use GPU-accelerated models for self-hosted

## Testing

### Run Tests

```bash
# All tests
pytest tests/ -v

# Specific test file
pytest tests/test_pause_detection.py -v

# With coverage
pytest tests/ --cov=services --cov-report=html
```

### Test Coverage

- Pause detection: Energy-based silence detection, pattern analysis
- Filler detection: Word matching, distribution analysis
- Timing analysis: WPM calculation, latency evaluation
- Anomaly detection: Risk scoring, pattern detection

## Metrics Reference

### Speech Rate (WPM)
- **Very Slow**: <80 WPM
- **Slow**: 80-120 WPM
- **Normal**: 120-160 WPM
- **Fast**: 160-200 WPM
- **Very Fast**: >200 WPM (likely reading)

### Filler Word Ratios
- **Natural Speech**: 2-8%
- **Nervous/Thinking**: 8-15%
- **AI-Generated (Read)**: <1%

### Response Latencies
- **Simple Questions**: ~3 seconds
- **Analytical Questions**: ~8 seconds
- **Complex Questions**: ~15 seconds

## Troubleshooting

### Common Issues

**Transcription fails**:
- Check OpenAI API key is valid
- Verify audio file format is supported
- Ensure audio file size <25MB

**High memory usage**:
- Reduce `MAX_CONCURRENT_JOBS`
- Use smaller Whisper model (tiny/base)
- Enable audio preprocessing

**Slow performance**:
- Switch to Whisper API mode
- Reduce audio sample rate (16kHz recommended)
- Enable caching for repeated analyses

**Database connection errors**:
- Verify `DATABASE_URL` is correct
- Check PostgreSQL is running
- Increase `DB_POOL_TIMEOUT`

## Development

### Project Structure

```
/backend/response-timing/
├── src/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Configuration management
│   └── database.py          # Database connection
├── services/
│   ├── transcription.py     # Whisper integration
│   ├── audio_processing.py  # Audio normalization
│   ├── timing_analysis.py   # WPM, latency calculation
│   ├── pause_detection.py   # Silence detection
│   ├── filler_detection.py  # Filler word detection
│   └── anomaly_detection.py # Anomaly detection
├── api/
│   ├── analyze.py           # Analysis endpoints
│   └── health.py            # Health check endpoints
├── lib/
│   ├── audio_utils.py       # Audio file handling
│   ├── stats_utils.py       # Statistical calculations
│   └── errors.py            # Custom exceptions
├── schemas/
│   └── analysis.py          # Pydantic schemas
├── tests/
│   ├── test_pause_detection.py
│   ├── test_filler_detection.py
│   └── test_timing_analysis.py
├── requirements.txt
├── .env.example
├── Dockerfile
└── README.md
```

### Code Style

- **Formatting**: Black (line length: 100)
- **Linting**: Flake8
- **Type Checking**: MyPy
- **Docstrings**: Google style

### Contributing

1. Write tests for new features
2. Ensure all tests pass: `pytest tests/ -v`
3. Format code: `black .`
4. Check linting: `flake8 .`
5. Update documentation

## Integration Points

### Database (Agent 1)
- Table: `answer_analysis`
- Column: `response_timing` (JSONB)
- Updates: Risk score, transcription, timing metrics

### Message Queue (Agent 3)
- Queue: `timing_analysis_queue`
- Exchange: `blockd`
- Async processing support

### Storage (Agent 4)
- Bucket: `blockd-audio`
- Download audio files for analysis
- S3-compatible (MinIO, AWS S3)

## Security

- Audio files downloaded to temporary storage
- Automatic cleanup after analysis
- No persistent audio storage in service
- API keys stored in environment variables
- Database connection pooling with SSL

## Monitoring

### Metrics
- Transcription success rate
- Average processing time
- Anomaly detection rate
- Risk score distribution

### Logging
- Structured JSON logging
- Log levels: DEBUG, INFO, WARNING, ERROR
- Request/response logging
- Performance metrics

## License

Proprietary - Blockd Platform

## Support

For issues or questions:
- GitHub Issues: https://github.com/blockd/platform/issues
- Documentation: /docs/agent11-response-timing-metrics.json
- Email: support@blockd.io

---

**Built with ❤️ by Agent 11**
