# 🗄️ Database Schema Recommendations

**For Backend Team** | **PostgreSQL/MySQL/Other RDBMs**

---

## 📊 Required Tables

### 1. `users` Table (Core)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),       -- or AUTO_INCREMENT INT
  username VARCHAR(50) UNIQUE NOT NULL,                -- Lowercase, 3-50 chars
  password_hash VARCHAR(255) NOT NULL,                 -- bcrypt hash (not plaintext!)
  fullName VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'Viewer',         -- Admin, Manager, Technician, Viewer
  status VARCHAR(50) NOT NULL DEFAULT 'Active',       -- Active, Inactive, Locked
  mustChangePassword BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes for performance
  INDEX idx_username (username),
  INDEX idx_email (email),
  INDEX idx_status (status),
  INDEX idx_role (role)
);
```

### 2. `refresh_tokens` Table (Optional but Recommended)

```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,            -- Hash of refresh token (don't store plaintext)
  expiresAt TIMESTAMP NOT NULL,                        -- Token expiration time
  revokedAt TIMESTAMP NULL,                            -- Soft revoke for logout
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX idx_user_id (user_id),
  INDEX idx_expiresAt (expiresAt)
);
```

**When to use**:
- Logout invalidation (set `revokedAt`)
- Token refresh validation
- Security audit (who logged in when)
- Session management

### 3. `audit_logs` Table (Optional but Recommended)

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,                         -- login, logout, create_user, update_user, etc.
  resource_type VARCHAR(50),                           -- user, system, etc.
  resource_id VARCHAR(100),                            -- ID of resource being modified
  details JSON,                                        -- Additional info {old_values, new_values}
  status VARCHAR(20),                                  -- success, failed
  ip_address VARCHAR(45),
  user_agent TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_createdAt (createdAt)
);
```

**Events to log**:
- Login attempts (success + failure)
- Logout
- Password changes
- User creation/update/deletion
- Unauthorized access attempts

---

## 🔐 Enum Values (Constraints)

### Roles
```sql
-- PostgreSQL
CREATE TYPE user_role AS ENUM ('Admin', 'Manager', 'Technician', 'Viewer');

-- MySQL (use VARCHAR + check)
ALTER TABLE users ADD CONSTRAINT chk_role 
  CHECK (role IN ('Admin', 'Manager', 'Technician', 'Viewer'));
```

### Status
```sql
-- PostgreSQL
CREATE TYPE user_status AS ENUM ('Active', 'Inactive', 'Locked');

-- MySQL
ALTER TABLE users ADD CONSTRAINT chk_status 
  CHECK (status IN ('Active', 'Inactive', 'Locked'));
```

---

## 📈 Indexes & Performance

```sql
-- Username lookup (frequent operation)
CREATE INDEX idx_users_username ON users(username);

-- Email lookup (registration, password reset)
CREATE INDEX idx_users_email ON users(email);

-- Status filtering
CREATE INDEX idx_users_status ON users(status);

-- Role filtering (for permission checks)
CREATE INDEX idx_users_role ON users(role);

-- Timestamp range queries
CREATE INDEX idx_users_createdAt ON users(createdAt);

-- Token refresh lookups
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expiresAt ON refresh_tokens(expiresAt);
```

---

## 🛡️ Security Best Practices

### 1. Password Hashing
```javascript
// Node.js with bcrypt
const bcrypt = require('bcrypt');

// Hashing (register or password reset)
const saltRounds = 10;
const passwordHash = await bcrypt.hash(password, saltRounds);
await db.query('INSERT INTO users (password_hash) VALUES (?)', [passwordHash]);

// Verification (login)
const user = await db.query('SELECT * FROM users WHERE username = ?', [username]);
const passwordMatch = await bcrypt.compare(inputPassword, user.password_hash);

if (!passwordMatch) {
  return { statusCode: 401, message: 'Invalid credentials', success: false };
}
```

### 2. JWT Token Generation
```javascript
// Node.js with jsonwebtoken
const jwt = require('jsonwebtoken');

// Generate accessToken (short expiry)
const accessToken = jwt.sign(
  { userId: user.id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '15m' }  // 15 minutes
);

// Generate refreshToken (long expiry)
const refreshToken = jwt.sign(
  { userId: user.id },
  process.env.JWT_REFRESH_SECRET,
  { expiresIn: '7d' }  // 7 days
);

return {
  statusCode: 200,
  message: 'Login successful',
  success: true,
  data: { user, tokens: { accessToken, refreshToken } }
};
```

### 3. Validate Enum Values
```javascript
const VALID_ROLES = ['Admin', 'Manager', 'Technician', 'Viewer'];
const VALID_STATUSES = ['Active', 'Inactive', 'Locked'];

if (!VALID_ROLES.includes(req.body.role)) {
  return res.status(400).json({ 
    statusCode: 400, 
    message: 'Invalid role', 
    success: false 
  });
}
```

### 4. NEVER Include Password in Response
```javascript
// ❌ WRONG
const user = await db.query('SELECT * FROM users WHERE id = ?', [id]);
return { user };  // Contains password_hash!

// ✅ CORRECT
const user = await db.query('SELECT id, username, fullName, email, role, status FROM users WHERE id = ?', [id]);
return { data: user };
```

---

## 🔄 Backend Implementation Checklist

### Database Setup
- [ ] Create `users` table with correct schema
- [ ] Create `refresh_tokens` table (optional but recommended)
- [ ] Create `audit_logs` table (optional but recommended)
- [ ] Setup indexes for performance
- [ ] Setup enum constraints (roles, statuses)
- [ ] Setup timezone (UTC for all timestamps)

### Authentication Endpoints
- [ ] POST /auth/login → Validate credentials, return tokens
- [ ] POST /auth/logout → Invalidate refresh token, return 200
- [ ] POST /auth/refresh → Verify token, return new tokens
- [ ] POST /auth/change-password → Validate old password, hash new one

### User Management Endpoints
- [ ] GET /users → Return all users (admin only, no passwords)
- [ ] POST /users → Generate username/email/password, return response
- [ ] PATCH /users/{id} → Update role/status only
- [ ] DELETE /users/{id} → Soft or hard delete
- [ ] POST /users/{id}/reset-password → Generate temp password

### Middleware & Security
- [ ] JWT verification middleware
- [ ] Role-based access control middleware
- [ ] Request validation (Joi, class-validator, etc.)
- [ ] Error handling middleware
- [ ] CORS configuration
- [ ] Input sanitization
- [ ] Rate limiting (optional)

### Utility Functions
- [ ] Generate random username from fullName
- [ ] Generate random strong password
- [ ] Hash password (bcrypt)
- [ ] Generate JWT tokens
- [ ] Verify JWT tokens
- [ ] Log audit events

---

## 📝 Sample Implementation (Node.js Express)

```javascript
// Pseudo-code structure
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({
      statusCode: 401,
      message: 'Invalid token',
      success: false
    });
  }
};

// Routes
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  // 1. Find user
  const user = await db.query('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) {
    return res.status(401).json({
      statusCode: 401,
      message: 'Invalid credentials',
      success: false
    });
  }
  
  // 2. Check status
  if (user.status === 'Locked') {
    return res.status(423).json({
      statusCode: 423,
      message: 'Account locked',
      success: false
    });
  }
  
  // 3. Verify password
  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    return res.status(401).json({
      statusCode: 401,
      message: 'Invalid credentials',
      success: false
    });
  }
  
  // 4. Generate tokens
  const accessToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  
  // 5. Store refresh token (optional)
  await db.query('INSERT INTO refresh_tokens (user_id, token_hash) VALUES (?, ?)', [
    user.id,
    await bcrypt.hash(refreshToken, 10)
  ]);
  
  // 6. Log event (optional)
  await db.query('INSERT INTO audit_logs (user_id, action, status) VALUES (?, ?, ?)', [
    user.id,
    'login',
    'success'
  ]);
  
  // 7. Return response (NO password!)
  const { password_hash, ...userWithoutPassword } = user;
  
  return res.status(200).json({
    statusCode: 200,
    message: 'Login successful',
    success: true,
    data: {
      user: userWithoutPassword,
      tokens: { accessToken, refreshToken }
    }
  });
});

// Protected route example
app.get('/users', authMiddleware, async (req, res) => {
  // Check admin role
  const admin = await db.query('SELECT role FROM users WHERE id = ?', [req.userId]);
  if (admin.role !== 'Admin') {
    return res.status(403).json({
      statusCode: 403,
      message: 'Forbidden',
      success: false
    });
  }
  
  const users = await db.query('SELECT id, username, fullName, email, role, status, createdAt, updatedAt FROM users');
  
  return res.status(200).json({
    statusCode: 200,
    message: 'Users retrieved',
    success: true,
    data: users
  });
});
```

---

## 🌍 Environment Variables

```bash
# .env (Backend)
DATABASE_URL=postgresql://user:password@localhost:5432/uav_pms
JWT_SECRET=your-super-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# Optional
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:5173
API_PORT=3000
```

---

## 📊 Data Migration Example

When adding a new field to production:

```sql
-- Add new column
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP NULL;

-- Update existing records
UPDATE users SET last_login_at = updatedAt WHERE last_login_at IS NULL;

-- Create index
CREATE INDEX idx_last_login_at ON users(last_login_at);
```

---

## 🧪 Testing Queries

```sql
-- Get all users
SELECT id, username, fullName, email, role, status, createdAt, updatedAt FROM users;

-- Get admin user
SELECT * FROM users WHERE role = 'Admin' AND status = 'Active';

-- Get locked accounts
SELECT * FROM users WHERE status = 'Locked';

-- Check token validity
SELECT * FROM refresh_tokens WHERE user_id = ? AND expiresAt > NOW() AND revokedAt IS NULL;

-- Audit log recent logins
SELECT * FROM audit_logs WHERE action = 'login' ORDER BY createdAt DESC LIMIT 10;
```

---

## 📞 Questions?

- Refer to [API_SPECIFICATION.md](API_SPECIFICATION.md) for endpoint details
- Refer to [BACKEND_INTEGRATION_GUIDE.md](BACKEND_INTEGRATION_GUIDE.md) for architecture
- Refer to [BACKEND_QUICK_REFERENCE.md](BACKEND_QUICK_REFERENCE.md) for quick lookup

---

**Created**: 2026-06-11  
**For**: Backend Development Team
