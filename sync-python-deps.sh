#!/usr/bin/env bash

# Copyright (C) 2022-2026 Frederick Clausen II
# This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
#
# acarshub is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# acarshub is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQUIREMENTS_FILE="${SCRIPT_DIR}/rootfs/webapp/requirements.txt"
PYPROJECT_FILE="${SCRIPT_DIR}/pyproject.toml"

echo "🔄 Syncing Python dependencies..."
echo ""

# Step 1: Export from pyproject.toml to requirements.txt
echo "📝 Exporting dependencies from pyproject.toml..."
pdm export --without-hashes -o "${REQUIREMENTS_FILE}"

# Step 2: Fix git-based dependencies
# PDM exports git dependencies with full URL and commit hash, but we want to preserve
# the format from pyproject.toml for git dependencies
echo "🔧 Fixing git-based dependencies..."

# Extract rrdtool line from pyproject.toml
RRDTOOL_LINE=$(grep "rrdtool" "${PYPROJECT_FILE}" | sed 's/^[[:space:]]*//' | sed 's/"//g' | sed 's/,$//')

if [ -n "$RRDTOOL_LINE" ]; then
    # Get the current git commit hash from the generated requirements.txt
    RRDTOOL_GENERATED=$(grep "rrdtool" "${REQUIREMENTS_FILE}" || echo "")

    if [ -n "$RRDTOOL_GENERATED" ]; then
        # Extract commit hash from the generated line (format: rrdtool @git+...@<hash>)
        COMMIT_HASH=$(echo "$RRDTOOL_GENERATED" | sed -n 's/.*@\([a-f0-9]\{40\}\).*/\1/p')

        if [ -n "$COMMIT_HASH" ]; then
            # Replace the line in requirements.txt with proper format
            sed -i "s|rrdtool.*|rrdtool @git+https://github.com/fredclausen/python-rrdtool.git@${COMMIT_HASH}|" "${REQUIREMENTS_FILE}"
            echo "  ✓ Fixed rrdtool git dependency (commit: ${COMMIT_HASH:0:7})"
        else
            echo "  ⚠️  Could not extract commit hash for rrdtool"
        fi
    fi
fi

# Step 3: Verify alembic version matches between files
ALEMBIC_PYPROJECT=$(grep "alembic==" "${PYPROJECT_FILE}" | sed 's/.*alembic==\([^"]*\).*/\1/')
ALEMBIC_REQUIREMENTS=$(grep "alembic==" "${REQUIREMENTS_FILE}" | sed 's/alembic==\([^,]*\).*/\1/')

if [ "$ALEMBIC_PYPROJECT" != "$ALEMBIC_REQUIREMENTS" ]; then
    echo "  ⚠️  WARNING: Alembic version mismatch!"
    echo "     pyproject.toml: ${ALEMBIC_PYPROJECT}"
    echo "     requirements.txt: ${ALEMBIC_REQUIREMENTS}"
fi

echo ""
echo "✅ Python dependencies synced!"
echo ""
echo "📋 Summary:"
echo "   pyproject.toml: ${PYPROJECT_FILE}"
echo "   requirements.txt: ${REQUIREMENTS_FILE}"
echo ""
echo "⚠️  NOTE: Review the changes before committing!"
echo "   Git-based dependencies may need manual verification."
