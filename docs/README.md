# Documentation

This folder contains developer documentation for the UAV-PMS Frontend project.

## Contents

### 1. [DEVELOPMENT_SETUP.md](./DEVELOPMENT_SETUP.md)
Complete guide for setting up the development environment, including:
- Installation steps
- Environment variable setup
- Available npm scripts
- Troubleshooting common issues

**Start here if you're new to the project.**

### 2. [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)
Detailed breakdown of the project folder structure:
- What files should and shouldn't be committed
- Source code organization
- Component structure
- Best practices for adding new features

### 3. [CODING_STANDARDS.md](./CODING_STANDARDS.md)
Code style and quality guidelines:
- Git and file organization standards
- TypeScript and React conventions
- Code formatting rules
- Commit message conventions
- Development workflow checklist

## Quick Start

1. Read [DEVELOPMENT_SETUP.md](./DEVELOPMENT_SETUP.md)
2. Run `npm install`
3. Create `.env.development` from `.env.example`
4. Run `npm run dev`

## Important Files in Root

- `.env.example` - Template for environment variables (commit this)
- `.gitignore` - Files excluded from git (commit this)
- `.env.development` - Your local development config (DO NOT commit)
- `.env.production` - Your production config (DO NOT commit)

## Useful Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build

# Code Quality
npm run lint             # Check code style
npm run lint -- --fix    # Auto-fix style issues

# Testing
npm run test             # Run unit tests
```

## Git Workflow

**Before committing:**
```bash
npm run lint -- --fix    # Fix style issues
npm run build            # Verify build works
npm run test             # Run tests
git status               # Check files
```

**Commit message format:**
```
type(scope): description

feat(auth): Add login form validation
fix(users): Resolve profile loading bug
```

## Getting Help

1. Check the documentation above
2. Review existing issues in the repository
3. Ask team members in the chat/discussion channel

## File Organization

### What to commit ✅
- Source code in `src/`
- Configuration files
- `.env.example`
- `.gitignore`

### What NOT to commit ❌
- `.env.development` / `.env.production`
- `node_modules/`
- `dist/` (build output)
- IDE settings (`.vscode/`, `.idea/`)
- Log files

See [CODING_STANDARDS.md](./CODING_STANDARDS.md) for complete guidelines.
