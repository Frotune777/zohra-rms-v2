# Development Guide - Al Zohra RMS v2

Complete guide for developers working on the Al Zohra Restaurant Management System.

---

## Table of Contents
- [Getting Started](#getting-started)
- [Development Environment](#development-environment)
- [Project Architecture](#project-architecture)
- [Coding Standards](#coding-standards)
- [Database Guidelines](#database-guidelines)
- [API Development](#api-development)
- [Frontend Development](#frontend-development)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Getting Started

### Prerequisites
- **Node.js** 16+ and npm
- **PostgreSQL** 15+
- **Docker** and Docker Compose (optional but recommended)
- **Git**
- Code editor (VS Code recommended)

### Initial Setup

```bash
# Clone repository
git clone <repository-url>
cd zohra-rms-v2

# Install dependencies
cd server && npm install
cd ../client && npm install

# Setup database
./db-access.sh shell
# Run schema.sql and seed.sql

# Start development servers
# Terminal 1 - Backend
cd server && npm run dev

# Terminal 2 - Frontend
cd client && npm run dev
```

---

## Development Environment

### Recommended VS Code Extensions
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **PostgreSQL** - Database management
- **Docker** - Container management
- **GitLens** - Git integration
- **Thunder Client** - API testing

### Environment Variables

**Backend (.env in server/):**
```env
DATABASE_URL=postgresql://admin:password@localhost:5432/alzohra_db
PORT=5000
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development
```

**Frontend (.env in client/):**
```env
VITE_API_URL=http://localhost:5000
```

---

## Project Architecture

### Backend Structure
```
server/src/
├── modules/           # Feature modules
│   ├── auth/         # Authentication
│   ├── finance/      # Financial management
│   ├── payroll/      # Payroll system
│   ├── inventory/    # Inventory tracking
│   ├── pos/          # Point of Sale
│   ├── chicken/      # Chicken tracker
│   └── reports/      # Reporting
├── config/           # Configuration
│   └── db.js        # Database connection
└── app.js           # Express app setup
```

### Frontend Structure
```
client/src/
├── components/       # Reusable components
│   ├── reports/     # Report components
│   └── ui/          # UI components
├── pages/           # Page components
│   ├── finance/    # Finance pages
│   ├── chicken/    # Chicken pages
│   └── reports/    # Report pages
├── context/         # React context
│   └── AuthContext.jsx
├── utils/           # Utilities
│   └── api.js      # Centralized API client
└── App.jsx         # Main app
```

---

## Coding Standards

### JavaScript/React
- Use **ES6+** syntax
- **Functional components** with hooks
- **Destructuring** for props and state
- **Arrow functions** for callbacks
- **Async/await** for promises

### Naming Conventions
- **Components**: PascalCase (`UserProfile.jsx`)
- **Files**: camelCase (`userService.js`)
- **Variables**: camelCase (`userName`)
- **Constants**: UPPER_SNAKE_CASE (`API_BASE_URL`)
- **Database**: snake_case (`user_id`, `created_at`)

### Code Style
```javascript
// ✅ Good
const fetchUsers = async () => {
  try {
    const response = await api.get('users');
    return response.data;
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
};

// ❌ Avoid
function fetchUsers() {
  return axios.get('http://localhost:5000/api/users')
    .then(res => res.data)
    .catch(err => console.log(err));
}
```

---

## Database Guidelines

### Schema Changes
1. Create migration SQL file in `database/migrations/`
2. Test locally
3. Update `DATABASE_SCHEMA.md`
4. Commit migration file

### Query Best Practices
```javascript
// ✅ Use parameterized queries
const result = await db.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);

// ❌ Never concatenate user input
const result = await db.query(
  `SELECT * FROM users WHERE email = '${email}'`
);
```

### Transactions
```javascript
const client = await db.pool.connect();
try {
  await client.query('BEGIN');
  
  // Your queries here
  await client.query('INSERT INTO ...');
  await client.query('UPDATE ...');
  
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

---

## API Development

### Creating New Endpoints

**1. Create Controller (`server/src/modules/feature/feature.controller.js`):**
```javascript
const getItems = async (req, res) => {
  try {
    const items = await db.query('SELECT * FROM items');
    res.json(items.rows);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
};

module.exports = { getItems };
```

**2. Create Routes (`server/src/modules/feature/feature.routes.js`):**
```javascript
const express = require('express');
const router = express.Router();
const { getItems } = require('./feature.controller');
const { authenticateToken } = require('../auth/auth.middleware');

router.get('/items', authenticateToken, getItems);

module.exports = router;
```

**3. Register in App (`server/src/app.js`):**
```javascript
const featureRoutes = require('./modules/feature/feature.routes');
app.use('/api/feature', featureRoutes);
```

### API Response Format
```javascript
// Success
res.json({ data: items });

// Error
res.status(400).json({ error: 'Validation failed' });

// Created
res.status(201).json({ id: newItem.id });
```

---

## Frontend Development

### Using the API Utility

**Always use the centralized `api` utility:**
```javascript
import api from '../utils/api';

// ✅ Correct
const fetchData = async () => {
  const response = await api.get('endpoint');
  return response.data;
};

// ❌ Wrong - Don't use axios directly
import axios from 'axios';
const response = await axios.get('http://localhost:5000/api/endpoint');
```

### Component Structure
```javascript
import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { toast } from 'react-hot-toast';

const MyComponent = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await api.get('endpoint');
      setData(response.data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {/* Your component JSX */}
    </div>
  );
};

export default MyComponent;
```

### State Management
- Use **useState** for local state
- Use **useContext** for global state (Auth)
- Avoid prop drilling - use context when needed

---

## Testing

### Backend Tests
```bash
cd server
npm test
```

**Example Test:**
```javascript
const request = require('supertest');
const app = require('../src/app');

describe('GET /api/users', () => {
  it('should return all users', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
```

### Frontend Tests
```bash
cd client
npm test
```

---

## Deployment

### Production Build

**Frontend:**
```bash
cd client
npm run build
# Output in client/dist/
```

**Backend:**
```bash
cd server
# Set NODE_ENV=production
# Use PM2 or similar for process management
```

### Docker Deployment
```bash
# Build and start
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

---

## Common Tasks

### Adding a New Feature Module

1. Create module directory in `server/src/modules/feature-name/`
2. Create `feature.controller.js`, `feature.routes.js`
3. Register routes in `app.js`
4. Create frontend page in `client/src/pages/feature-name/`
5. Add route in `App.jsx`
6. Update documentation

### Database Backup
```bash
./db-access.sh backup
```

### Clearing Browser Cache
After making changes to authentication or API code:
- Press **Ctrl+Shift+R** (hard refresh)

---

## Troubleshooting

### Common Issues

**"axios is not defined"**
- Solution: Use `api` utility instead of direct `axios`
- Hard refresh browser (Ctrl+Shift+R)

**Database connection failed**
- Check Docker containers: `docker-compose ps`
- Verify credentials in `.env`
- Check database is running: `./db-access.sh info`

**Port already in use**
- Frontend (3002): `lsof -ti:3002 | xargs kill`
- Backend (5000): `lsof -ti:5000 | xargs kill`

---

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push to remote
git push origin feature/my-feature

# Create pull request on GitHub
```

### Commit Message Format
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Formatting
- `refactor:` Code restructuring
- `test:` Adding tests
- `chore:` Maintenance

---

## Resources

- [React Documentation](https://react.dev/)
- [Express.js Guide](https://expressjs.com/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Tailwind CSS](https://tailwindcss.com/docs)

---

**Last Updated**: December 16, 2024
