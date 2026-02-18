#!/command/with-contenv bash
# shellcheck shell=bash

# Node.js backend (Fastify + Drizzle) runs all database migrations automatically
# at startup inside server.ts via runMigrations(). There is no separate migration
# step needed here as there is in the Python/Alembic version.

exit 0
