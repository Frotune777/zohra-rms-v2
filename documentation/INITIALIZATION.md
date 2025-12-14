# Al Zohra RMS v2 - Project Initialization System

## Overview

This document describes the automated initialization system that ensures all dependencies and configurations are properly set up on first run.

## Components

### 1. Setup Script (`setup.sh`)

**Purpose**: Comprehensive first-run setup that checks and initializes everything.

**What it does:**
- ✅ Checks system requirements (Node.js 16+, npm, Docker, Docker Compose)
- ✅ Creates environment files (`.env`) with secure defaults
- ✅ Installs all npm dependencies for server and client
- ✅ Fixes file permissions for `node_modules`
- ✅ Starts PostgreSQL container
- ✅ Runs database migrations
- ✅ Verifies database connection
- ✅ Creates `.setup_complete` marker file

**Usage:**
```bash
./setup.sh
```

### 2. Smart Start Script (`start.sh`)

**Purpose**: Intelligent application starter that auto-runs setup if needed.

**What it does:**
- Checks for `.setup_complete` marker
- If not found, automatically runs `setup.sh`
- Starts the application with Docker Compose or local mode
- Handles Docker daemon startup

**Usage:**
```bash
# Start with Docker Compose
./start.sh

# Start in local development mode
./start.sh --local
```

### 3. Database Scripts

#### Check Database (`server/scripts/check-db.js`)
- Verifies database connection
- Lists all existing tables
- Checks for required tables
- Provides troubleshooting guidance

**Usage:**
```bash
cd server
node scripts/check-db.js
```

#### Migrate Database (`server/scripts/migrate.js`)
- Runs database schema from `database/schema.sql`
- Creates all required tables
- Handles errors gracefully

**Usage:**
```bash
cd server
npm run db:migrate
```

### 4. Environment Configuration

**Server `.env` (auto-generated):**
```env
DATABASE_URL=postgres://admin:password@localhost:5432/alzohra_db
PORT=5000
NODE_ENV=development
JWT_SECRET=<randomly-generated-secure-key>
JWT_EXPIRES_IN=24h
CLIENT_URL=http://localhost:3001
```

**Client `.env` (auto-generated):**
```env
REACT_APP_API_URL=http://localhost:5000
REACT_APP_WS_URL=http://localhost:5000
```

### 5. Package.json Scripts

**Server scripts:**
```json
{
  "setup": "bash ../setup.sh",
  "start": "node server.js",
  "dev": "nodemon server.js",
  "test": "jest",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage",
  "db:migrate": "node scripts/migrate.js",
  "db:seed": "node scripts/seed.js"
}
```

## Workflow

### First Run

```
User runs ./setup.sh
    ↓
Check system requirements
    ↓
Create .env files
    ↓
Install dependencies
    ↓
Start PostgreSQL
    ↓
Run migrations
    ↓
Verify connection
    ↓
Create .setup_complete marker
    ↓
Ready to use!
```

### Subsequent Runs

```
User runs ./start.sh
    ↓
Check for .setup_complete
    ↓
(exists) → Start application
    ↓
Application running
```

## Error Handling

### System Requirements Not Met
- Script exits with clear error message
- Provides installation links
- Prevents partial setup

### Database Connection Fails
- Retries with timeout
- Provides troubleshooting steps
- Exits gracefully

### Permission Issues
- Automatically fixes `node_modules` permissions
- Uses `sudo` only when necessary
- Informs user of actions taken

## Security Features

1. **Random JWT Secret**: Generated using `openssl rand -base64 32`
2. **Environment Isolation**: `.env` files not committed to git
3. **Secure Defaults**: Production-ready configuration templates
4. **Permission Checks**: Prevents running as root

## Maintenance

### Reset Setup
To force re-run setup:
```bash
rm .setup_complete
./start.sh
```

### Update Dependencies
```bash
cd server && npm update
cd ../client && npm update
```

### Database Reset
```bash
docker-compose down -v
./setup.sh
```

## Troubleshooting

### "Docker daemon is not running"
```bash
sudo systemctl start docker
./setup.sh
```

### "Permission denied: node_modules"
```bash
cd server
sudo chown -R $USER:$USER node_modules
cd ../client
sudo chown -R $USER:$USER node_modules
```

### "Port already in use"
```bash
# Find process using port
lsof -i :5000

# Kill process
kill -9 <PID>
```

## Benefits

1. **Zero Manual Configuration**: Everything automated
2. **Idempotent**: Safe to run multiple times
3. **Self-Documenting**: Clear output at each step
4. **Error Recovery**: Helpful error messages
5. **Cross-Platform**: Works on Linux/macOS
6. **Developer Friendly**: Fast setup for new team members

## Future Enhancements

- [ ] Windows support (PowerShell script)
- [ ] Database seeding with sample data
- [ ] Health check dashboard
- [ ] Automated backup configuration
- [ ] SSL certificate setup
- [ ] Production deployment scripts

---

**Last Updated**: 2024-12-08
**Version**: 2.0.0
