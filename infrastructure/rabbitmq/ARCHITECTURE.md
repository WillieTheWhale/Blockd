# RabbitMQ Architecture for Blockd Platform

## Cluster Topology

```
                    ┌─────────────────────────────────────┐
                    │      RabbitMQ Cluster (HA)          │
                    │                                      │
                    │  ┌──────────┐  ┌──────────┐  ┌────┐│
                    │  │  Node 1  │  │  Node 2  │  │Node││
                    │  │ :5672    │  │ :5673    │  │ :56││
                    │  │ :15672   │  │ :15673   │  │ :15││
                    │  └──────────┘  └──────────┘  └────┘│
                    │        Quorum Queues (2x repl)      │
                    └─────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
          ┌─────────▼────────┐              ┌──────────▼─────────┐
          │  Publishers       │              │  Consumers         │
          │  (Python/Node.js) │              │  (Celery Workers)  │
          └──────────────────┘              └────────────────────┘
                    │                                   │
                    │                                   │
                    ▼                                   ▼
          ┌──────────────────┐              ┌────────────────────┐
          │ FastAPI/Fastify  │              │ Redis (Results)    │
          │ API Endpoints    │              │ :6379              │
          └──────────────────┘              └────────────────────┘
```

## Exchange and Queue Topology

```
┌───────────────────────────────────────────────────────────────────┐
│                        EXCHANGES                                   │
├───────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐                                          │
│  │ video_processing    │─────┐                                    │
│  │ (topic)             │     │                                    │
│  └─────────────────────┘     │                                    │
│                               │   video.encode.*                   │
│                               ├──────────────────► [video_encode] │
│                               │   video.thumbnail.*                │
│                               ├──────────────────► [video_thumbnail]
│                               │   video.upload.*                   │
│                               └──────────────────► [video_upload] │
│                                                                     │
│  ┌─────────────────────┐                                          │
│  │ ai_detection        │─────┐                                    │
│  │ (topic)             │     │                                    │
│  └─────────────────────┘     │                                    │
│                               │   ai.analyze.*                     │
│                               ├──────────────────► [ai_analyze]   │
│                               │   ai.embedding.*                   │
│                               ├──────────────────► [embedding_gen]│
│                               │   ai.cache.*                       │
│                               └──────────────────► [cache_warmup] │
│                                                                     │
│  ┌─────────────────────┐                                          │
│  │ security_events     │─────┐                                    │
│  │ (fanout)            │     │                                    │
│  └─────────────────────┘     │                                    │
│                               │   (all messages)                   │
│                               ├──────────────────► [security_alert]│
│                               │   (all messages)                   │
│                               └──────────────────► [security_log] │
│                                                                     │
│  ┌─────────────────────┐                                          │
│  │ gaze_analysis       │─────┐                                    │
│  │ (topic)             │     │                                    │
│  └─────────────────────┘     │                                    │
│                               │   gaze.process.*                   │
│                               ├──────────────────► [gaze_process] │
│                               │   gaze.anomaly.*                   │
│                               └──────────────────► [anomaly_detect]│
│                                                                     │
│  ┌─────────────────────┐                                          │
│  │ dlx                 │─────┐                                    │
│  │ (topic)             │     │                                    │
│  └─────────────────────┘     │                                    │
│                               │   *.dlq                            │
│                               └──────────────────► [All DLQs]     │
└───────────────────────────────────────────────────────────────────┘
```

## Message Flow: Video Processing

```
1. User Upload
   │
   ▼
2. API Endpoint (FastAPI/Fastify)
   │
   │  publish(exchange="video_processing",
   │          routing_key="video.encode.{video_id}",
   │          message={video_id, quality, codec})
   │
   ▼
3. RabbitMQ Exchange (video_processing)
   │
   │  Route based on routing_key pattern
   │
   ▼
4. Queue (video_encode)
   │  Max: 100K messages
   │  TTL: 24h
   │  Replication: 2x
   │
   ▼
5. Celery Worker (tasks.video.encode)
   │  FFmpeg encoding
   │  30-300 seconds
   │
   ├──► SUCCESS ──► Publish to video.thumbnail.{video_id}
   │                │
   │                ▼
   │                Thumbnail generation
   │                │
   │                ▼
   │                Publish to video.upload.{video_id}
   │                │
   │                ▼
   │                S3 upload
   │                │
   │                ▼
   │                Store result in Redis
   │
   └──► FAILURE ──► Retry (max 3x, exponential backoff)
                    │
                    └──► DLQ (video_encode.dlq)
```

## Message Flow: AI Detection

```
1. Student Submits Answer
   │
   ▼
2. API Endpoint
   │
   │  publish(exchange="ai_detection",
   │          routing_key="ai.analyze.{exam_id}",
   │          message={exam_id, answer_id, text})
   │
   ▼
3. RabbitMQ Exchange (ai_detection)
   │
   ▼
4. Queue (ai_analyze)
   │
   ▼
5. Celery Worker (tasks.ai.analyze)
   │  XGBoost classification
   │  Sentence-transformers
   │  2-10 seconds
   │
   ├──► Generate Embedding
   │    │  publish(routing_key="ai.embedding.{exam_id}")
   │    │
   │    ▼
   │    Embedding queue → Generate 768-dim vector
   │    │
   │    ▼
   │    Store in PostgreSQL (pgvector)
   │
   └──► Cache Results
        │  publish(routing_key="ai.cache.{cache_key}")
        │
        ▼
        Cache queue → Warm up Redis
        │
        ▼
        Return analysis to API
```

## Message Flow: Security Events

```
1. Security Event Detected
   │  (Tab switch, multiple screens, etc.)
   │
   ▼
2. Browser Extension / API
   │
   │  publish(exchange="security_events",
   │          routing_key="security.{event_type}",
   │          message={event_type, user_id, severity})
   │
   ▼
3. RabbitMQ Exchange (security_events - FANOUT)
   │
   ├──► Queue (security_alert)
   │    │  Real-time processing
   │    │  Priority: Critical
   │    │
   │    ▼
   │    Celery Worker (tasks.security.alert)
   │    │  Send notifications
   │    │  Update dashboard
   │    │  < 100ms latency
   │    │
   │    ▼
   │    WebSocket to proctors
   │
   └──► Queue (security_log)
        │  Audit logging
        │  Priority: Medium
        │
        ▼
        Celery Worker (tasks.security.log)
        │  Store in PostgreSQL + TimescaleDB
        │  Compliance audit trail
        │
        ▼
        Long-term storage
```

## Message Flow: Gaze Analysis

```
1. Browser Captures Gaze Data
   │  MediaPipe eye tracking
   │  Batch: 100 points / 5 seconds
   │
   ▼
2. API Endpoint
   │
   │  publish(exchange="gaze_analysis",
   │          routing_key="gaze.process.{session_id}",
   │          message={session_id, gaze_data[]})
   │
   ▼
3. RabbitMQ Exchange (gaze_analysis)
   │
   ▼
4. Queue (gaze_process)
   │
   ▼
5. Celery Worker (tasks.gaze.process)
   │  Calculate fixations, saccades
   │  Generate heatmap data
   │  0.5-2 seconds
   │
   ├──► Store in TimescaleDB
   │
   └──► Trigger Anomaly Detection
        │  publish(routing_key="gaze.anomaly.{session_id}")
        │
        ▼
        Queue (anomaly_detect)
        │
        ▼
        Celery Worker (tasks.gaze.anomaly)
        │  ML-based anomaly detection
        │  Risk scoring
        │
        └──► If high risk:
             │  publish(exchange="security_events")
             │
             ▼
             Security alert flow
```

## Performance Characteristics

### Throughput by Exchange

| Exchange | Expected | Peak | Use Case |
|----------|----------|------|----------|
| video_processing | 500 msg/s | 1000 msg/s | Video encoding |
| ai_detection | 1000 msg/s | 2000 msg/s | Answer analysis |
| security_events | 200 msg/s | 500 msg/s | Real-time alerts |
| gaze_analysis | 800 msg/s | 1500 msg/s | Eye tracking |

### Latency Targets

- **Message publish to queue**: < 10ms
- **Queue to worker pickup**: < 50ms (P50), < 200ms (P95)
- **Task execution**: Varies by task type
  - Video encode: 30-300s
  - AI analysis: 2-10s
  - Security alert: 0.1-0.5s
  - Gaze process: 0.5-2s

### Reliability

- **Message durability**: Persistent messages
- **Replication**: 2x quorum queues
- **Acknowledgment**: Late ack (after task completion)
- **Retries**: Max 3x with exponential backoff
- **Dead letter queues**: All failed messages captured

## Scaling Strategies

### Horizontal Scaling

1. **Add RabbitMQ nodes**: `docker-compose scale rabbitmq=5`
2. **Add Celery workers**: Run on multiple servers
3. **Load balancer**: Distribute connections across nodes

### Vertical Scaling

1. **Increase resources**: CPU/memory per container
2. **Optimize queue settings**: Prefetch, batch size
3. **Tune worker concurrency**: Based on workload

### Queue Sharding

```
video.encode.shard1.*  → [video_encode_shard1]
video.encode.shard2.*  → [video_encode_shard2]
video.encode.shard3.*  → [video_encode_shard3]
```

Distribute by video_id hash:
- shard = hash(video_id) % 3

## Monitoring and Alerts

### Key Metrics

- Queue depth (messages waiting)
- Message rate (in/out per second)
- Consumer count per queue
- Task execution time
- Task success/failure rate
- DLQ depth
- Memory/CPU usage per node

### Alerts

- Queue depth > 10,000 messages
- Consumer lag > 5 minutes
- DLQ growth > 100 messages
- Node unavailable
- Memory usage > 80%

### Tools

- RabbitMQ Management UI
- Prometheus + Grafana
- Celery Flower
- Custom dashboards

## Disaster Recovery

### Backup Strategy

1. **Daily backups**: Export topology definitions
2. **Volume snapshots**: RabbitMQ data volumes
3. **Redis snapshots**: Celery results

### Recovery Procedures

1. **Single node failure**: Automatic failover (quorum queues)
2. **Cluster failure**: Restore from backup
3. **Data loss**: Replay from source systems

## Security Considerations

### Authentication

- Username/password (change in production)
- LDAP integration (optional)
- OAuth2 support (optional)

### Authorization

- Vhost isolation
- User permissions (configure/write/read)
- Topic-based ACLs

### Encryption

- TLS/SSL for connections
- Message payload encryption (application-level)
- Volume encryption (at rest)

### Network Security

- Private Docker network
- Firewall rules
- VPN for inter-cluster communication

---

This architecture provides a robust, scalable, and production-ready message queue infrastructure for the Blockd platform.
