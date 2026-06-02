# Blockd

**Enterprise Interview Security Platform**

Blockd is a comprehensive interview integrity platform that combines a custom Chromium browser with AI-powered detection, eye tracking, and real-time security monitoring to ensure authentic interview experiences.

## Key Features

- **Custom Chromium Browser** - Native security monitoring at the browser process level
- **AI Detection** - Multi-LLM analysis (GPT-4, Claude, Gemini) to detect AI-generated answers
- **Eye Tracking** - MediaPipe-based gaze analysis for attention monitoring
- **Security Monitoring** - Process detection, VM detection, screen recording detection
- **Real-time Video** - WebRTC streaming and recording with WebSocket communication
- **Risk Scoring** - Multi-factor analysis combining AI, security, and behavioral signals

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BLOCKD PLATFORM                             │
├─────────────────────┬─────────────────────┬─────────────────────────┤
│   Interviewer App   │   Blockd Browser    │    Backend Services     │
│   (React 19 SPA)    │   (Chromium Fork)   │   (Node.js + Python)    │
└─────────────────────┴─────────────────────┴─────────────────────────┘
                                │
┌───────────────────────────────┼───────────────────────────────────┐
│                    Data Layer │                                   │
│   PostgreSQL 18.1   │   Redis 8.4   │   RabbitMQ 4.x              │
│   + TimescaleDB     │   Cluster     │   Message Queue             │
│   + pgvector        │               │                             │
└─────────────────────┴───────────────┴─────────────────────────────┘
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 24+ LTS
- Python 3.14+
- Git

### Development Setup

```bash
# Clone the repository
git clone https://github.com/WillieTheWhale/Blockd.git
cd Blockd

# Copy environment file
cp .env.example .env
# Edit .env and set required secrets

# Start all services with Docker
docker compose up -d

# View logs
docker compose logs -f api-gateway
```

### Individual Services

**Frontend:**
```bash
cd frontend/interviewer-app
npm install
npm run dev  # http://localhost:3000
```

**Backend (Node.js):**
```bash
cd backend/api-gateway  # or auth-service, session-service, websocket-service
npm install
npm run dev
```

**Backend (Python):**
```bash
cd backend/ai-detection  # or eye-tracking, response-timing, video-service
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

### Testing

```bash
cd tests
npm install
npm run test:all  # Unit + Integration + E2E + Load
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript 5.9, Vite 6, Tailwind CSS 4, shadcn/ui |
| API Gateway | Fastify 5, Node.js 24, Prisma 6 |
| ML Services | FastAPI, Python 3.14, PyTorch 2.5, sentence-transformers |
| Database | PostgreSQL 18.1 + TimescaleDB + pgvector |
| Cache | Redis 8.4 Cluster |
| Queue | RabbitMQ 4.x with Celery |
| Video | mediasoup (WebRTC), FFmpeg 7 |
| Browser | Chromium 142 fork |
| Infrastructure | AWS EKS, Terraform, Helm |

## Project Structure

```
Blockd/
├── backend/                    # Backend microservices
│   ├── api-gateway/           # Main API gateway (Fastify)
│   ├── auth-service/          # Authentication & MFA
│   ├── session-service/       # Interview session management
│   ├── websocket-service/     # Real-time communication
│   ├── ai-detection/          # AI answer detection (Python)
│   ├── eye-tracking/          # Gaze analysis (Python)
│   ├── response-timing/       # Speech timing analysis (Python)
│   ├── video-service/         # WebRTC & recording (Python)
│   └── shared/                # Shared libraries
├── frontend/
│   └── interviewer-app/       # React interviewer dashboard
├── chromium/                   # Chromium browser fork
│   ├── blocked_backup/        # Blockd modifications
│   └── src/                   # Chromium source (after setup)
├── database/                   # PostgreSQL schema & migrations
├── infrastructure/             # Redis, RabbitMQ configs
├── k8s/                        # Kubernetes manifests & Helm
├── monitoring/                 # Prometheus & Grafana
├── tests/                      # E2E, API, load tests
└── docs/                       # Documentation
```

## Documentation

| Document | Description |
|----------|-------------|
| [Changelog](./CHANGELOG.md) | Version history and release notes |
| [Architecture](./docs/ARCHITECTURE.md) | System architecture overview |
| [API Reference](./docs/API_REFERENCE.md) | REST API documentation |
| [Database](./docs/DATABASE.md) | Database schema and setup |
| [WebSocket Protocol](./docs/WEBSOCKET_PROTOCOL.md) | Real-time communication |
| [Chromium Browser](./docs/CHROMIUM_BROWSER.md) | Browser build guide |
| [Deployment](./docs/deployment/README.md) | Infrastructure setup |
| [Environment Variables](./docs/ENV_VARIABLES.md) | Configuration reference |

### Runbooks

- [Production Runbook](./docs/PRODUCTION_RUNBOOK.md)
- [Disaster Recovery](./docs/disaster-recovery-runbook.md)
- [Incident Response](./docs/runbooks/incident-response.md)
- [Monitoring & Alerts](./docs/runbooks/monitoring-alerts.md)
- [Scaling Guide](./docs/runbooks/scaling-guide.md)

## Services Overview

| Service | Port | Description |
|---------|------|-------------|
| API Gateway | 3000 | Central entry point, auth, rate limiting |
| Auth Service | 3001 | User auth, MFA, OAuth 2.0 |
| Session Service | 3002 | Interview session lifecycle |
| WebSocket Service | 3003 | Real-time communication |
| AI Detection | 8000 | AI answer detection |
| Eye Tracking | 8001 | Gaze analysis |
| Response Timing | 8002 | Speech timing analysis |
| Video Service | 8003 | WebRTC & recording |
| Frontend | 5173 | Interviewer dashboard |

## Environment Variables

Key environment variables (see [.env.example](./.env.example) for full list):

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/blockd

# Redis
REDIS_URL=redis://localhost:6379

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672

# JWT
JWT_SECRET=your-secret-key

# AI APIs
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

## Chromium Browser Build

The Blockd Browser requires 100+ GB disk space and 16+ GB RAM to build.

```bash
cd chromium

# Setup (downloads Chromium source, ~30GB)
./setup.sh

# Build (4-8 hours on first build)
./build.sh --release

# Create installers
./build_installers.sh --skip-build
```

See [Chromium Browser Guide](./docs/CHROMIUM_BROWSER.md) for detailed instructions.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Convention

Follow [Conventional Commits](https://conventionalcommits.org/):
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `refactor:` - Code refactoring
- `test:` - Tests
- `chore:` - Maintenance

## License

MIT License

## Support

- **Issues:** [GitHub Issues](https://github.com/WillieTheWhale/Blockd/issues)
- **Email:** support@blockd.site
- **Domain:** [blockd.site](https://blockd.site)
