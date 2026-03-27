# Video Processing Service

Production-grade video processing service for the Blockd platform using mediasoup for WebRTC streaming, FFmpeg for recording, and S3 for storage.

## Overview

This service provides:
- **WebRTC Streaming**: Real-time video/audio streaming using mediasoup SFU
- **Recording**: FFmpeg-based recording of interview sessions
- **Adaptive Bitrate**: Automatic generation of multiple resolutions (240p, 360p, 480p, 720p)
- **S3 Storage**: Upload and manage video files in S3-compatible storage
- **Thumbnail Generation**: Automatic thumbnail creation for videos

## Architecture

The service consists of two components:
1. **Python FastAPI Server** (port 8003): REST API and recording management
2. **Node.js mediasoup Server** (port 3000): WebRTC SFU for streaming

```
┌─────────────────────────────────────────────┐
│          Client (Browser/App)               │
└────────────┬────────────────────────────────┘
             │
             │ WebRTC (UDP/TCP)
             ↓
┌─────────────────────────────────────────────┐
│    mediasoup Server (Node.js/TypeScript)    │
│  - WebRTC Workers                           │
│  - Transport Management                      │
│  - Media Routing                            │
└────────────┬────────────────────────────────┘
             │
             │ HTTP API
             ↓
┌─────────────────────────────────────────────┐
│       FastAPI Server (Python)               │
│  - Recording Management                      │
│  - API Endpoints                            │
│  - Business Logic                           │
└─────┬───────────────────┬───────────────────┘
      │                   │
      │ FFmpeg            │ boto3
      ↓                   ↓
┌──────────┐        ┌──────────────┐
│  Video   │        │  S3 Storage  │
│  Files   │        │  (Adaptive)  │
└──────────┘        └──────────────┘
```

## Technology Stack

### Python Dependencies
- **FastAPI 0.121.3**: Web framework
- **mediasoup**: WebRTC SFU (via Node.js bridge)
- **FFmpeg**: Video encoding and processing
- **boto3**: S3 storage client
- **aio-pika**: RabbitMQ async client
- **redis**: Session state management

### Node.js Dependencies
- **mediasoup 3.19.11**: WebRTC SFU
- **Express**: HTTP server
- **TypeScript**: Type safety

## Installation

### Prerequisites

1. **Python 3.14.0+**
2. **Node.js 24.11.0+**
3. **FFmpeg 7.x**
4. **PostgreSQL 16+**
5. **Redis 7+**
6. **RabbitMQ 3.12+**
7. **S3-compatible storage** (AWS S3, MinIO, or Cloudflare R2)

### Install FFmpeg

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Verify installation
ffmpeg -version
```

### Setup

1. **Clone and navigate to directory**:
```bash
cd backend/video-service
```

2. **Install Python dependencies**:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

3. **Install Node.js dependencies**:
```bash
npm install
```

4. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

5. **Create recording directory**:
```bash
mkdir -p /tmp/recordings
```

## Configuration

### Environment Variables

See `.env.example` for all configuration options. Key settings:

#### WebRTC Configuration
```env
ANNOUNCED_IP=your.server.ip  # Your server's public IP
RTC_MIN_PORT=10000
RTC_MAX_PORT=10100
```

#### S3 Configuration
```env
S3_ENDPOINT=https://s3.amazonaws.com
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_BUCKET=blockd-recordings
```

#### Performance Settings
```env
MAX_CONCURRENT_STREAMS=100
MAX_RECORDING_DURATION=7200  # 2 hours
```

## Running the Service

### Development Mode

1. **Start mediasoup server**:
```bash
npm run dev
```

2. **Start FastAPI server** (in another terminal):
```bash
source venv/bin/activate
python -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8003
```

### Production Mode

1. **Build TypeScript**:
```bash
npm run build
```

2. **Start mediasoup server**:
```bash
npm start
```

3. **Start FastAPI server with Gunicorn**:
```bash
gunicorn src.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8003
```

### Using Docker Compose

```bash
docker-compose up -d
```

## API Documentation

### WebRTC Endpoints

#### Get Router Capabilities
```http
GET /api/v1/webrtc/routers/{session_id}/capabilities
```

Returns RTP capabilities needed by client.

#### Create Transport
```http
POST /api/v1/webrtc/transports
Content-Type: application/json

{
  "session_id": "uuid",
  "direction": "send"  // or "recv"
}
```

Returns transport parameters (ICE, DTLS).

#### Connect Transport
```http
POST /api/v1/webrtc/transports/{transport_id}/connect
Content-Type: application/json

{
  "dtls_parameters": {...}
}
```

#### Create Producer
```http
POST /api/v1/webrtc/transports/{transport_id}/produce
Content-Type: application/json

{
  "kind": "video",  // or "audio"
  "rtp_parameters": {...}
}
```

Returns `producer_id`.

#### Create Consumer
```http
POST /api/v1/webrtc/transports/{transport_id}/consume
Content-Type: application/json

{
  "producer_id": "id",
  "rtp_capabilities": {...}
}
```

Returns consumer parameters.

### Recording Endpoints

#### Start Recording
```http
POST /api/v1/recording/start
Content-Type: application/json

{
  "session_id": "uuid",
  "input_source": "rtmp://localhost/live/session_id"
}
```

#### Stop Recording
```http
POST /api/v1/recording/stop
Content-Type: application/json

{
  "session_id": "uuid",
  "upload_to_s3": true
}
```

Returns URLs for all adaptive bitrate versions.

#### Get Recording Status
```http
GET /api/v1/recording/status/{session_id}
```

### Stream Management Endpoints

#### Create Session
```http
POST /api/v1/stream/sessions
Content-Type: application/json

{
  "session_id": "uuid",
  "interviewer_id": "user_id",
  "candidate_id": "user_id"
}
```

#### Get Session Info
```http
GET /api/v1/stream/sessions/{session_id}
```

#### End Session
```http
POST /api/v1/stream/sessions/{session_id}/end
```

## Client Integration

### WebRTC Connection Flow

1. **Get router capabilities**:
```javascript
const response = await fetch(`/api/v1/webrtc/routers/${sessionId}/capabilities`);
const { rtpCapabilities } = await response.json();
```

2. **Create send transport** (for uploading media):
```javascript
const response = await fetch('/api/v1/webrtc/transports', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    session_id: sessionId,
    direction: 'send'
  })
});
const transportParams = await response.json();
```

3. **Create recv transport** (for receiving media):
```javascript
const response = await fetch('/api/v1/webrtc/transports', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    session_id: sessionId,
    direction: 'recv'
  })
});
const transportParams = await response.json();
```

4. **Connect transport and produce/consume media** using mediasoup-client library.

See the mediasoup-client documentation for complete client-side integration: https://mediasoup.org/documentation/v3/mediasoup-client/

## Performance

### Benchmarks

- **Concurrent Streams**: 100+ simultaneous streams
- **Recording Latency**: < 1 second
- **Adaptive Bitrate Switching**: < 2 seconds
- **S3 Upload Speed**: 10+ MB/s

### Optimization Tips

1. **Use nginx as reverse proxy** for SSL termination
2. **Enable hardware encoding** if available (h264_nvenc, h264_qsv)
3. **Use SSD storage** for temporary recording files
4. **Configure OS UDP buffer sizes** for mediasoup:
```bash
sudo sysctl -w net.core.rmem_max=26214400
sudo sysctl -w net.core.rmem_default=26214400
```

## Monitoring

### Health Check
```http
GET /health
```

Returns service health status.

### Metrics
```http
GET /metrics
```

Returns Prometheus-compatible metrics:
- Active recordings count
- Total recordings (started/completed/failed)
- Active sessions
- Participant count

## Testing

### Run Python Tests
```bash
pytest tests/ -v --cov=src
```

### Run Node.js Tests
```bash
npm test
```

### Load Testing

Use Apache Bench or similar tools:
```bash
ab -n 1000 -c 10 http://localhost:8003/health
```

## Troubleshooting

### Common Issues

1. **FFmpeg not found**:
```bash
which ffmpeg
# Update FFMPEG_PATH in .env
```

2. **mediasoup not starting**:
```bash
# Check Node.js version
node --version  # Should be 24.11.0+

# Check logs
npm run dev
```

3. **WebRTC connection fails**:
- Ensure `ANNOUNCED_IP` is set to your server's public IP
- Check firewall allows UDP ports 10000-10100
- Verify STUN/TURN configuration if behind NAT

4. **Recording quality issues**:
- Adjust bitrate settings in config.py
- Check FFmpeg preset (veryfast, fast, medium, slow)
- Monitor CPU usage during encoding

### Logs

Logs are written to stdout/stderr. In production, use a log aggregation service:

```bash
# View FastAPI logs
journalctl -u video-service-api -f

# View mediasoup logs
journalctl -u video-service-mediasoup -f
```

## Message Queue Integration

The service publishes events to RabbitMQ:

### Event Types
- `recording.recording_started`: Recording started
- `recording.recording_completed`: Recording completed and uploaded
- `recording.recording_failed`: Recording failed
- `stream.stream_started`: Stream session started
- `stream.stream_ended`: Stream session ended

### Event Format
```json
{
  "event": "recording_completed",
  "session_id": "uuid",
  "timestamp": "2025-11-24T12:00:00Z",
  "data": {
    "urls": [...],
    "thumbnail_url": "...",
    "duration": 1234.5
  }
}
```

## Security

### Best Practices

1. **Use SSL/TLS** for all connections
2. **Restrict S3 bucket access** with IAM policies
3. **Validate input sources** to prevent command injection
4. **Use signed URLs** for video access (7-day expiry)
5. **Rate limit API endpoints**
6. **Monitor for abuse** (excessive recording duration)

### Firewall Rules

Allow these ports:
- **8003**: FastAPI HTTP API
- **3000**: mediasoup HTTP API (internal only)
- **10000-10100**: WebRTC media (UDP/TCP)

## License

MIT License - Blockd Platform

## Support

For issues and questions:
- Documentation: `/docs` (Swagger UI)
- GitHub Issues: https://github.com/blockd/video-service
- Email: support@blockd.io

## Contributors

- Blockd Team
