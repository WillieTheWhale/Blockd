#!/bin/bash
# Quick start script for RabbitMQ cluster

set -e

echo "=========================================="
echo "Starting Blockd RabbitMQ Infrastructure"
echo "=========================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "Error: docker-compose is not installed"
    exit 1
fi

# Start the cluster
echo "Starting RabbitMQ cluster and Redis..."
docker-compose up -d

echo ""
echo "Waiting for services to be ready..."
sleep 15

# Health checks
echo ""
echo "=========================================="
echo "Health Checks"
echo "=========================================="

echo -n "Node 1: "
if docker exec blockd-rabbitmq-node1 rabbitmq-diagnostics -q ping 2>/dev/null; then
    echo "✓ Healthy"
else
    echo "✗ Unhealthy"
fi

echo -n "Node 2: "
if docker exec blockd-rabbitmq-node2 rabbitmq-diagnostics -q ping 2>/dev/null; then
    echo "✓ Healthy"
else
    echo "✗ Unhealthy"
fi

echo -n "Node 3: "
if docker exec blockd-rabbitmq-node3 rabbitmq-diagnostics -q ping 2>/dev/null; then
    echo "✓ Healthy"
else
    echo "✗ Unhealthy"
fi

echo -n "Redis: "
if docker exec blockd-redis-celery redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "✓ Healthy"
else
    echo "✗ Unhealthy"
fi

# Cluster status
echo ""
echo "=========================================="
echo "Cluster Status"
echo "=========================================="
docker exec blockd-rabbitmq-node1 rabbitmqctl cluster_status 2>/dev/null || echo "Error getting cluster status"

# Queue status
echo ""
echo "=========================================="
echo "Queue Status"
echo "=========================================="
docker exec blockd-rabbitmq-node1 rabbitmqctl list_queues name messages consumers 2>/dev/null || echo "Error getting queue status"

# Access information
echo ""
echo "=========================================="
echo "Access Information"
echo "=========================================="
echo "RabbitMQ Management UI:"
echo "  Node 1: http://localhost:15672"
echo "  Node 2: http://localhost:15673"
echo "  Node 3: http://localhost:15674"
echo ""
echo "Credentials:"
echo "  Username: blockd_user"
echo "  Password: blockd_password_change_in_production"
echo ""
echo "AMQP Ports:"
echo "  Node 1: localhost:5672"
echo "  Node 2: localhost:5673"
echo "  Node 3: localhost:5674"
echo ""
echo "Redis:"
echo "  Port: localhost:6379"
echo ""
echo "=========================================="
echo "✓ RabbitMQ cluster is ready!"
echo "=========================================="
