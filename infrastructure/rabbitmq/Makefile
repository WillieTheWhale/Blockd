# Makefile for RabbitMQ Infrastructure Management

.PHONY: help start stop restart status logs clean test health

help:
	@echo "RabbitMQ Infrastructure Management"
	@echo "=================================="
	@echo "make start     - Start RabbitMQ cluster and Redis"
	@echo "make stop      - Stop all containers"
	@echo "make restart   - Restart all containers"
	@echo "make status    - Show cluster status"
	@echo "make logs      - Show container logs"
	@echo "make health    - Run health checks"
	@echo "make test      - Run test suite"
	@echo "make clean     - Remove all containers and volumes"
	@echo "make ui        - Open management UI"

start:
	@echo "Starting RabbitMQ cluster..."
	docker-compose up -d
	@echo "Waiting for cluster to be ready..."
	@sleep 10
	@make health

stop:
	@echo "Stopping RabbitMQ cluster..."
	docker-compose down

restart:
	@echo "Restarting RabbitMQ cluster..."
	docker-compose restart
	@sleep 5
	@make health

status:
	@echo "=== Container Status ==="
	docker-compose ps
	@echo ""
	@echo "=== Cluster Status ==="
	docker exec blockd-rabbitmq-node1 rabbitmqctl cluster_status
	@echo ""
	@echo "=== Queue Status ==="
	docker exec blockd-rabbitmq-node1 rabbitmqctl list_queues name messages consumers

logs:
	docker-compose logs -f

logs-node1:
	docker logs -f blockd-rabbitmq-node1

logs-node2:
	docker logs -f blockd-rabbitmq-node2

logs-node3:
	docker logs -f blockd-rabbitmq-node3

logs-redis:
	docker logs -f blockd-redis-celery

health:
	@echo "=== Health Checks ==="
	@echo "Node 1:"
	@docker exec blockd-rabbitmq-node1 rabbitmq-diagnostics -q ping && echo "  ✓ Node 1 healthy" || echo "  ✗ Node 1 unhealthy"
	@echo "Node 2:"
	@docker exec blockd-rabbitmq-node2 rabbitmq-diagnostics -q ping && echo "  ✓ Node 2 healthy" || echo "  ✗ Node 2 unhealthy"
	@echo "Node 3:"
	@docker exec blockd-rabbitmq-node3 rabbitmq-diagnostics -q ping && echo "  ✓ Node 3 healthy" || echo "  ✗ Node 3 unhealthy"
	@echo "Redis:"
	@docker exec blockd-redis-celery redis-cli ping && echo "  ✓ Redis healthy" || echo "  ✗ Redis unhealthy"

test:
	@echo "Running Python tests..."
	cd ../../backend/shared/queue && python test_publisher.py

clean:
	@echo "WARNING: This will remove all containers and volumes!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose down -v; \
		echo "Cleanup complete"; \
	fi

ui:
	@echo "Opening RabbitMQ Management UI..."
	@echo "URL: http://localhost:15672"
	@echo "Username: blockd_user"
	@echo "Password: blockd_password_change_in_production"
	@command -v open >/dev/null 2>&1 && open http://localhost:15672 || \
	 command -v xdg-open >/dev/null 2>&1 && xdg-open http://localhost:15672 || \
	 echo "Please open http://localhost:15672 in your browser"

purge-queue:
	@read -p "Enter queue name to purge: " queue; \
	docker exec blockd-rabbitmq-node1 rabbitmqctl purge_queue $$queue

list-queues:
	docker exec blockd-rabbitmq-node1 rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers

list-exchanges:
	docker exec blockd-rabbitmq-node1 rabbitmqctl list_exchanges name type durable

list-bindings:
	docker exec blockd-rabbitmq-node1 rabbitmqctl list_bindings

backup:
	@echo "Backing up RabbitMQ definitions..."
	docker exec blockd-rabbitmq-node1 rabbitmqctl export_definitions /tmp/definitions_backup.json
	docker cp blockd-rabbitmq-node1:/tmp/definitions_backup.json ./backup_$$(date +%Y%m%d_%H%M%S).json
	@echo "Backup complete"

restore:
	@read -p "Enter backup file path: " file; \
	docker cp $$file blockd-rabbitmq-node1:/tmp/restore.json; \
	docker exec blockd-rabbitmq-node1 rabbitmqctl import_definitions /tmp/restore.json; \
	echo "Restore complete"

metrics:
	@echo "Fetching Prometheus metrics..."
	curl -s http://localhost:15692/metrics | head -50

monitor:
	@echo "Starting real-time monitoring..."
	watch -n 2 'docker exec blockd-rabbitmq-node1 rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers'
