# Contributing to ACARS Hub

Thank you for contributing to ACARS Hub! This guide will help you understand our development workflow, standards, and review process.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Code Review Guidelines](#code-review-guidelines)
- [Quality Requirements](#quality-requirements)
- [Documentation Standards](#documentation-standards)

---

## Code of Conduct

- Be respectful and professional
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and grow
- Follow the project's technical standards

---

## Getting Started

### First Time Setup

1. **Fork the repository** on GitHub
2. **Clone your fork**:

   ```bash
   git clone https://github.com/YOUR-USERNAME/docker-acarshub.git
   cd docker-acarshub
   ```

3. **Set up development environment**:

   ```bash
   # Using Nix (recommended)
   nix develop
   # OR
   direnv allow

   # Install dependencies
   pdm install
   cd acarshub-react && npm install && cd ..
   ```

4. **Configure environment**:

   ```bash
   cp .env.example .env
   nano .env  # Set LOCAL_TEST=true
   ```

5. **Add upstream remote**:

   ```bash
   git remote add upstream https://github.com/sdr-enthusiasts/docker-acarshub.git
   ```

### Before You Start Coding

1. **Read the documentation**:
   - [AGENTS.md](../AGENTS.md) - Coding standards and quality rules
   - [DESIGN_LANGUAGE.md](../agent-docs/DESIGN_LANGUAGE.md) - UI/UX patterns
   - [ARCHITECTURE.md](../agent-docs/ARCHITECTURE.md) - System design
   - [TESTING_GUIDE.md](TESTING_GUIDE.md) - Testing requirements

2. **Understand the issue**:
   - Read the issue description carefully
   - Ask clarifying questions if needed
   - Check for related issues or PRs

3. **Plan your approach**:
   - Break down the work into small, testable chunks
   - Consider edge cases and error handling
   - Think about backward compatibility

---

## Development Workflow

### 1. Create a Feature Branch

Always work on a feature branch, never on `main`:

```bash
# Update your local main
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/short-description
# OR for bug fixes
git checkout -b fix/issue-number-description
```

**Branch Naming Conventions**:

- `feature/add-alert-filtering` - New features
- `fix/123-map-crash` - Bug fixes (with issue number)
- `refactor/simplify-socket-handler` - Code refactoring
- `docs/update-setup-guide` - Documentation changes
- `test/improve-coverage` - Test improvements
- `chore/update-dependencies` - Maintenance tasks

### 2. Make Your Changes

**Work incrementally**:

```bash
# Make small, focused changes
# Test frequently
npm test  # (from acarshub-react/)
just test

# Run quality checks often
just check
```

**Follow coding standards**:

- ✅ TypeScript strict mode (no `any` types)
- ✅ No inline styles (SCSS only)
- ✅ Use logger, not `console.*`
- ✅ Mobile-first responsive design
- ✅ WCAG 2.1 AA accessibility
- ✅ Catppuccin theming

See [CODING_STANDARDS.md](CODING_STANDARDS.md) for details.

### 3. Write Tests

**All code changes require tests**:

- **New features**: Unit + integration tests
- **Bug fixes**: Regression test that would have caught the bug
- **UI changes**: Accessibility tests

**Coverage goals**:

- Utilities: 90%+
- Stores: 80%+
- Components: 70%+

```bash
# Run tests with coverage
just test-coverage

# Check coverage report
open acarshub-react/coverage/index.html
```

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for test patterns.

### 4. Commit Your Changes

**Use the commit helper** (runs all quality checks):

```bash
just add      # git add -A
just commit   # Runs CI checks + commits with GPG signature
```

**Or commit manually**:

```bash
# Run quality checks first
just ci

# Stage changes
git add -A

# Commit with descriptive message
git commit -m "feat: add alert filtering by station"
```

### 5. Keep Your Branch Updated

```bash
# Regularly sync with upstream
git fetch upstream
git rebase upstream/main

# Resolve conflicts if any
# Then force push to your fork
git push --force-with-lease origin feature/your-branch
```

---

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/) with some modifications:

### Format

```text
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code refactoring (no behavior change)
- `perf` - Performance improvement
- `test` - Adding or updating tests
- `docs` - Documentation changes
- `style` - Code style changes (formatting, no logic change)
- `chore` - Build process, dependencies, tooling
- `ci` - CI/CD configuration changes

### Scopes (Optional)

- `frontend` - React/TypeScript changes
- `backend` - Python/Flask changes
- `map` - Map-related features
- `search` - Search functionality
- `alerts` - Alert system
- `db` - Database/migration changes
- `ui` - UI components

### Examples

```text
feat(alerts): add filtering by station ID

Adds dropdown to filter alerts by specific stations.
Includes unit tests and accessibility improvements.

Closes #123
```

```text
fix(map): prevent crash when aircraft has no position

Added null check before accessing aircraft coordinates.
Includes regression test.

Fixes #456
```

```text
refactor(frontend): simplify socket event handling

Extracted socket event handlers into separate service.
No behavior changes, improved code organization.
```

### Commit Message Rules

1. **Subject line**:
   - Use imperative mood ("add" not "added" or "adds")
   - No period at the end
   - Max 72 characters
   - Lowercase after colon

2. **Body** (optional but recommended):
   - Explain WHAT and WHY, not HOW
   - Wrap at 72 characters
   - Separate from subject with blank line

3. **Footer**:
   - Reference issues: `Closes #123`, `Fixes #456`, `Relates to #789`
   - Breaking changes: `BREAKING CHANGE: description`

---

## Pull Request Process

### 1. Push to Your Fork

```bash
git push origin feature/your-branch
```

### 2. Create Pull Request

1. Go to your fork on GitHub
2. Click "Compare & pull request"
3. **Select base repository**: `sdr-enthusiasts/docker-acarshub`
4. **Select base branch**: `main`

### 3. Fill Out PR Template

Provide:

- **Description**: What does this PR do?
- **Motivation**: Why is this change needed?
- **Testing**: How was it tested?
- **Screenshots**: For UI changes (mobile + desktop)
- **Checklist**: Check all applicable items

**Example PR Description**:

```markdown
## Description

Adds ability to filter alerts by station ID in the alerts page.

## Motivation

Users requested ability to focus on specific stations when monitoring alerts (issue #123).

## Changes

- Added station filter dropdown to alerts page
- Implemented filtering logic in `useAlertStore`
- Added unit tests for filter functionality
- Ensured mobile responsiveness
- Accessibility tested with keyboard navigation

## Testing

- [x] Unit tests pass (`just test`)
- [x] Integration tests pass
- [x] Manual testing on desktop (Chrome, Firefox, Safari)
- [x] Manual testing on mobile (iOS Safari, Android Chrome)
- [x] Accessibility tests pass (`just test-a11y`)
- [x] All CI checks pass (`just ci`)

## Screenshots

### Desktop
![Desktop view](screenshots/desktop.png)

### Mobile
![Mobile view](screenshots/mobile.png)

## Closes

Closes #123
```

### 4. Automated Checks

Pull requests must pass:

- ✅ TypeScript compilation (`tsc --noEmit`)
- ✅ Biome linting and formatting
- ✅ Markdown linting
- ✅ All unit/integration tests
- ✅ Pre-commit hooks

**If checks fail**:

1. Review the error messages in GitHub Actions
2. Fix locally and push again
3. Checks re-run automatically

### 5. Code Review

**Expect feedback on**:

- Code quality and standards compliance
- Test coverage and quality
- Documentation completeness
- Performance implications
- Security considerations
- Accessibility
- Mobile responsiveness

**Respond to reviews**:

- Address all comments (even if just to discuss)
- Make requested changes
- Push updates to same branch
- Mark conversations as resolved when addressed

### 6. Merge Requirements

Before merge, ensure:

- ✅ All automated checks pass
- ✅ At least one approval from maintainer
- ✅ All review comments addressed
- ✅ Branch up to date with `main`
- ✅ No merge conflicts
- ✅ Documentation updated (if needed)

**Maintainers will**:

- Squash and merge (usually)
- Edit commit message if needed
- Delete branch after merge

---

## Code Review Guidelines

### As a Reviewer

**Focus on**:

1. **Correctness**: Does it work as intended?
2. **Standards**: Does it follow AGENTS.md guidelines?
3. **Tests**: Are there adequate tests?
4. **Readability**: Is the code clear and maintainable?
5. **Performance**: Are there obvious performance issues?
6. **Security**: Are there security concerns?

**Provide constructive feedback**:

- ✅ "Consider using `useMemo` here to avoid re-renders"
- ✅ "This needs a test case for the error path"
- ✅ "Can you add a comment explaining why we do X?"
- ❌ "This is wrong"
- ❌ "Why didn't you do it my way?"

**Use review types**:

- **Comment**: Non-blocking suggestion
- **Request changes**: Must be addressed before merge
- **Approve**: Ready to merge

### As an Author

**Respond professionally**:

- Thank reviewers for their time
- Explain your reasoning if you disagree
- Ask for clarification if feedback is unclear
- Don't take criticism personally

**Make it easy to review**:

- Keep PRs small and focused (< 500 lines ideal)
- Write clear PR descriptions
- Respond promptly to feedback
- Update PR description if scope changes

---

## Quality Requirements

### Before Committing

Run the full quality check:

```bash
just ci
```

This verifies:

1. ✅ TypeScript compiles with no errors
2. ✅ Biome linting passes
3. ✅ All tests pass
4. ✅ Pre-commit hooks pass

### Code Quality Checklist

- [ ] No `any` types (use `unknown` with type guards)
- [ ] No inline styles (SCSS only)
- [ ] No `console.*` statements (use logger)
- [ ] Mobile-first responsive design
- [ ] Catppuccin theming used
- [ ] Accessibility requirements met (WCAG 2.1 AA)
- [ ] Tests written and passing
- [ ] Documentation updated

### Performance Checklist

- [ ] No unnecessary re-renders (use `React.memo`, `useMemo`, `useCallback`)
- [ ] Images optimized
- [ ] Bundle size acceptable (< 500KB per chunk gzipped)
- [ ] No memory leaks
- [ ] Efficient algorithms (no O(n²) unless necessary)

### Security Checklist

- [ ] No hardcoded secrets or API keys
- [ ] Input validation on user data
- [ ] XSS protection (sanitize HTML)
- [ ] CSRF protection (use Flask-WTF for forms)
- [ ] SQL injection protection (use parameterized queries)

---

## Documentation Standards

### When to Document

**Always document**:

- New features (update FEATURES.md)
- API changes (update ARCHITECTURE.md)
- Breaking changes (update CHANGELOG)
- Complex algorithms (inline comments)
- Configuration options (update README.md)

**Never document**:

- Implementation progress (no summary docs)
- Obvious code (code should be self-explanatory)
- Duplicate information (reference existing docs)

### Documentation Files

- **User documentation**: Update README.md
- **Developer documentation**: Update dev-docs/
- **Architecture decisions**: Update agent-docs/ARCHITECTURE.md
- **API documentation**: Inline JSDoc/docstrings
- **Changelog**: Update for breaking changes

### Markdown Standards

- ✅ Always include language specifier for code blocks
- ✅ Use headings, not emphasis, for sections
- ✅ No duplicate headings with same content
- ✅ Blank lines around headings and code blocks
- ✅ GitHub-flavored markdown

**Run markdown linter**:

```bash
# Included in pre-commit hooks
pre-commit run --all-files
```

---

## Getting Help

### Resources

- **[DEV-QUICK-START.md](../DEV-QUICK-START.md)** - Quick start guide
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common issues
- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - How to write tests
- **[AGENTS.md](../AGENTS.md)** - Coding standards

### Support Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and ideas
- **Discord**: Real-time chat (link in README.md)
- **Pull Request Comments**: Specific code questions

### Tips for Getting Unstuck

1. Read the error message carefully
2. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
3. Search existing issues and PRs
4. Ask in Discord with context
5. Create a minimal reproduction example

---

## First-Time Contributors

Welcome! Here are some good first issues:

1. **Documentation improvements**: Fix typos, clarify instructions
2. **Test additions**: Improve test coverage
3. **Small bug fixes**: Issues labeled "good first issue"
4. **UI polish**: Accessibility improvements, mobile responsiveness

**Tips**:

- Start small to learn the workflow
- Ask questions early and often
- Don't be afraid to make mistakes
- We're here to help you succeed

---

## Thank You

Every contribution, no matter how small, makes ACARS Hub better. Thank you for being part of the community! 🚀
