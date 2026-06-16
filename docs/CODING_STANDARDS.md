# Coding Standards & Best Practices

## File Organization Standards

### ✅ What SHOULD be in Git

**Source Code**
- All files in `src/` directory
- Configuration files (`tsconfig.json`, `vite.config.ts`, `eslint.config.js`)
- Package definitions (`package.json`, `package-lock.json`)
- README and documentation

**Template Files**
- `.env.example` - Environment variable template

**Git Configuration**
- `.gitignore` - Files to exclude from version control

### ❌ What SHOULD NOT be in Git

**Environment Files**
```
.env                    # Local environment
.env.development        # Development specific
.env.production        # Production specific
.env.local             # Local overrides
```

**Dependencies & Build Output**
```
node_modules/          # Installed packages
dist/                  # Built output
dist-ssr/              # SSR build output
*.local                # Local builds
```

**IDE & System Files**
```
.vscode/               # VS Code settings (except extensions.json)
.idea/                 # IntelliJ settings
*.suo                  # Visual Studio
.DS_Store              # macOS system file
Thumbs.db              # Windows system file
```

**Logs & Temporary Files**
```
*.log                  # Log files
npm-debug.log*         # npm logs
*.sw?                  # Vim swap files
```

## .gitignore Template

Current `.gitignore` structure:
```
# Dependencies
node_modules/

# Build output
dist/
dist-ssr/

# Environment files (DO NOT COMMIT)
.env
.env.local
.env.development
.env.production

# Documentation & scripts (local only)
API_SPECIFICATION.md
IMPLEMENTATION_REPORT.md
TEST_CASES.md
etc...

# IDE
.vscode/*
!.vscode/extensions.json
.idea/

# OS
.DS_Store
Thumbs.db
```

## Code Style Guidelines

### TypeScript
- Use strict mode (`"strict": true` in tsconfig.json)
- Define interfaces for data structures
- Use descriptive variable names
- Avoid `any` type

```typescript
// ❌ Bad
const data: any = fetchUser();

// ✅ Good
interface User {
  id: string;
  name: string;
  email: string;
}
const userData: User = fetchUser();
```

### React Components
- Use functional components
- Use TypeScript for prop types
- Name files with .tsx extension
- Use proper naming conventions

```typescript
// ✅ Good component structure
interface ButtonProps {
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  onClick,
  variant = 'primary',
  children,
}) => {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick}>
      {children}
    </button>
  );
};
```

### Imports
```typescript
// ✅ Organize imports in groups
// 1. External packages
import React from 'react';
import { useNavigate } from 'react-router-dom';

// 2. Internal modules
import { useAuth } from '@/hooks/useAuth';
import { userService } from '@/services/api/userService';

// 3. Types
import type { User, Role } from '@/types';

// 4. Constants
import { ROUTES } from '@/constants/routes';
```

### File Naming Conventions
```
Components:       PascalCase          UserProfile.tsx
Hooks:           camelCase           useAuth.ts
Utils:           camelCase           formatDate.ts
Constants:       UPPER_SNAKE_CASE    ROUTES.ts
Types:           PascalCase          index.ts
Services:        camelCase           userService.ts
```

## Environment Variables

### Setup Process
1. Copy `.env.example` to `.env.development` (for dev)
2. Update values for your local environment
3. Never commit your `.env` files
4. Each developer maintains their own `.env` files

### Adding New Environment Variables

1. Add to `.env.example` with placeholder value:
```env
VITE_NEW_API_KEY=your-key-here
```

2. Use in code:
```typescript
const apiKey = import.meta.env.VITE_NEW_API_KEY;
```

3. Document in `.env.example` comments:
```env
# Third-party API integration
VITE_NEW_API_KEY=your-key-here
```

## Commit Message Convention

Follow conventional commits:
```
type(scope): description

[optional body]
[optional footer]
```

### Types
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style (formatting, semicolons, etc)
- `refactor:` Code restructuring
- `test:` Adding/updating tests
- `chore:` Build process, deps, tooling
- `perf:` Performance improvements

### Examples
```
feat(auth): Add two-factor authentication
fix(users): Resolve user profile loading issue
docs: Update setup instructions
chore: Update dependencies
```

## Recommended Tools

### ESLint
- Configured with TypeScript support
- Run: `npm run lint`
- Automatically fixes issues: `npm run lint -- --fix`

### TypeScript
- Strict mode enabled
- Prevents runtime errors with type checking

### Vitest
- Unit testing framework
- Run: `npm run test`

## Workflow Checklist

Before committing:
- [ ] Code passes linting (`npm run lint`)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] Tests pass (`npm run test`)
- [ ] No `.env` files included
- [ ] No `node_modules/` or build output
- [ ] Commit message follows convention

## Development Environment Setup

Each developer should:

1. Clone the repository
2. Run `npm install`
3. Copy `.env.example` to `.env.development`
4. Update `.env.development` with local values
5. Start dev server: `npm run dev`

**Never share your `.env` files or commit them to git!**
