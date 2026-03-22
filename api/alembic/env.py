"""
Alembic environment configuration for database migrations.
Configured for water_dp schema within TSM database.
"""

import os
import sys
from logging.config import fileConfig

from sqlalchemy import create_engine, pool, text
from sqlalchemy.engine import Connection

from alembic import context

# Add the app directory to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.database import Base
from app.models import *  # noqa: F401, F403

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here for 'autogenerate' support
target_metadata = Base.metadata

# Schema to use for migrations
SCHEMA = "water_dp"


def get_url():
    """Get database URL from settings or environment."""
    return os.getenv("DATABASE_URL", settings.database_url)


def include_object(object, name, type_, reflected, compare_to):
    """Filter objects to only include those in the water_dp schema."""
    if type_ == "table":
        # Only include tables from water_dp schema
        return object.schema == SCHEMA or object.schema is None
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.
    """
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table_schema=SCHEMA,
        include_schemas=True,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.execute(f"SET search_path TO {SCHEMA}, public")
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Run migrations with database connection."""
    # Create schema if not exists
    connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))
    connection.commit()

    # Set search_path to water_dp schema
    connection.execute(text(f"SET search_path TO {SCHEMA}, public"))

    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table_schema=SCHEMA,
        include_schemas=True,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    url = get_url()

    connectable = create_engine(
        url,
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        do_run_migrations(connection)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
