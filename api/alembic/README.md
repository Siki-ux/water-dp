# Alembic Migrations for water_dp Schema

## Overview

This directory contains Alembic migrations for the `water_dp` schema within the TSM database.

## Setup

The migrations target the `water_dp` schema. The database URL should point to the TSM database:

```
DATABASE_URL=postgresql://postgres:postgres@database:5432/postgres?options=-csearch_path=water_dp,public
```

## Commands

### Run migrations

```bash
# From water_dp-api directory
alembic upgrade head

# Or via Docker
docker-compose exec water-dp-api alembic upgrade head
```

### Check current version

```bash
alembic current
```

### Create a new migration (after modifying models)

```bash
# Auto-generate from model changes
alembic revision --autogenerate -m "description of change"

# Or create empty migration
alembic revision -m "description of change"
```

### Downgrade

```bash
# Downgrade one step
alembic downgrade -1

# Downgrade to specific revision
alembic downgrade 0001

# Downgrade all (dangerous!)
alembic downgrade base
```

## Migration History

| Revision | Description |
|----------|-------------|
| 0001 | Baseline schema - creates all water_dp tables |

## Schema Configuration

All models inherit from `BaseModel` which sets:
- `__table_args__ = {'schema': 'water_dp'}`

The `alembic_version` table is also created in the `water_dp` schema.

## Alternative: Raw SQL

The `tsm-orchestration/src/sql/water_dp/` directory contains equivalent raw SQL files. You can use either approach:

- **Alembic**: Best for development, auto-generates migrations from model changes
- **Raw SQL**: Best for production, explicit control, matches TSM pattern

To deploy via raw SQL instead of Alembic:
```bash
docker-compose exec -T database psql -U postgres < src/sql/water_dp/000_deploy_all.sql
```

## Handling Existing Schema

If the schema already exists (deployed via SQL), stamp Alembic to skip the baseline:

```bash
# Mark as already at revision 0001
alembic stamp 0001
```

This tells Alembic "the database is already at revision 0001" without running migrations.
