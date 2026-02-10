# Troubleshooting Guide

Common issues and solutions for ACARS Hub development.

## Table of Contents

- [Development Environment](#development-environment)
- [Build Issues](#build-issues)
- [Runtime Issues](#runtime-issues)
- [Testing Issues](#testing-issues)
- [Database Issues](#database-issues)
- [Performance Issues](#performance-issues)
- [Git Issues](#git-issues)
- [Platform-Specific Issues](#platform-specific-issues)

---

## Development Environment

### Nix Issues

#### "command not found: nix"

**Problem**: Nix not installed or not in PATH

**Solution**:

```bash
# Reload shell configuration
source ~/.bashrc  # or ~/.zshrc

# Or restart terminal

# If still not found, reinstall Nix
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```

#### "experimental features not enabled"

**Problem**: Flakes not enabled in Nix configuration

**Solution**:

```bash
# Create nix config directory
mkdir -p ~/.config/nix

# Enable flakes
echo "experimental-features = nix-command flakes" >> ~/.config/nix/nix.conf

# Restart nix daemon (Linux)
sudo systemctl restart nix-daemon

# Or just restart terminal
```

#### "building derivation takes forever"

**Problem**: First build downloads all dependencies

**Solution**:

- First time setup takes 5-10 minutes - this is normal
- Subsequent builds use cache and are instant
- Check what's building: `nix develop --print-build-logs`
- Use binary cache: Usually automatic, check `~/.config/nix/nix.conf`

#### direnv not activating

**Problem**: direnv not loading `.envrc`

**Solution**:

```bash
# Check direnv is installed
direnv version

# Allow the directory
direnv allow

# Check status
direnv status

# Add hook to shell if missing
echo 'eval "$(direnv hook bash)"' >> ~/.bashrc  # or ~/.zshrc
source ~/.bashrc
```

### PDM Issues

#### "pdm: command not found"

**Problem**: PDM not in PATH

**Solution**:

```bash
# Add PDM to PATH
export PATH="$HOME/.local/bin:$PATH"

# Make permanent
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Or reinstall
curl -sSL https://pdm-project.org/install-pdm.py | python3 -
```

#### "No Python interpreter found"

**Problem**: PDM can't find Python installation

**Solution**:

```bash
# Specify Python version
pdm use python3
# OR
pdm use 3.13

# Check Python installation
which python3
python3 --version
```

#### "Lock file out of date"

**Problem**: `pdm.lock` doesn't match `pyproject.toml`

**Solution**:

```bash
# Update lock file
pdm lock

# Install from updated lock
pdm install
```

### Node/npm Issues

#### "EACCES: permission denied"

**Problem**: npm trying to install globally without permissions

**Solution**:

```bash
# Configure npm to use local directory
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# Make permanent
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

#### "Module not found" after npm install

**Problem**: Dependencies not installed correctly

**Solution**:

```bash
cd acarshub-react

# Clean install
rm -rf node_modules package-lock.json
npm install

# If still failing, clear npm cache
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

#### "gyp ERR! build error"

**Problem**: Native module compilation failing

**Solution**:

```bash
# macOS - Install Xcode Command Line Tools
xcode-select --install

# Linux - Install build essentials
sudo apt install build-essential  # Ubuntu/Debian
sudo dnf groupinstall "Development Tools"  # Fedora

# Then retry
npm install
```

---

## Build Issues

### Frontend Build Issues

#### "Biome not found"

**Problem**: Biome linter/formatter not installed

**Solution**:

```bash
# Install globally
npm install -g @biomejs/biome

# Or use via npx
npx biome check acarshub-react/

# Or install as dev dependency
cd acarshub-react
npm install --save-dev @biomejs/biome
```

#### "TypeScript errors" during build

**Problem**: Type errors in code

**Solution**:

```bash
cd acarshub-react

# Check errors
npx tsc --noEmit

# Common fixes:
# 1. Missing types
npm install --save-dev @types/package-name

# 2. Outdated types
npm update

# 3. Check tsconfig.json is correct
cat tsconfig.json
```

#### "webpack build failed"

**Problem**: Webpack compilation error

**Solution**:

```bash
cd acarshub-react

# Clean build artifacts
rm -rf dist/ .cache/

# Rebuild
npm run build

# For more details
npm run build -- --verbose

# Check for circular dependencies
npm run analyze
```

#### "SCSS compilation error"

**Problem**: Syntax error in SCSS files

**Solution**:

```bash
# Check SCSS syntax
# Look for:
# - Missing semicolons
# - Unclosed braces
# - Invalid @use/@forward paths
# - Deprecated @import usage (use @use instead)

# Example fix:
# ❌ @import 'variables';
# ✅ @use 'variables' as vars;
```

### Backend Build Issues

#### "Alembic migration failed"

**Problem**: Database migration error

**Solution**:

```bash
# Check current version
cd rootfs/webapp
alembic -x dbPath=../../test.db current

# Try manual upgrade
alembic -x dbPath=../../test.db upgrade head

# If fails, check migration files
ls -la alembic/versions/

# Create fresh database
cd ../..
just db-init test.db
```

#### "ImportError: No module named"

**Problem**: Python dependency not installed

**Solution**:

```bash
# Reinstall Python dependencies
pdm install

# If specific package missing
pdm add package-name

# Update all dependencies
pdm update
```

---

## Runtime Issues

### Server Issues

#### "Port 8080 already in use"

**Problem**: Another process using development port

**Solution**:

```bash
# Find process using port
lsof -i :8080

# Kill process
kill -9 <PID>

# Or change port in .env
echo "ACARS_WEB_PORT=8081" >> .env
```

#### "Flask not reloading on changes"

**Problem**: Auto-reload not working

**Solution**:

```bash
# Check LOCAL_TEST is set
grep LOCAL_TEST .env
# Should show: LOCAL_TEST=true

# Restart Flask
# Ctrl+C to stop
pdm run dev

# Check file permissions
ls -la rootfs/webapp/*.py
```

#### "Assets not updating in browser"

**Problem**: Browser caching old files

**Solution**:

```bash
# 1. Hard refresh
# Chrome/Firefox: Ctrl+Shift+R (Cmd+Shift+R on Mac)

# 2. Check DevTools
# Network tab → Check "Disable cache"

# 3. Verify files copied
ls -la rootfs/webapp/static/js/

# 4. Verify LOCAL_TEST is true
grep LOCAL_TEST .env

# 5. Restart dev watch
# Ctrl+C in terminal running dev-watch.sh
./dev-watch.sh
```

#### "WebSocket connection failed"

**Problem**: Socket.IO not connecting

**Solution**:

```bash
# Check backend is running
curl http://localhost:8080/health

# Check browser console for errors
# Look for CORS or connection refused errors

# Verify Socket.IO configuration
# Check network tab in DevTools for socket.io requests

# Check firewall isn't blocking
sudo ufw status  # Linux
```

### Data Issues

#### "No messages appearing"

**Problem**: No data flowing from decoders

**Solution**:

For development, you likely don't have real ACARS decoders:

```bash
# Check .env configuration
cat .env | grep ENABLE_ACARS
# Should be: ENABLE_ACARS=False for UI development

# To test with real data, you need:
# 1. ACARS/VDLM decoder running
# 2. Proper ENABLE_* settings in .env
# 3. Correct source IPs and ports

# For UI testing, use mock data or database search
```

#### "Map not showing aircraft"

**Problem**: ADSB integration not configured

**Solution**:

```bash
# Check .env
grep ENABLE_ADSB .env
# Set to False for development without ADSB

# If testing with ADSB:
ENABLE_ADSB=True
ADSB_URL=http://your-adsb-server:8080/tar1090
ADSB_LAT=47.4502
ADSB_LON=-122.3088
```

---

## Testing Issues

### Unit Test Issues

#### "Tests failing with timeout"

**Problem**: Async operations not completing

**Solution**:

```typescript
// ❌ Bad
it("loads data", () => {
  loadData();
  expect(data).toBeDefined();
});

// ✅ Good - Use async/await
it("loads data", async () => {
  await loadData();
  expect(data).toBeDefined();
});

// Or increase timeout for slow tests
it("slow test", async () => {
  // ... test code
}, 10000); // 10 second timeout
```

#### "Mock not working"

**Problem**: Mock not being applied

**Solution**:

```typescript
// ❌ Bad - Mock after import
import { fetchData } from "./api";
vi.mock("./api");

// ✅ Good - Mock before import
vi.mock("./api");
import { fetchData } from "./api";

// Reset mocks between tests
import { afterEach, vi } from "vitest";
afterEach(() => {
  vi.clearAllMocks();
});
```

#### "Cannot find module"

**Problem**: Path alias not resolved in tests

**Solution**:

```typescript
// Check vitest.config.ts has correct resolve
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

// Or use relative imports in tests
import { foo } from "../../../utils/foo";
```

### E2E Test Issues

#### "Playwright browsers not installed"

**Problem**: Browser binaries missing

**Solution**:

```bash
cd acarshub-react

# Install browsers
npx playwright install

# Install system dependencies (Linux)
npx playwright install-deps

# For Nix users, browsers are managed by flake
# Just ensure PLAYWRIGHT_BROWSERS_PATH is set
echo $PLAYWRIGHT_BROWSERS_PATH
```

#### "E2E tests timing out"

**Problem**: Page not loading or element not found

**Solution**:

```typescript
// Increase timeout
test.setTimeout(60000); // 60 seconds

// Wait for specific state
await page.waitForLoadState('networkidle');
await page.waitForSelector('.message-list', { state: 'visible' });

// Debug with headed mode
npx playwright test --headed --debug
```

#### "E2E tests fail in CI but pass locally"

**Problem**: Environment differences

**Solution**:

```bash
# Run in Docker to match CI environment
docker run -it --rm \
  -v $(pwd):/app \
  -w /app \
  mcr.microsoft.com/playwright:v1.40.0-jammy \
  npx playwright test

# Check for race conditions
# Add explicit waits instead of timeouts
await page.waitForSelector('.element');
# Instead of
await page.waitForTimeout(1000);
```

---

## Database Issues

### "database is locked"

**Problem**: Another process has database open

**Solution**:

```bash
# Find process using database
lsof test.db

# Kill process
kill -9 <PID>

# Or use different database file
just db-init test2.db
# Update .env to point to test2.db
```

### "no such table: messages"

**Problem**: Database not initialized or schema outdated

**Solution**:

```bash
# Initialize fresh database
just db-init test.db

# Or apply migrations to existing
just db-migrate test.db

# Check current schema
sqlite3 test.db ".schema messages"
```

### "Migration failed: duplicate column"

**Problem**: Migration already partially applied

**Solution**:

```bash
cd rootfs/webapp

# Check current version
alembic -x dbPath=../../test.db current

# Downgrade one version
alembic -x dbPath=../../test.db downgrade -1

# Reapply
alembic -x dbPath=../../test.db upgrade head

# Or start fresh
cd ../..
just db-init test.db
```

---

## Performance Issues

### "Frontend build is slow"

**Problem**: Webpack taking too long to build

**Solution**:

```bash
# Use development build (faster)
npm run build-dev

# Check bundle size
npm run analyze

# Clear cache
rm -rf node_modules/.cache
npm run build

# Disable source maps for faster builds
# (in webpack config, set devtool: false)
```

### "Browser becomes slow/unresponsive"

**Problem**: Memory leak or inefficient rendering

**Solution**:

1. **Check React DevTools Profiler**
   - Look for unnecessary re-renders
   - Add `React.memo` to expensive components
   - Use `useMemo` for expensive calculations

2. **Check for memory leaks**

```typescript
// ✅ Good - Cleanup subscriptions
useEffect(() => {
  const subscription = socket.on("message", handler);
  return () => subscription.off("message", handler);
}, [socket, handler]);

// ❌ Bad - No cleanup
useEffect(() => {
  socket.on("message", handler);
}, [socket, handler]);
```

1. **Limit data size**

```typescript
// Limit messages in state
const MAX_MESSAGES = 1000;
set((state) => ({
  messages: [...newMessages, ...state.messages].slice(0, MAX_MESSAGES),
}));
```

### "Map performance degraded with many aircraft"

**Problem**: Too many markers on map

**Solution**:

```typescript
// Implement clustering
// Limit visible aircraft based on zoom level
// Use canvas rendering instead of DOM markers
// See agent-docs/FEATURES.md for map optimization
```

---

## Git Issues

### "pre-commit hooks failing"

**Problem**: Pre-commit checks not passing

**Solution**:

```bash
# Run manually to see details
pre-commit run --all-files

# Update hooks
pre-commit autoupdate

# Skip hooks temporarily (not recommended)
git commit --no-verify

# Fix specific issues
# TypeScript errors
just ci

# Formatting
biome check --write acarshub-react/
```

### "Merge conflicts in lock files"

**Problem**: Conflicts in `pdm.lock` or `package-lock.json`

**Solution**:

```bash
# For package-lock.json
git checkout --theirs package-lock.json
npm install

# For pdm.lock
git checkout --theirs pdm.lock
pdm install

# Then commit
git add package-lock.json pdm.lock
git commit -m "resolve: lock file conflicts"
```

### "Large files rejected"

**Problem**: Git refusing to commit large files

**Solution**:

```bash
# Check .gitignore
cat .gitignore

# Remove from staging
git rm --cached large-file.db

# Add to .gitignore
echo "*.db" >> .gitignore
echo "*.rrd" >> .gitignore

# Commit
git add .gitignore
git commit -m "chore: ignore database files"
```

---

## Platform-Specific Issues

### macOS

#### "xcrun: error: invalid active developer path"

**Problem**: Xcode Command Line Tools missing

**Solution**:

```bash
# Install
xcode-select --install

# Accept license
sudo xcodebuild -license accept
```

#### "Operation not permitted" errors

**Problem**: macOS security restrictions

**Solution**:

```bash
# Grant terminal full disk access
# System Preferences → Security & Privacy → Privacy → Full Disk Access
# Add Terminal.app or iTerm2

# Or use sudo for specific operations
sudo chown -R $(whoami) ~/.npm
```

### Linux

#### "inotify watch limit reached"

**Problem**: File watcher limit too low

**Solution**:

```bash
# Temporary fix
sudo sysctl fs.inotify.max_user_watches=524288

# Permanent fix
echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

#### "Permission denied" on socket files

**Problem**: Unix socket permissions

**Solution**:

```bash
# Check socket permissions
ls -la /tmp/socket-file

# Fix permissions
sudo chmod 666 /tmp/socket-file

# Or run as user
sudo chown $(whoami):$(whoami) /tmp/socket-file
```

### Windows (WSL2)

#### "Files in /mnt/c are slow"

**Problem**: Cross-filesystem access is slow

**Solution**:

```bash
# Clone repository inside WSL filesystem
cd ~
mkdir projects
cd projects
git clone https://github.com/sdr-enthusiasts/docker-acarshub.git

# NOT in /mnt/c/Users/...
```

#### "Line ending issues"

**Problem**: Git converting line endings

**Solution**:

```bash
# Configure Git in WSL
git config --global core.autocrlf input
git config --global core.eol lf

# Re-checkout files
rm -rf *
git reset --hard HEAD
```

#### "npm install fails in WSL"

**Problem**: Windows Defender scanning files

**Solution**:

```bash
# Exclude node_modules from Windows Defender
# Windows Security → Virus & threat protection → Manage settings
# Add exclusion: \\wsl$\Ubuntu\home\username\projects\docker-acarshub\acarshub-react\node_modules
```

---

## Still Stuck?

### Debugging Steps

1. **Read the error message carefully**
   - Often contains the solution
   - Note file names and line numbers

2. **Check logs**
   - Browser console (F12)
   - Terminal output
   - Settings → Advanced → Log Viewer (in app)

3. **Search for the error**
   - GitHub issues
   - Stack Overflow
   - Project documentation

4. **Create minimal reproduction**
   - Isolate the problem
   - Test with fresh environment

5. **Ask for help**
   - Discord (link in README.md)
   - GitHub Discussions
   - Create GitHub issue with details

### Information to Provide

When asking for help, include:

- Operating system and version
- Node.js version (`node --version`)
- Python version (`python3 --version`)
- Error message (full stack trace)
- Steps to reproduce
- What you've already tried
- Relevant code snippets

### Useful Debugging Commands

```bash
# Check versions
node --version
npm --version
python3 --version
pdm --version

# Check environment
env | grep -E "(LOCAL_TEST|ACARSHUB|NODE|PYTHON)"

# Check running processes
ps aux | grep -E "(node|python|flask)"

# Check network
netstat -an | grep -E "(8080|8888)"

# Check disk space
df -h

# Check logs
tail -f /path/to/log/file
```

---

## Getting Help

- **Documentation**: Check dev-docs/ and agent-docs/
- **GitHub Issues**: Search existing or create new
- **Discord**: Real-time help from community
- **Stack Overflow**: Tag with `acars` or `flask` / `react`

---

Remember: Most issues have been seen before. Don't hesitate to ask for help!
