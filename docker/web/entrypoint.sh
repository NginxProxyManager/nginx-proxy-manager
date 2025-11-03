#!/bin/sh
set -e

# This script runs as root first to fix permissions, then switches to nextjs user

DB_PATH="${DATABASE_PATH:-/app/data/caddy-proxy-manager.db}"
DB_DIR=$(dirname "$DB_PATH")

echo "Setting up database directory permissions..."

# Ensure the data directory is owned by nextjs user
chown -R nextjs:nodejs "$DB_DIR"

# Switch to nextjs user and initialize database if needed
gosu nextjs sh -c '
    DB_PATH="'"$DB_PATH"'"

    # Set npm cache to writable directory
    export NPM_CONFIG_CACHE=/tmp/.npm

    if [ ! -f "$DB_PATH" ]; then
        echo "Database not found, initializing..."
        npx prisma db push --skip-generate
        echo "Database initialized successfully"
    else
        echo "Database exists, applying any schema changes..."
        npx prisma db push --skip-generate --accept-data-loss 2>/dev/null || true
    fi

    echo "Starting application..."
    export HOSTNAME="0.0.0.0"
    exec node server.js
'