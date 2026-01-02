# Blockd AI Detection Service

Production-grade AI answer detection service using multi-LLM comparison, semantic similarity, perplexity scoring, and XGBoost ensemble classification.

## Overview

The AI Detection Service is a critical component of the Blockd platform that identifies AI-generated content in interview answers. It uses a sophisticated multi-model approach combining:

- **Multi-LLM Answer Generation**: GPT-4, Claude 3.5 Sonnet, Gemini 1.5 Pro
- **Semantic Similarity**: 384-dimensional sentence embeddings (sentence-transformers)
- **Perplexity Scoring**: GPT-2 based language model perplexity
- **N-gram Overlap**: Jaccard similarity for trigrams and 4-grams
- **Stylometric Analysis**: Vocabulary richness, sentence structure, punctuation patterns
- **XGBoost Ensemble**: 15-feature classifier for final risk assessment

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Detection Service                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Question   │  │    Answer    │  │   Cache      │     │
│  │   Analysis   │  │   Analysis   │  │  Management  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Detection Service                      │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │   │
│  │  │   LLM    │ │Similarity│ │Perplexity│           │   │
│  │  │ Service  │ │ Service  │ │ Service  │           │   │
│  │  └──────────┘ └──────────┘ └──────────┘           │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │   │
│  │  │  N-gram  │ │Stylometry│ │  Cache   │           │   │
│  │  │ Service  │ │ Service  │ │ Service  │           │   │
│  │  └──────────┘ └──────────┘ └──────────┘           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               ML Models                             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │   │
│  │  │Embedding │ │Perplexity│ │ XGBoost  │           │   │
│  │  │  Model   │ │  Model   │ │Classifier│           │   │
│  │  └──────────┘ └──────────┘ └──────────┘           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   PostgreSQL            Redis Cache          RabbitMQ
   (pgvector)
```

## Features

### Question Analysis
- Generates AI answers from multiple LLMs
- Creates 384-dimensional embeddings
- Calculates perplexity scores
- Caches results in Redis and PostgreSQL (pgvector)
- Supports cache-first strategy for performance

### Answer Analysis
- Semantic similarity to AI models (cosine similarity)
- Perplexity scoring (lower = more AI-like)
- N-gram overlap analysis (trigrams, 4-grams)
- Stylometric features:
  - Vocabulary richness
  - Average sentence length
  - Punctuation density
  - Capitalization patterns
  - Filler word detection
- XGBoost ensemble classification
- Risk score (0-1) with confidence
- Automated flag generation
- Actionable recommendations

## Risk Levels

| Risk Level | Score Range | Description |
|-----------|-------------|-------------|
| Critical  | ≥ 0.90      | Almost certainly AI-generated |
| High      | 0.75-0.89   | Likely AI-generated |
| Medium    | 0.50-0.74   | Possible AI assistance |
| Low       | 0.30-0.49   | Minor concerns |
| Minimal   | < 0.30      | Likely human |

## Installation

### Prerequisites
- Python 3.14.0+
- PostgreSQL 18.1 with pgvector extension
- Redis 8.4+
- RabbitMQ 3.13+

### Environment Setup

1. Clone the repository:
```bash
cd backend/ai-detection
```

2. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
# or
poetry install
```

4. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

### Required API Keys

- **OpenAI**: Get from https://platform.openai.com/api-keys
- **Anthropic**: Get from https://console.anthropic.com/
- **Google AI**: Get from https://makersuite.google.com/app/apikey

## Configuration

Key environment variables:

```bash
# LLM API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/blockd

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Detection Thresholds
RISK_THRESHOLD_CRITICAL=0.90
RISK_THRESHOLD_HIGH=0.75
SIMILARITY_THRESHOLD_HIGH=0.85
PERPLEXITY_THRESHOLD_LOW=50.0
```

## Usage

### Starting the Service

```bash
# Development
uvicorn src.main:app --reload --host 0.0.0.0 --port 8005

# Production
uvicorn src.main:app --host 0.0.0.0 --port 8005 --workers 4
```

### API Endpoints

#### Health Check
```bash
GET /api/v1/health
```

#### Question Analysis
```bash
POST /api/v1/analysis/question
Content-Type: application/json

{
  "question_text": "Explain the difference between process and thread.",
  "difficulty": "medium",
  "session_id": "uuid-here"
}
```

#### Answer Analysis
```bash
POST /api/v1/analysis/answer
Content-Type: application/json

{
  "question_id": "uuid-here",
  "answer_text": "A process is...",
  "response_time_ms": 45000,
  "gaze_data": {
    "off_screen_percentage": 15.5,
    "off_screen_events": 3,
    "avg_confidence": 0.92
  }
}
```

### Example Response

```json
{
  "analysis_id": "uuid-here",
  "risk_score": 0.78,
  "risk_level": "high",
  "confidence": 0.89,
  "similarity_scores": {
    "gpt-4": 0.87,
    "claude-3.5-sonnet": 0.82,
    "gemini-1.5-pro": 0.75,
    "max": 0.87,
    "avg": 0.813
  },
  "perplexity_score": 32.5,
  "ngram_overlap": {
    "trigram": 0.68,
    "fourgram": 0.52
  },
  "stylometric_analysis": {
    "vocabulary_richness": 0.45,
    "avg_sentence_length": 18.5,
    "punctuation_density": 0.08
  },
  "flags": [
    "high_similarity_gpt4",
    "low_perplexity",
    "high_ngram_overlap"
  ],
  "recommendation": "Manual review recommended - high likelihood of AI assistance"
}
```

## Training XGBoost Model

Train the classifier with synthetic or real data:

```bash
# Synthetic data (for initial setup)
python scripts/train_xgboost.py --samples 1000 --output ./models/xgboost_classifier.json

# Real labeled data
python scripts/train_xgboost.py --data training_data.csv --output ./models/xgboost_classifier.json
```

Training data format (CSV):
```csv
max_similarity_score,avg_similarity_score,...,label
0.85,0.80,...,1
0.45,0.40,...,0
```

## Testing

Run the test suite:

```bash
# All tests
pytest

# With coverage
pytest --cov=. --cov-report=html

# Specific test file
pytest tests/test_similarity.py -v
```

## Performance

- Question analysis: < 5s (parallel LLM calls)
- Answer analysis: < 3s (with cached AI answers)
- Cache hit rate: > 80% for common questions
- Concurrent requests: Handles 50+ simultaneous analyses

## Caching Strategy

### Redis Keys
```
ai_detection:ai_answers:{question_hash}:{model} → Answer + embedding (TTL: 24h)
ai_detection:analysis:{analysis_id} → Analysis result (TTL: 7d)
```

### PostgreSQL (pgvector)
- Persistent storage for AI answers
- Vector similarity search
- Access count tracking

## Monitoring

Health check endpoint provides:
- Service status
- Model loading status
- Dependency health (database, Redis, RabbitMQ)

## Docker Deployment

```bash
docker build -t blockd/ai-detection:latest .
docker run -p 8005:8005 --env-file .env blockd/ai-detection:latest
```

## Security Considerations

- API keys stored in environment variables
- Rate limiting (TODO: implement)
- Input validation with Pydantic
- SQL injection prevention via ORM
- CORS configuration

## Troubleshooting

### Models not loading
- Check CUDA/GPU availability: `torch.cuda.is_available()`
- Verify model paths in configuration
- Check disk space for model downloads

### High latency
- Enable parallel LLM calls: `PARALLEL_LLM_CALLS=true`
- Increase cache TTL
- Use Redis cluster for better performance

### Low accuracy
- Retrain XGBoost model with more labeled data
- Adjust detection thresholds in configuration
- Review feature engineering

## Contributing

See DEVELOPMENT_PLAN.json for architecture and contribution guidelines.

## License

MIT License - see LICENSE file

## Support

For issues and questions:
- GitHub Issues: https://github.com/blockd/blockd
- Documentation: https://docs.blockd.io

---

Built with by the Blockd Team | Agent 9: AI Detection Service Developer
