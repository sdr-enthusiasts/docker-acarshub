#!/usr/bin/env bash

# Development watch script for ACARS Hub
# This script watches for changes in the TypeScript frontend and automatically
# rebuilds and copies the assets to the Flask static directory

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TS_DIR="$SCRIPT_DIR/acarshub-typescript"
WEBAPP_DIR="$SCRIPT_DIR/rootfs/webapp"
STATIC_DIR="$WEBAPP_DIR/static"
TEMPLATES_DIR="$WEBAPP_DIR/templates"

echo -e "${GREEN}ACARS Hub Development Watch${NC}"
echo "================================"
echo "TypeScript source: $TS_DIR"
echo "Flask static dir:  $STATIC_DIR"
echo "Flask templates:   $TEMPLATES_DIR"
echo ""

# Function to copy built assets
copy_assets() {
    echo -e "${YELLOW}Copying assets to Flask directories...${NC}"

    # Copy JavaScript files
    if [ -d "$TS_DIR/dist/static/js" ]; then
        echo "  → Copying JS files..."
        cp -r "$TS_DIR/dist/static/js/"* "$STATIC_DIR/js/" 2>/dev/null || true
    fi

    # Copy images
    if [ -d "$TS_DIR/dist/static/images" ]; then
        echo "  → Copying images..."
        cp -r "$TS_DIR/dist/static/images/"* "$STATIC_DIR/images/" 2>/dev/null || true
    fi

    # Copy sounds
    if [ -d "$TS_DIR/dist/static/sounds" ]; then
        echo "  → Copying sounds..."
        cp -r "$TS_DIR/dist/static/sounds/"* "$STATIC_DIR/sounds/" 2>/dev/null || true
    fi

    # Copy index.html to templates
    if [ -f "$TS_DIR/dist/static/index.html" ]; then
        echo "  → Copying index.html..."
        cp "$TS_DIR/dist/static/index.html" "$TEMPLATES_DIR/index.html"
    fi

    # Copy helppage.MD to templates
    if [ -f "$TS_DIR/dist/helppage.MD" ]; then
        echo "  → Copying helppage.MD..."
        cp "$TS_DIR/dist/helppage.MD" "$TEMPLATES_DIR/helppage.MD"
    fi

    echo -e "${GREEN}✓ Assets copied successfully${NC}"
    echo ""
}

# Initial build
echo -e "${YELLOW}Running initial build...${NC}"
cd "$TS_DIR"
npm run build-dev

# Copy initial build
copy_assets

# Watch for changes
echo -e "${GREEN}Watching for changes... (Press Ctrl+C to stop)${NC}"
echo ""

# Use inotifywait if available, otherwise fall back to webpack watch
if command -v inotifywait &>/dev/null; then
    # Run webpack in watch mode in the background
    npm run watch &
    WEBPACK_PID=$!

    # Watch the dist directory for changes and copy
    inotifywait -m -r -e close_write,moved_to,create "$TS_DIR/dist" |
        while read -r _ _ filename; do
            echo -e "${YELLOW}Detected change: $filename${NC}"
            copy_assets
        done

    # Cleanup on exit
    trap 'kill $WEBPACK_PID 2>/dev/null' EXIT
else
    echo -e "${YELLOW}inotifywait not found. Using webpack watch with manual copy.${NC}"
    echo -e "${YELLOW}Install inotify-tools for automatic asset copying:${NC}"
    echo -e "${YELLOW}  Ubuntu/Debian: sudo apt-get install inotify-tools${NC}"
    echo -e "${YELLOW}  macOS: brew install fswatch${NC}"
    echo ""
    echo -e "${YELLOW}After each build completes, assets will be copied.${NC}"
    echo ""

    # Use webpack's watch mode with a callback to copy after each build
    # This is less efficient but works without inotifywait
    cd "$TS_DIR"

    # Run webpack watch and grep for compilation messages
    npm run watch 2>&1 | while IFS= read -r line; do
        echo "$line"
        if echo "$line" | grep -q "webpack.*compiled"; then
            copy_assets
        fi
    done
fi
