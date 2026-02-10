# Development Environment Setup

Complete guide for setting up ACARS Hub development environment.

## Table of Contents

- [System Requirements](#system-requirements)
- [Quick Setup (Nix Flakes)](#quick-setup-nix-flakes)
- [Manual Setup](#manual-setup)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Platform-Specific Notes](#platform-specific-notes)

---

## System Requirements

### Minimum Requirements

- **OS**: Linux, macOS, or WSL2 (Windows)
- **RAM**: 4GB minimum, 8GB recommended
- **Disk**: 2GB free space (more for Nix)
- **Network**: Internet connection for dependencies

### Supported Platforms

- ✅ **Linux**: Ubuntu 20.04+, Debian 11+, Fedora 36+, Arch
- ✅ **macOS**: 12.0 (Monterey) or later (Intel and Apple Silicon)
- ✅ **Windows**: WSL2 (Ubuntu 20.04+ recommended)

---

## Quick Setup (Nix Flakes)

### Why Nix?

Nix provides:

- **Reproducible environments**: Everyone gets the exact same tools
- **Isolated dependencies**: No conflicts with system packages
- **Automatic setup**: Pre-commit hooks, tools, everything configured
- **Cross-platform**: Works same on Linux, macOS, WSL2

### Install Nix

#### Linux / WSL2

```bash
# Install Nix with flakes enabled
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install

# Reload shell
source ~/.bashrc  # or ~/.zshrc
```

#### macOS

```bash
# Install Nix with flakes enabled
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install

# Reload shell
source ~/.zshrc  # or ~/.bash_profile
```

**Verify installation**:

```bash
nix --version
# Should show: nix (Nix) 2.x.x
```

### Install direnv (Optional but Recommended)

`direnv` automatically activates the Nix environment when you `cd` into the project:

#### Linux

```bash
# Ubuntu/Debian
sudo apt install direnv

# Fedora
sudo dnf install direnv

# Arch
sudo pacman -S direnv
```

#### macOS - Install direnv

```bash
brew install direnv
```

#### Configure Shell Integration

Add to your shell config:

**Bash** (`~/.bashrc`):

```bash
eval "$(direnv hook bash)"
```

**Zsh** (`~/.zshrc`):

```bash
eval "$(direnv hook zsh)"
```

**Fish** (`~/.config/fish/config.fish`):

```fish
direnv hook fish | source
```

Then reload:

```bash
source ~/.bashrc  # or ~/.zshrc
```

### Clone and Enter Environment

```bash
# Clone repository
git clone https://github.com/sdr-enthusiasts/docker-acarshub.git
cd docker-acarshub

# With direnv (automatic)
direnv allow
# First time will take 5-10 minutes to download and build

# OR manually
nix develop
```

### Install Project Dependencies

```bash
# Python dependencies
pdm install

# Node.js dependencies
cd acarshub-react
npm install
cd ..

# Setup environment
cp .env.example .env
nano .env  # Set LOCAL_TEST=true

# Initialize test database
just db-init test.db
```

### Verify Setup

```bash
# Run all quality checks
just ci

# Start development servers
./dev-watch.sh  # Terminal 1
pdm run dev     # Terminal 2

# Open http://localhost:8080
```

---

## Manual Setup

If you can't or don't want to use Nix, install tools manually.

### Prerequisites

#### 1. Python 3.9+

**Linux**:

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install python3 python3-pip python3-venv

# Fedora
sudo dnf install python3 python3-pip

# Arch
sudo pacman -S python python-pip
```

**macOS**:

```bash
brew install python@3.13
```

**Verify**:

```bash
python3 --version
# Should be 3.9 or higher
```

#### 2. PDM (Python Dependency Manager)

```bash
# Linux/macOS/WSL2
curl -sSL https://pdm-project.org/install-pdm.py | python3 -

# Add to PATH (add to ~/.bashrc or ~/.zshrc)
export PATH="$HOME/.local/bin:$PATH"

# Verify
pdm --version
```

#### 3. Node.js 18+

**Linux**:

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# OR using NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

**macOS**:

```bash
# Using nvm (recommended)
brew install nvm
nvm install 18
nvm use 18

# OR using brew
brew install node@18
```

**Verify**:

```bash
node --version
# Should be v18.x.x or higher

npm --version
```

#### 4. Just (Command Runner)

```bash
# Linux
curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to ~/.local/bin

# macOS
brew install just

# Verify
just --version
```

#### 5. SQLite

**Linux**:

```bash
# Ubuntu/Debian
sudo apt install sqlite3

# Fedora
sudo dnf install sqlite

# Arch
sudo pacman -S sqlite
```

**macOS**:

```bash
# Usually pre-installed, but if needed:
brew install sqlite
```

**Verify**:

```bash
sqlite3 --version
```

#### 6. Biome (Linting/Formatting)

```bash
# Install globally
npm install -g @biomejs/biome

# Verify
biome --version
```

#### 7. Playwright (E2E Testing)

```bash
# Will be installed with npm dependencies
# After npm install, install browsers:
cd acarshub-react
npx playwright install
cd ..
```

### Install Dependencies (Manual Setup)

```bash
# Clone repository
git clone https://github.com/sdr-enthusiasts/docker-acarshub.git
cd docker-acarshub

# Python dependencies
pdm install

# Node.js dependencies
cd acarshub-react
npm install
cd ..

# Setup environment
cp .env.example .env
nano .env  # Set LOCAL_TEST=true

# Initialize test database
just db-init test.db
```

### Setup Pre-commit Hooks

```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install
```

---

## Environment Configuration

### .env File

Copy the example and customize:

```bash
cp .env.example .env
```

### Essential Settings for Development

```bash
# Development mode (REQUIRED)
LOCAL_TEST=true

# Database path
ACARSHUB_DB=/path/to/your/test.db

# Optional: ADSB integration
ENABLE_ADSB=False
ADSB_URL=http://localhost:8080/tar1090
ADSB_LAT=0
ADSB_LON=0

# Optional: Decoders (for testing with real data)
ENABLE_ACARS=False
ACARSDEC_STATION_ID=TEST
ACARSDEC_SOURCE=127.0.0.1:15550

ENABLE_VDLM2=False
VDLM2DEC_STATION_ID=TEST
VDLM2DEC_SOURCE=127.0.0.1:15555
```

### What Each Setting Does

**LOCAL_TEST**:

- `true`: Development mode (port 8080, no caching, auto-reload)
- `false`: Production mode (port 8888, nginx proxy, caching)

**ACARSHUB_DB**:

- Path to SQLite database
- Use absolute path or relative to project root
- Default: `test.db`

**ENABLE_ADSB**:

- `True`: Show aircraft on map (requires ADSB source)
- `False`: Disable map/ADSB features

**Decoder Settings**:

- Only needed if testing with real ACARS/VDLM data
- Can leave disabled for UI-only development

### Environment Variable Precedence

1. Actual environment variables (highest priority)
2. `.env` file
3. Default values in code (lowest priority)

---

## Database Setup

### Initialize Fresh Database

```bash
# Create new database with all migrations
just db-init test.db
```

This:

- Deletes existing `test.db` if present
- Creates new database
- Applies all Alembic migrations
- Sets up tables and indexes

### Apply Migrations to Existing Database

```bash
# Update existing database
just db-migrate test.db
```

Use this when:

- Pulling new code with database changes
- Switching branches with different schema

### Manual Database Management

```bash
# Access database directly
sqlite3 test.db

# View tables
.tables

# View schema
.schema messages

# Exit
.quit
```

### Database Migrations

Located in `rootfs/webapp/alembic/versions/`:

```bash
# Create new migration (if you changed models)
cd rootfs/webapp
alembic -x dbPath=../../test.db revision --autogenerate -m "Description of change"

# Apply migration
alembic -x dbPath=../../test.db upgrade head

# Rollback migration
alembic -x dbPath=../../test.db downgrade -1
```

---

## Verification

### 1. Check Tool Versions

```bash
python3 --version   # 3.9+
pdm --version       # 2.0+
node --version      # v18+
npm --version       # 9+
just --version      # 1.0+
sqlite3 --version   # 3.0+
biome --version     # 1.0+
```

### 2. Run Quality Checks

```bash
# Full CI check
just ci
```

Should output:

```text
Running TypeScript checks...
✓ No TypeScript errors

Running Biome checks...
✓ All files formatted correctly
✓ No linting errors

Running tests...
✓ 156 tests passing

Running pre-commit hooks...
✓ All hooks passed

✅ All checks passed!
```

### 3. Test Development Servers

**Terminal 1**:

```bash
./dev-watch.sh
```

Should show:

```text
Building frontend...
✓ Build complete
Watching for changes...
```

**Terminal 2**:

```bash
pdm run dev
```

Should show:

```text
* Running on http://127.0.0.1:8080
* Restarting with stat
```

### 4. Access Application

Open browser to `http://localhost:8080`

You should see:

- ACARS Hub interface
- No console errors in DevTools
- Responsive layout on mobile sizes

---

## Troubleshooting

### Nix Issues

#### "Nix command not found"

```bash
# Reload shell configuration
source ~/.bashrc  # or ~/.zshrc

# Or restart terminal
```

#### "experimental features 'nix-command flakes' are not enabled"

```bash
# Add to ~/.config/nix/nix.conf
mkdir -p ~/.config/nix
echo "experimental-features = nix-command flakes" >> ~/.config/nix/nix.conf
```

#### "building takes forever"

First time setup downloads all dependencies. Subsequent runs are instant.

```bash
# Check what's being built
nix develop --print-build-logs
```

#### direnv not activating

```bash
# Check if hook is installed
direnv version

# Re-allow the directory
direnv allow

# Check for errors
direnv status
```

### PDM Issues

#### "pdm: command not found"

```bash
# Add to PATH
export PATH="$HOME/.local/bin:$PATH"

# Add to shell config for persistence
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
```

#### "No Python interpreter found"

```bash
# PDM can't find Python
pdm use python3

# Or specify version
pdm use 3.13
```

#### "Lock file is not up to date"

```bash
# Update lock file
pdm lock
pdm install
```

### Node/npm Issues

#### "EACCES: permission denied"

```bash
# Fix npm permissions
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# Add to shell config
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
```

#### "Module not found"

```bash
# Clean and reinstall
cd acarshub-react
rm -rf node_modules package-lock.json
npm install
cd ..
```

### Database Issues

#### "database is locked"

```bash
# Another process is using database
# Find and kill process
lsof test.db
kill -9 <PID>
```

#### "no such table"

```bash
# Database not initialized or outdated
just db-init test.db
```

### Build Issues

#### "Biome not found"

```bash
# Install globally
npm install -g @biomejs/biome

# Or use via npx
npx biome check acarshub-react/
```

#### "TypeScript errors"

```bash
# Check from correct directory
cd acarshub-react
npx tsc --noEmit

# Common issues:
# - Missing types: npm install --save-dev @types/package-name
# - Outdated types: npm update
```

### Platform-Specific Issues

#### macOS: "xcrun: error"

```bash
# Install Xcode Command Line Tools
xcode-select --install
```

#### WSL2: "watch limit reached"

```bash
# Increase file watch limit
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

#### Linux: "inotify-tools not found"

```bash
# Required for dev-watch.sh
sudo apt install inotify-tools  # Ubuntu/Debian
sudo dnf install inotify-tools  # Fedora
sudo pacman -S inotify-tools    # Arch
```

---

## Platform-Specific Notes

### Linux Considerations

- Use package manager for system dependencies
- Consider using Nix for reproducibility
- Watch for file descriptor limits with large projects

### macOS Considerations

- Xcode Command Line Tools required for native modules
- Use Homebrew for system packages
- Apple Silicon: Everything works but initial build is slower

### Windows (WSL2)

- **Use WSL2, not native Windows**
- Install Ubuntu 20.04+ from Microsoft Store
- Clone repo inside WSL filesystem (not /mnt/c)
- Use Windows Terminal for better experience

**WSL2 Setup**:

```bash
# Install WSL2
wsl --install

# Update WSL
wsl --update

# Set default to WSL2
wsl --set-default-version 2

# Launch Ubuntu
wsl
```

---

## Next Steps

After setup is complete:

1. **Read coding standards**: [AGENTS.md](../AGENTS.md)
2. **Learn the architecture**: [agent-docs/ARCHITECTURE.md](../agent-docs/ARCHITECTURE.md)
3. **Understand testing**: [TESTING_GUIDE.md](TESTING_GUIDE.md)
4. **Start contributing**: [CONTRIBUTING.md](CONTRIBUTING.md)

---

## Additional Resources

- **Nix Manual**: <https://nixos.org/manual/nix/stable/>
- **PDM Documentation**: <https://pdm-project.org/>
- **Just Manual**: <https://just.systems/man/en/>
- **direnv Documentation**: <https://direnv.net/>

---

## Getting Help

- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Search GitHub issues
- Ask in Discord (link in README.md)
- Create issue with setup logs
