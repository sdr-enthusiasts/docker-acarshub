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
pdm export --without-hashes --production -o "${REQUIREMENTS_FILE}"

# Step 1.5: Strip environment markers (python_version, platform_system, etc.)
# These are unnecessary for Docker builds with a fixed Python version
echo "🧹 Stripping environment markers..."
sed -i 's/; python_version[^;]*$//' "${REQUIREMENTS_FILE}"
sed -i 's/; platform_system[^;]*$//' "${REQUIREMENTS_FILE}"
sed -i 's/; platform_machine[^;]*$//' "${REQUIREMENTS_FILE}"
sed -i 's/; platform_python_implementation[^;]*$//' "${REQUIREMENTS_FILE}"
# Handle complex markers with multiple conditions
sed -i 's/; ([^;]*)python_version[^;]*$//' "${REQUIREMENTS_FILE}"
sed -i 's/; [^;]* or python_version[^;]*$//' "${REQUIREMENTS_FILE}"
sed -i 's/; [^;]* and python_version[^;]*$//' "${REQUIREMENTS_FILE}"

# Step 2: Fix git-based dependencies
# pyproject.toml uses git URL without commit (tracks HEAD/main for dev)
# requirements.txt needs pinned commit hash (for Docker reproducibility)
echo "🔧 Fixing git-based dependencies..."

# Hardcoded commit hash for rrdtool (for Docker builds)
# This should match the hash from the original requirements.txt
RRDTOOL_COMMIT="b522cab1db4039b21ef6e34e2221c2828ca72174"

# Check if rrdtool is in the generated requirements.txt
RRDTOOL_GENERATED=$(grep "rrdtool" "${REQUIREMENTS_FILE}" || echo "")

if [ -n "$RRDTOOL_GENERATED" ]; then
    # Replace with pinned commit hash
    sed -i "s|rrdtool.*|rrdtool @git+https://github.com/fredclausen/python-rrdtool.git@${RRDTOOL_COMMIT}|" "${REQUIREMENTS_FILE}"
    echo "  ✓ Fixed rrdtool git dependency (pinned to: ${RRDTOOL_COMMIT:0:7})"
    echo "  ℹ️  pyproject.toml tracks HEAD/main for development"
    echo "  ℹ️  requirements.txt uses pinned commit for Docker"
else
    echo "  ⚠️  rrdtool not found in requirements.txt"
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
echo ""
echo "📌 To update rrdtool commit hash:"
echo "   1. Check latest commit: git ls-remote https://github.com/fredclausen/python-rrdtool.git HEAD"
echo "   2. Update RRDTOOL_COMMIT in this script"
echo "   3. Re-run: ./sync-python-deps.sh"
