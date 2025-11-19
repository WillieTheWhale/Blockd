# Database Migration Versions

This directory contains Alembic migration scripts for the Blockd database.

## Migration Files

- `001_initial_schema.py` - Initial database schema with all core tables

## Creating New Migrations

To create a new migration:

```bash
cd database/migrations
alembic revision -m "description_of_changes"
```

To auto-generate a migration from model changes:

```bash
alembic revision --autogenerate -m "description_of_changes"
```

## Running Migrations

Apply all pending migrations:

```bash
alembic upgrade head
```

Rollback one migration:

```bash
alembic downgrade -1
```

Rollback to specific revision:

```bash
alembic downgrade <revision_id>
```

## Migration Naming Convention

Use descriptive names with the following prefixes:
- `add_` - Adding new tables or columns
- `modify_` - Changing existing structures
- `remove_` - Dropping tables or columns
- `index_` - Adding or modifying indexes
- `data_` - Data migrations

Examples:
- `add_user_preferences_table.py`
- `modify_sessions_add_recording_url.py`
- `index_detection_events_performance.py`
