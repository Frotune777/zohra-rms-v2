# Project Structure
Last Updated: 2026-03-03

## Directory Tree
.
├── client/                 # React Frontend
├── server/                 # Node.js Backend
├── database/               # SQL Scripts & Migrations
├── docs/                   # Additional Documentation
├── documentation/          # Core Documentation
├── pyproject.toml         # Project dependencies (Global rules)
├── .pre-commit-config.yaml # Pre-commit hooks
├── uv.lock                # Locked dependencies
├── package.json           # Root package (scripts)
├── docker-compose.yml     # Multi-container orchestration
├── db-access.sh           # Database management helper
└── setup.sh               # System initialization script

## Module Responsibilities

### client/
**Purpose**: React frontend application.
**Key Files**:
- `App.jsx`: Root component and routing.
- `src/pages/`: Page-level components.
- `src/components/`: Reusable UI components.

**Dependencies**: axios, react, vite
**Used By**: N/A

### server/
**Purpose**: Node.js/Express backend API.
**Key Files**:
- `src/app.js`: Express application setup.
- `src/modules/`: Feature-specific logic (auth, finance, etc.).

**Dependencies**: express, pg, jwt
**Used By**: client/

## Data Flow
User -> Browser (Client) -> axios -> Express Server (Backend) -> PostgreSQL (Database)

## Configuration Files
- `pyproject.toml`: Project dependencies and ruff settings
- `.pre-commit-config.yaml`: Pre-commit hooks
- `uv.lock`: Locked dependencies
- `package.json`: Node.js dependencies
- `.env`: Environment variables
