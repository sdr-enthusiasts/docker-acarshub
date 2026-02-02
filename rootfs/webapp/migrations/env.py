from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Import our SQLAlchemy models
import sys
import os

# Add parent directory to path so we can import acarshub_database
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# CRITICAL: Set this flag BEFORE importing acarshub_database
# This prevents the module from auto-creating tables and checking FTS
os.environ['ALEMBIC_MIGRATION_MODE'] = '1'

# Set environment variables to avoid configuration file loading issues
# during migrations (we don't need the full app config, just the DB models)
os.environ.setdefault('ACARSHUB_DB', 'sqlite:////run/acars/acars.db')
os.environ.setdefault('LOCAL_TEST', 'True')  # Use local test mode

# Create a minimal version file if it doesn't exist (for development)
version_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'version')
if not os.path.exists(version_path):
    # Create version file with a placeholder version
    os.makedirs(os.path.dirname(version_path), exist_ok=True)
    with open(version_path, 'w') as f:
        f.write('v0.0.0-dev\n')

# Import the declarative base and all models
from acarshub_database import Messages

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
# This is the metadata from our SQLAlchemy declarative base
target_metadata = Messages.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    # Check for SQLALCHEMY_URL environment variable first, fall back to alembic.ini
    url = os.environ.get("SQLALCHEMY_URL") or config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # SQLite-specific: render schema changes as batch operations
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    # Check for SQLALCHEMY_URL environment variable first, fall back to alembic.ini
    configuration = config.get_section(config.config_ini_section, {})
    if "SQLALCHEMY_URL" in os.environ:
        configuration["sqlalchemy.url"] = os.environ["SQLALCHEMY_URL"]

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # SQLite-specific: render schema changes as batch operations
            render_as_batch=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
