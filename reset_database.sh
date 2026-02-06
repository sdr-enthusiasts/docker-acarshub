#!/bin/bash
# Reset database to clean state for testing fixed migration

echo "🛑 Stopping Docker container..."
docker stop acarshub 2>/dev/null || echo "Container not running"

echo "🗑️  Removing corrupted database..."
sudo rm -f acars_data/messages.db*

echo "✅ Database reset complete!"
echo ""
echo "Next steps:"
echo "1. Rebuild Docker image with fixed migration"
echo "2. Start container - migration will run cleanly on empty database"
