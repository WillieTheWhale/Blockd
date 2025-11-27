# Redis 8.4 Cluster Setup for Blockd Platform

This directory contains the Redis cluster configuration and Docker Compose setup for the Blockd platform.

## Overview

- **Redis Version**: 8.4 (latest stable)
- **Architecture**: 6-node cluster (3 primaries + 3 replicas)
- **Memory Limit**: 64GB
- **Eviction Policy**: allkeys-lru
- **Persistence**: AOF (Append-Only File) with fsync every second

## Quick Start

### 1. Start the Redis Cluster

```bash
cd infrastructure/redis
docker-compose up -d
```

### 2. Wait for Cluster Initialization

The cluster takes 30-60 seconds to initialize. Monitor the logs:

```bash
docker-compose logs -f redis-cluster-init
```

### 3. Verify Cluster Status

```bash
docker exec blockd-redis-node-1 redis-cli cluster info
```

You should see:
```
cluster_state:ok
cluster_slots_assigned:16384
cluster_slots_ok:16384
cluster_slots_pfail:0
cluster_slots_fail:0
cluster_known_nodes:6
cluster_size:3
```

### 4. Check Individual Nodes

```bash
docker exec blockd-redis-node-1 redis-cli cluster nodes
```

## Architecture

### Network Configuration

- **Subnet**: 172.28.0.0/16
- **Node IPs**:
  - redis-node-1: 172.28.0.11:6379 (Primary)
  - redis-node-2: 172.28.0.12:6379 (Primary)
  - redis-node-3: 172.28.0.13:6379 (Primary)
  - redis-node-4: 172.28.0.14:6379 (Replica)
  - redis-node-5: 172.28.0.15:6379 (Replica)
  - redis-node-6: 172.28.0.16:6379 (Replica)

### Port Mapping

| Service | Internal Port | External Port | Bus Port |
|---------|--------------|---------------|----------|
| Node 1  | 6379         | 6379          | 16379    |
| Node 2  | 6379         | 6380          | 16380    |
| Node 3  | 6379         | 6381          | 16381    |
| Node 4  | 6379         | 6382          | 16382    |
| Node 5  | 6379         | 6383          | 16383    |
| Node 6  | 6379         | 6384          | 16384    |

## Configuration Highlights

### Memory Management
- **Max Memory**: 64GB
- **Eviction Policy**: allkeys-lru (evict least recently used keys)
- **Lazy Freeing**: Enabled for better performance
- **Active Defragmentation**: Enabled

### Persistence
- **AOF**: Enabled (appendonly.aof)
- **Fsync**: Every second (good balance between durability and performance)
- **RDB**: Disabled (we rely on AOF)
- **AOF Rewrite**: Automatic when file grows 100% and exceeds 64MB

### Performance Tuning
- **IO Threads**: 4 (for parallel I/O)
- **IO Threads Read**: Enabled
- **Active Rehashing**: Enabled
- **Dynamic Hz**: Enabled

### High Availability
- **Cluster Node Timeout**: 15 seconds
- **Automatic Failover**: Enabled
- **Replica Priority**: 100
- **Require Full Coverage**: Yes

## Common Operations

### Connect to a Node

```bash
# Connect to primary node 1
docker exec -it blockd-redis-node-1 redis-cli

# Connect to a specific node
docker exec -it blockd-redis-node-2 redis-cli -h 172.28.0.12
```

### Check Memory Usage

```bash
docker exec blockd-redis-node-1 redis-cli info memory
```

### Monitor Commands in Real-time

```bash
docker exec -it blockd-redis-node-1 redis-cli monitor
```

### Check Slow Queries

```bash
docker exec blockd-redis-node-1 redis-cli slowlog get 10
```

### Benchmark Performance

```bash
docker exec blockd-redis-node-1 redis-benchmark -h 172.28.0.11 -p 6379 -c 50 -n 100000
```

## Cluster Management

### Add a New Node

```bash
# Start new node with cluster config
docker run -d --name redis-node-7 --network redis-cluster redis:8.4-alpine redis-server --cluster-enabled yes

# Add to cluster
redis-cli --cluster add-node 172.28.0.17:6379 172.28.0.11:6379
```

### Remove a Node

```bash
# First, reshard the data
redis-cli --cluster reshard 172.28.0.11:6379

# Then remove the node
redis-cli --cluster del-node 172.28.0.11:6379 <node-id>
```

### Rebalance the Cluster

```bash
redis-cli --cluster rebalance 172.28.0.11:6379 --cluster-use-empty-masters
```

## Backup and Recovery

### Backup AOF Files

```bash
# Backup all node data
docker run --rm -v redis-node-1-data:/data -v $(pwd)/backup:/backup alpine tar czf /backup/node-1-$(date +%Y%m%d).tar.gz /data
```

### Restore from Backup

```bash
# Stop the cluster
docker-compose down

# Restore data volume
docker run --rm -v redis-node-1-data:/data -v $(pwd)/backup:/backup alpine tar xzf /backup/node-1-20250101.tar.gz -C /

# Start the cluster
docker-compose up -d
```

### Manual AOF Rewrite

```bash
docker exec blockd-redis-node-1 redis-cli BGREWRITEAOF
```

## Monitoring

### Key Metrics to Monitor

1. **Memory Usage**
   ```bash
   docker exec blockd-redis-node-1 redis-cli info memory | grep used_memory_human
   ```

2. **Operations per Second**
   ```bash
   docker exec blockd-redis-node-1 redis-cli info stats | grep instantaneous_ops_per_sec
   ```

3. **Connected Clients**
   ```bash
   docker exec blockd-redis-node-1 redis-cli info clients | grep connected_clients
   ```

4. **Hit Rate**
   ```bash
   docker exec blockd-redis-node-1 redis-cli info stats | grep keyspace
   ```

5. **Cluster State**
   ```bash
   docker exec blockd-redis-node-1 redis-cli cluster info
   ```

## Troubleshooting

### Cluster Won't Initialize

1. Check if all nodes are running:
   ```bash
   docker-compose ps
   ```

2. Check logs:
   ```bash
   docker-compose logs redis-cluster-init
   ```

3. Manually create cluster:
   ```bash
   docker exec -it blockd-redis-node-1 redis-cli --cluster create \
     172.28.0.11:6379 172.28.0.12:6379 172.28.0.13:6379 \
     172.28.0.14:6379 172.28.0.15:6379 172.28.0.16:6379 \
     --cluster-replicas 1 --cluster-yes
   ```

### Node Unreachable

1. Check network connectivity:
   ```bash
   docker exec blockd-redis-node-1 ping 172.28.0.12
   ```

2. Check Redis logs:
   ```bash
   docker logs blockd-redis-node-1
   ```

3. Restart the node:
   ```bash
   docker-compose restart redis-node-1
   ```

### High Memory Usage

1. Check current memory:
   ```bash
   docker exec blockd-redis-node-1 redis-cli info memory
   ```

2. Check largest keys:
   ```bash
   docker exec blockd-redis-node-1 redis-cli --bigkeys
   ```

3. Manually trigger eviction:
   ```bash
   docker exec blockd-redis-node-1 redis-cli config set maxmemory-policy allkeys-lru
   ```

### Slow Performance

1. Check slow log:
   ```bash
   docker exec blockd-redis-node-1 redis-cli slowlog get 10
   ```

2. Check latency:
   ```bash
   docker exec blockd-redis-node-1 redis-cli --latency
   ```

3. Check fragmentation:
   ```bash
   docker exec blockd-redis-node-1 redis-cli info memory | grep mem_fragmentation_ratio
   ```

## Security Considerations

### Production Deployment

For production deployment, make sure to:

1. **Enable Password Authentication**
   - Set `REDIS_PASSWORD` environment variable
   - Update `redis.conf` with `requirepass` and `masterauth`

2. **Enable TLS/SSL**
   ```conf
   tls-port 6380
   tls-cert-file /path/to/redis.crt
   tls-key-file /path/to/redis.key
   tls-ca-cert-file /path/to/ca.crt
   ```

3. **Configure Firewall Rules**
   - Restrict access to Redis ports
   - Allow only application servers

4. **Enable Redis ACLs**
   ```bash
   ACL SETUSER blockd-app on >strong-password ~* +@all
   ```

5. **Regular Security Audits**
   - Update Redis to latest version
   - Review and rotate passwords
   - Monitor access logs

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_CLUSTER_ENABLED` | `true` | Enable cluster mode |
| `REDIS_HOST` | `localhost` | Redis host (standalone mode) |
| `REDIS_PORT` | `6379` | Redis port (standalone mode) |
| `REDIS_PASSWORD` | - | Authentication password |
| `REDIS_DB` | `0` | Database number (standalone only) |

## Performance Benchmarks

Expected performance on modern hardware:

- **GET operations**: 100,000+ ops/sec per node
- **SET operations**: 80,000+ ops/sec per node
- **INCR operations**: 50,000+ ops/sec per node
- **Latency (p50)**: < 1ms
- **Latency (p99)**: < 10ms

Run your own benchmarks:
```bash
docker exec blockd-redis-node-1 redis-benchmark -t get,set,incr,lpush,lpop -n 100000 -q
```

## Additional Resources

- [Redis Documentation](https://redis.io/documentation)
- [Redis Cluster Tutorial](https://redis.io/topics/cluster-tutorial)
- [Redis Persistence](https://redis.io/topics/persistence)
- [Redis Security](https://redis.io/topics/security)
- [Redis Best Practices](https://redis.io/topics/best-practices)

## Support

For issues or questions:
1. Check the logs: `docker-compose logs`
2. Review cluster status: `redis-cli cluster info`
3. Consult Redis documentation
4. Contact the development team
