#!/bin/bash

# Redis Cluster Startup Script for Blockd Platform
# This script starts the Redis cluster and waits for it to be ready

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================="
echo "  Starting Redis Cluster for Blockd"
echo "========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: docker-compose is not installed${NC}"
    echo "Please install docker-compose first"
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    echo "Please start Docker first"
    exit 1
fi

# Stop any existing cluster
echo -e "${YELLOW}Stopping any existing Redis cluster...${NC}"
docker-compose down 2>/dev/null || true
echo ""

# Start the cluster
echo -e "${BLUE}Starting Redis cluster nodes...${NC}"
docker-compose up -d redis-node-1 redis-node-2 redis-node-3 redis-node-4 redis-node-5 redis-node-6

# Wait for nodes to be ready
echo -e "${BLUE}Waiting for Redis nodes to start (15 seconds)...${NC}"
sleep 15

# Check if all nodes are running
echo -e "${BLUE}Checking node health...${NC}"
for i in {1..6}; do
    if docker exec blockd-redis-node-$i redis-cli ping > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Node $i is healthy${NC}"
    else
        echo -e "${RED}✗ Node $i is not responding${NC}"
        exit 1
    fi
done
echo ""

# Initialize cluster
echo -e "${BLUE}Initializing Redis cluster...${NC}"
docker exec blockd-redis-node-1 redis-cli --cluster create \
    172.28.0.11:6379 \
    172.28.0.12:6379 \
    172.28.0.13:6379 \
    172.28.0.14:6379 \
    172.28.0.15:6379 \
    172.28.0.16:6379 \
    --cluster-replicas 1 \
    --cluster-yes

echo ""
echo -e "${BLUE}Waiting for cluster to stabilize (5 seconds)...${NC}"
sleep 5

# Verify cluster status
echo ""
echo -e "${BLUE}Verifying cluster status...${NC}"
CLUSTER_STATE=$(docker exec blockd-redis-node-1 redis-cli cluster info | grep cluster_state | cut -d: -f2 | tr -d '\r')

if [ "$CLUSTER_STATE" = "ok" ]; then
    echo -e "${GREEN}✓ Cluster is in OK state${NC}"
else
    echo -e "${RED}✗ Cluster state: $CLUSTER_STATE${NC}"
    exit 1
fi

# Show cluster nodes
echo ""
echo -e "${BLUE}Cluster nodes:${NC}"
docker exec blockd-redis-node-1 redis-cli cluster nodes

# Show cluster info
echo ""
echo -e "${BLUE}Cluster info:${NC}"
docker exec blockd-redis-node-1 redis-cli cluster info

# Test write and read
echo ""
echo -e "${BLUE}Testing cluster operations...${NC}"
docker exec blockd-redis-node-1 redis-cli set test:cluster:key "Hello Blockd" > /dev/null
TEST_VALUE=$(docker exec blockd-redis-node-2 redis-cli get test:cluster:key 2>/dev/null || echo "")

if [ "$TEST_VALUE" = "Hello Blockd" ]; then
    echo -e "${GREEN}✓ Cluster read/write test passed${NC}"
    docker exec blockd-redis-node-1 redis-cli del test:cluster:key > /dev/null
else
    echo -e "${RED}✗ Cluster read/write test failed${NC}"
    exit 1
fi

# Show connection info
echo ""
echo "========================================="
echo -e "${GREEN}  Redis Cluster Started Successfully!${NC}"
echo "========================================="
echo ""
echo "Connection Information:"
echo "  Node 1: localhost:6379 (172.28.0.11:6379)"
echo "  Node 2: localhost:6380 (172.28.0.12:6379)"
echo "  Node 3: localhost:6381 (172.28.0.13:6379)"
echo "  Node 4: localhost:6382 (172.28.0.14:6379)"
echo "  Node 5: localhost:6383 (172.28.0.15:6379)"
echo "  Node 6: localhost:6384 (172.28.0.16:6379)"
echo ""
echo "Useful Commands:"
echo "  Connect to cluster: docker exec -it blockd-redis-node-1 redis-cli"
echo "  View logs: docker-compose logs -f"
echo "  Stop cluster: docker-compose down"
echo "  Cluster status: docker exec blockd-redis-node-1 redis-cli cluster info"
echo ""
echo "Environment Variables (for application):"
echo "  export REDIS_CLUSTER_ENABLED=true"
echo "  export REDIS_HOST=172.28.0.11"
echo "  export REDIS_PORT=6379"
echo ""
