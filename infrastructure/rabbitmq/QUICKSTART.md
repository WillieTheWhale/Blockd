# RabbitMQ Quick Start Guide

## 1. Start the Cluster (30 seconds)

```bash
cd /home/user/Blockd/infrastructure/rabbitmq
./start.sh
```

Or using Makefile:

```bash
make start
```

## 2. Verify Everything Works

```bash
make health
```

Expected output:
```
=== Health Checks ===
Node 1:
  ✓ Node 1 healthy
Node 2:
  ✓ Node 2 healthy
Node 3:
  ✓ Node 3 healthy
Redis:
  ✓ Redis healthy
```

## 3. Access Management UI

Open in browser: http://localhost:15672

- Username: `blockd_user`
- Password: `blockd_password_change_in_production`

## 4. Test Python Publisher

```bash
cd /home/user/Blockd/backend/shared/queue

# Install dependencies (first time only)
pip install -r requirements.txt

# Run tests
python test_publisher.py
```

## 5. Test Node.js Publisher

```bash
cd /home/user/Blockd/backend/shared/queue

# Install dependencies (first time only)
npm install

# Build TypeScript
npm run build

# Run tests
node dist/test_publisher.js
```

## 6. Start Celery Workers

### Video Processing Worker

```bash
celery -A backend.shared.queue.consumer worker \
  --queues=video_encode,video_thumbnail,video_upload \
  --concurrency=4 \
  --loglevel=info
```

### AI Detection Worker

```bash
celery -A backend.shared.queue.consumer worker \
  --queues=ai_analyze,embedding_generate,cache_warmup \
  --concurrency=8 \
  --loglevel=info
```

### Security Worker (High Priority)

```bash
celery -A backend.shared.queue.consumer worker \
  --queues=security_alert,security_log \
  --concurrency=16 \
  --pool=gevent \
  --loglevel=info
```

### Gaze Analysis Worker

```bash
celery -A backend.shared.queue.consumer worker \
  --queues=gaze_process,anomaly_detect \
  --concurrency=8 \
  --loglevel=info
```

## 7. Monitor with Flower

```bash
celery -A backend.shared.queue.consumer flower --port=5555
```

Then open: http://localhost:5555

## 8. Usage Examples

### Python

```python
from backend.shared.queue import publish_video_task, publish_ai_task

# Publish video encoding task
publish_video_task("encode", "video_123", {
    "quality": "1080p",
    "codec": "h264"
})

# Publish AI analysis task
publish_ai_task("analyze", "exam_456", {
    "answer_id": "ans_789",
    "text": "Student answer here"
})
```

### TypeScript/Node.js

```typescript
import { publishVideoTask, publishAITask } from './publisher';

// Publish video encoding task
await publishVideoTask('encode', 'video_123', {
  quality: '1080p',
  codec: 'h264'
});

// Publish AI analysis task
await publishAITask('analyze', 'exam_456', {
  answer_id: 'ans_789',
  text: 'Student answer here'
});
```

## 9. Common Commands

```bash
# View logs
make logs

# Check status
make status

# List queues
make list-queues

# Restart cluster
make restart

# Stop cluster
make stop

# Clean up everything (WARNING: deletes data!)
make clean
```

## 10. Troubleshooting

### Cluster not starting?

```bash
# Check Docker
docker info

# View logs
docker-compose logs

# Reset and start fresh
docker-compose down -v
docker-compose up -d
```

### Can't connect to RabbitMQ?

1. Check if containers are running: `docker-compose ps`
2. Check network: `docker network ls`
3. Check ports: `netstat -an | grep 5672`

### Workers not consuming?

1. Check if queue exists: `make list-queues`
2. Check worker logs
3. Verify broker URL in worker command

## Next Steps

1. ✅ Start RabbitMQ cluster
2. ✅ Run tests
3. ⏭️ Integrate with FastAPI/Fastify APIs
4. ⏭️ Deploy Celery workers
5. ⏭️ Configure monitoring (Prometheus + Grafana)
6. ⏭️ Set up production credentials
7. ⏭️ Configure auto-scaling

## Documentation

- Full documentation: `README.md`
- Architecture diagrams: `ARCHITECTURE.md`
- Architecture documentation: See `ARCHITECTURE.md`

## Support

For issues, check the troubleshooting section in README.md or review the logs.
