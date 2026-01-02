# RabbitMQ Message Queue Infrastructure

RabbitMQ 4.x cluster for the Blockd online exam proctoring platform with event-driven architecture for asynchronous processing.

## Architecture

- **3-Node RabbitMQ Cluster**: High availability with quorum queues
- **Redis Backend**: Celery result storage and caching
- **Message Broker**: AMQP protocol with publisher confirms
- **Task Queue**: Celery 5.x for Python workers
- **Node.js Client**: amqplib for TypeScript/JavaScript integration

## Quick Start

### 1. Start RabbitMQ Cluster

```bash
cd /home/user/Blockd/infrastructure/rabbitmq
docker-compose up -d
```

### 2. Verify Cluster Status

```bash
# Check container status
docker-compose ps

# Check RabbitMQ cluster status
docker exec blockd-rabbitmq-node1 rabbitmqctl cluster_status

# Check queue topology
docker exec blockd-rabbitmq-node1 rabbitmqctl list_queues name messages consumers
```

### 3. Access Management UI

Open your browser and navigate to:
- Node 1: http://localhost:15672
- Node 2: http://localhost:15673
- Node 3: http://localhost:15674

**Default credentials**:
- Username: `blockd_user`
- Password: `blockd_password_change_in_production`

## Exchanges and Queues

### Exchanges

1. **video_processing** (topic)
   - Routes: `video.encode.*`, `video.thumbnail.*`, `video.upload.*`
   - Use case: Video encoding, thumbnail generation, S3 uploads

2. **ai_detection** (topic)
   - Routes: `ai.analyze.*`, `ai.embedding.*`, `ai.cache.*`
   - Use case: AI-powered answer analysis, embeddings, cache warmup

3. **security_events** (fanout)
   - Routes: All subscribers (no routing key)
   - Use case: Real-time security alerts, audit logging

4. **gaze_analysis** (topic)
   - Routes: `gaze.process.*`, `gaze.anomaly.*`
   - Use case: Eye tracking analysis, anomaly detection

5. **dlx** (topic)
   - Routes: `*.dlq`
   - Use case: Dead letter exchange for failed messages

### Queues

| Queue | Max Length | Overflow | TTL | DLQ |
|-------|-----------|----------|-----|-----|
| video_encode | 100,000 | reject-publish | 24h | ✓ |
| video_thumbnail | 50,000 | reject-publish | 24h | ✓ |
| video_upload | 50,000 | reject-publish | 24h | ✓ |
| ai_analyze | 100,000 | reject-publish | 24h | ✓ |
| embedding_generate | 50,000 | reject-publish | 24h | ✓ |
| cache_warmup | 10,000 | drop-head | 24h | ✓ |
| security_alert | 10,000 | reject-publish | 24h | ✓ |
| security_log | 100,000 | drop-head | 24h | ✓ |
| gaze_process | 100,000 | reject-publish | 24h | ✓ |
| anomaly_detect | 50,000 | reject-publish | 24h | ✓ |

## Python Usage

### Install Dependencies

```bash
cd /home/user/Blockd/backend/shared/queue
pip install -r requirements.txt
```

### Publish Messages

```python
from publisher import publish_video_task, publish_ai_task

# Publish video encoding task
publish_video_task(
    "encode",
    "video_123",
    {"quality": "1080p", "codec": "h264"}
)

# Publish AI analysis task
publish_ai_task(
    "analyze",
    "exam_456",
    {"answer_id": "ans_789", "text": "Student answer"}
)
```

### Start Celery Workers

```bash
# Video processing worker
celery -A backend.shared.queue.consumer worker \
  --queues=video_encode,video_thumbnail,video_upload \
  --concurrency=4 \
  --loglevel=info

# AI detection worker
celery -A backend.shared.queue.consumer worker \
  --queues=ai_analyze,embedding_generate,cache_warmup \
  --concurrency=8 \
  --loglevel=info

# Security worker
celery -A backend.shared.queue.consumer worker \
  --queues=security_alert,security_log \
  --concurrency=16 \
  --pool=gevent \
  --loglevel=info

# Gaze analysis worker
celery -A backend.shared.queue.consumer worker \
  --queues=gaze_process,anomaly_detect \
  --concurrency=8 \
  --loglevel=info
```

### Monitor with Flower

```bash
celery -A backend.shared.queue.consumer flower --port=5555
```

Then open http://localhost:5555

## Node.js/TypeScript Usage

### Install Dependencies

```bash
cd /home/user/Blockd/backend/shared/queue
npm install
```

### Publish Messages

```typescript
import { publishVideoTask, publishAITask } from './publisher';

// Publish video encoding task
await publishVideoTask(
  'encode',
  'video_123',
  { quality: '1080p', codec: 'h264' }
);

// Publish AI analysis task
await publishAITask(
  'analyze',
  'exam_456',
  { answer_id: 'ans_789', text: 'Student answer' }
);
```

## Testing

### Python Tests

```bash
cd /home/user/Blockd/backend/shared/queue
python test_publisher.py
```

### TypeScript Tests

```bash
cd /home/user/Blockd/backend/shared/queue
npm run build
node dist/test_publisher.js
```

## Performance

### Throughput

- Expected: 1,000 messages/second aggregate
- Peak: 2,500 messages/second
- Sustained: 800 messages/second

### Latency

- P50: < 50ms
- P95: < 200ms
- P99: < 500ms

## Configuration

### RabbitMQ Configuration

Edit `rabbitmq.conf` to adjust:
- Memory limits
- Connection limits
- Channel limits
- Heartbeat intervals
- Queue master locator

### Topology Changes

Edit `topology.json` to modify:
- Exchanges
- Queues
- Bindings
- Policies
- Dead letter configurations

After changes, restart the cluster:

```bash
docker-compose restart
```

## Monitoring

### RabbitMQ Management UI

- Queue depths
- Message rates
- Consumer counts
- Node status
- Cluster health

### Prometheus Metrics

Expose metrics on port 15692:

```bash
curl http://localhost:15692/metrics
```

### Health Checks

```bash
# Node health
docker exec blockd-rabbitmq-node1 rabbitmq-diagnostics -q ping

# Cluster status
docker exec blockd-rabbitmq-node1 rabbitmqctl cluster_status

# Queue stats
docker exec blockd-rabbitmq-node1 rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
```

## Troubleshooting

### Check Logs

```bash
# RabbitMQ logs
docker logs blockd-rabbitmq-node1
docker logs blockd-rabbitmq-node2
docker logs blockd-rabbitmq-node3

# Redis logs
docker logs blockd-redis-celery
```

### Reset Cluster

```bash
docker-compose down -v
docker-compose up -d
```

### Dead Letter Queues

Check DLQs for failed messages:

```bash
docker exec blockd-rabbitmq-node1 rabbitmqctl list_queues name messages | grep dlq
```

### Purge Queues

```bash
# Purge specific queue
docker exec blockd-rabbitmq-node1 rabbitmqctl purge_queue video_encode

# Purge all queues (dangerous!)
docker exec blockd-rabbitmq-node1 rabbitmqctl eval 'rabbitmqctl purge_all_queues.'
```

## Security

### Production Configuration

1. **Change default credentials** in `docker-compose.yml` and `rabbitmq.conf`
2. **Enable TLS/SSL** for encrypted connections
3. **Use secrets management** (Vault, AWS Secrets Manager, etc.)
4. **Restrict network access** to RabbitMQ ports
5. **Enable authentication plugins** (LDAP, OAuth2, etc.)

### TLS Configuration

Add to `rabbitmq.conf`:

```conf
listeners.ssl.default = 5671
ssl_options.cacertfile = /path/to/ca_certificate.pem
ssl_options.certfile = /path/to/server_certificate.pem
ssl_options.keyfile = /path/to/server_key.pem
ssl_options.verify = verify_peer
ssl_options.fail_if_no_peer_cert = true
```

## Scaling

### Horizontal Scaling

1. **Add RabbitMQ nodes** to the cluster
2. **Add Celery workers** on additional servers
3. **Use load balancer** for RabbitMQ connections

### Queue Sharding

Partition queues by routing key:
- `video.encode.shard1.*`
- `video.encode.shard2.*`
- `video.encode.shard3.*`

## Maintenance

### Backup

```bash
# Backup definitions
docker exec blockd-rabbitmq-node1 rabbitmqctl export_definitions /tmp/definitions.json
docker cp blockd-rabbitmq-node1:/tmp/definitions.json ./backup/
```

### Restore

```bash
# Restore definitions
docker cp ./backup/definitions.json blockd-rabbitmq-node1:/tmp/
docker exec blockd-rabbitmq-node1 rabbitmqctl import_definitions /tmp/definitions.json
```

### Upgrade

```bash
# Pull latest image
docker-compose pull

# Restart with new image
docker-compose up -d
```

## Resources

- [RabbitMQ Documentation](https://www.rabbitmq.com/documentation.html)
- [Celery Documentation](https://docs.celeryproject.org/)
- [amqplib Documentation](https://amqp-node.github.io/amqplib/)
- [Quorum Queues Guide](https://www.rabbitmq.com/quorum-queues.html)

## Support

For issues or questions, contact the Blockd development team.
