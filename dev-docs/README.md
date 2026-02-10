# Developer Documentation

Welcome to ACARS Hub development! This directory contains comprehensive guides for contributing to the project.

## 📚 Documentation Overview

### Quick Start

- **[DEV-QUICK-START.md](../DEV-QUICK-START.md)** - Get up and running in minutes
  - One-time setup
  - Development workflow
  - Common commands
  - Troubleshooting basics

### Essential Guides

- **[SETUP.md](SETUP.md)** - Detailed environment setup
  - Nix Flakes installation and configuration
  - Manual setup (without Nix)
  - Environment variables
  - Database initialization
  - Platform-specific instructions

- **[CONTRIBUTING.md](CONTRIBUTING.md)** - How to contribute
  - Git workflow and branching
  - Commit conventions
  - Pull request process
  - Code review guidelines
  - Quality requirements

- **[CODING_STANDARDS.md](CODING_STANDARDS.md)** - Code quality rules
  - TypeScript strict mode guidelines
  - SCSS/styling standards
  - React component patterns
  - Logging and error handling
  - Accessibility requirements

- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Testing patterns and strategies
  - Unit, integration, and E2E testing
  - Test patterns and examples
  - Mocking strategies
  - Coverage goals
  - Running tests

- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common issues and solutions
  - Development environment problems
  - Build and runtime issues
  - Testing problems
  - Database issues
  - Platform-specific fixes

---

## 🎯 Where to Start

### New Contributors

1. Read **[DEV-QUICK-START.md](../DEV-QUICK-START.md)**
2. Follow **[SETUP.md](SETUP.md)** for environment setup
3. Review **[CODING_STANDARDS.md](CODING_STANDARDS.md)**
4. Read **[CONTRIBUTING.md](CONTRIBUTING.md)**
5. Pick a "good first issue" from GitHub

### AI Agents/Assistants

1. **Start with** [AGENTS.md](../AGENTS.md) - Critical coding rules
2. Reference **[agent-docs/ARCHITECTURE.md](../agent-docs/ARCHITECTURE.md)** - System design
3. Follow **[agent-docs/DESIGN_LANGUAGE.md](../agent-docs/DESIGN_LANGUAGE.md)** - UI patterns
4. Use **[agent-docs/TESTING.md](../agent-docs/TESTING.md)** - Test infrastructure

### Bug Fixes

1. **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Check common issues
2. **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Write regression tests
3. **[CONTRIBUTING.md](CONTRIBUTING.md)** - Submit fix properly

### New Features

1. **[agent-docs/ARCHITECTURE.md](../agent-docs/ARCHITECTURE.md)** - Understand system
2. **[CODING_STANDARDS.md](CODING_STANDARDS.md)** - Follow patterns
3. **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Write comprehensive tests
4. **[agent-docs/DESIGN_LANGUAGE.md](../agent-docs/DESIGN_LANGUAGE.md)** - UI consistency

---

## 📖 Complete Documentation Structure

```text
docker-acarshub/
├── DEV-QUICK-START.md          # Quick start guide
├── DEVELOPMENT.md              # Complete development guide
├── AGENTS.md                   # AI agent coding standards
│
├── dev-docs/                   # Developer documentation (you are here)
│   ├── README.md               # This file
│   ├── SETUP.md                # Detailed setup guide
│   ├── CONTRIBUTING.md         # Contribution guidelines
│   ├── CODING_STANDARDS.md     # Code quality rules
│   ├── TESTING_GUIDE.md        # Testing patterns
│   └── TROUBLESHOOTING.md      # Common issues
│
└── agent-docs/                 # Architecture & design
    ├── ARCHITECTURE.md         # System design and data flow
    ├── DESIGN_LANGUAGE.md      # UI/UX patterns
    ├── CATPPUCCIN.md          # Color palette reference
    ├── FEATURES.md            # Feature documentation
    └── TESTING.md             # Testing infrastructure
```

---

## 🔧 Development Workflow

### Daily Development

```bash
# Terminal 1: Frontend watch
./dev-watch.sh

# Terminal 2: Backend server
pdm run dev

# Open http://localhost:8080
```

### Before Committing

```bash
# Run all quality checks
just ci

# Or use the commit helper
just add      # Stage all changes
just commit   # Run checks + commit with GPG
```

### Common Commands

```bash
# Testing
just test              # Run all tests
just test-watch        # Watch mode
just test-coverage     # Coverage report
just test-e2e          # E2E tests
just test-a11y         # Accessibility tests

# Quality checks
just check             # Quick check
just ci                # Full CI check

# Database
just db-init test.db   # Fresh database
just db-migrate test.db # Apply migrations
```

---

## 📋 Quality Requirements

### Code Standards

- ✅ **TypeScript strict mode** - No `any` types
- ✅ **No inline styles** - SCSS modules only
- ✅ **Use logger** - No `console.*` statements
- ✅ **Mobile-first** - Responsive design required
- ✅ **Accessibility** - WCAG 2.1 AA compliance
- ✅ **Catppuccin theming** - Mocha (dark) and Latte (light)

### Testing Requirements

- **Utilities**: 90%+ coverage
- **Stores**: 80%+ coverage
- **Components**: 70%+ coverage
- All new features require tests
- Bug fixes require regression tests

### Review Checklist

- [ ] `just ci` passes
- [ ] No `any` types introduced
- [ ] No inline styles
- [ ] Mobile responsiveness verified
- [ ] Accessibility tested
- [ ] Tests written and passing
- [ ] Documentation updated

---

## 🌈 Technology Stack

### Frontend

- **React 19** - UI framework
- **TypeScript** - Type-safe JavaScript
- **SCSS** - Styling (Catppuccin theme)
- **Zustand** - State management
- **Socket.IO Client** - Real-time communication
- **Leaflet** - Map visualization
- **Vitest** - Unit/integration testing
- **Playwright** - E2E testing

### Backend

- **Python 3.13** - Language
- **Flask** - Web framework
- **Flask-SocketIO** - WebSocket support
- **SQLite** - Database
- **Alembic** - Database migrations
- **PDM** - Dependency management

### Development Tools

- **Nix Flakes** - Reproducible development environment
- **Just** - Command runner
- **Biome** - Linting and formatting
- **Pre-commit** - Git hooks
- **direnv** - Automatic environment activation

---

## 🎓 Learning Resources

### ACARS Hub Specific

- **README.md** - User documentation
- **DEVELOPMENT.md** - Complete dev guide
- **agent-docs/** - Architecture and design
- **dev-docs/** - Developer guides (this directory)

### General Resources

- **TypeScript**: <https://www.typescriptlang.org/docs/>
- **React**: <https://react.dev/>
- **Flask**: <https://flask.palletsprojects.com/>
- **Socket.IO**: <https://socket.io/docs/>
- **Vitest**: <https://vitest.dev/>
- **Playwright**: <https://playwright.dev/>
- **Nix**: <https://nixos.org/manual/nix/stable/>

---

## 💡 Best Practices

1. **Start small** - Make incremental changes
2. **Test frequently** - Run `just test-watch` while developing
3. **Check quality** - Run `just ci` before committing
4. **Ask questions** - Use Discord or GitHub Discussions
5. **Read the docs** - Most answers are already documented
6. **Follow patterns** - Look at existing code for examples
7. **Mobile-first** - Always test on small screens
8. **Accessibility** - Use semantic HTML and ARIA attributes

---

## 🆘 Getting Help

### Documentation

- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) first
- Search this directory for your topic
- Look at [agent-docs/](../agent-docs/) for architecture

### Community

- **Discord**: Real-time chat (link in main README.md)
- **GitHub Discussions**: Questions and ideas
- **GitHub Issues**: Bug reports and feature requests

### When Creating an Issue

Include:

- Operating system and version
- Node.js version (`node --version`)
- Python version (`python3 --version`)
- Error message (full text)
- Steps to reproduce
- What you've already tried

---

## 🚀 Next Steps

1. **Setup**: Follow [SETUP.md](SETUP.md)
2. **Understand**: Read [AGENTS.md](../AGENTS.md)
3. **Code**: Follow [CODING_STANDARDS.md](CODING_STANDARDS.md)
4. **Test**: Use [TESTING_GUIDE.md](TESTING_GUIDE.md)
5. **Contribute**: Follow [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 📝 Documentation Standards

When updating documentation:

- Use GitHub-flavored Markdown
- Include language specifiers for code blocks
- Keep lines under 100 characters
- Use headings for structure (not bold text)
- No duplicate headings with same content
- Run markdown linting: `pre-commit run --all-files`

**Document WHY, not WHAT** - Code shows what; docs explain why.

---

## 🤝 Contributing to Docs

Found something unclear or outdated?

1. Open an issue describing the problem
2. Or submit a PR with improvements
3. Follow the documentation standards above

Good documentation is just as important as good code!

---

Welcome to the team! We're excited to have you contribute to ACARS Hub. 🎉
