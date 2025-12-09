# Al Zohra RMS v2 - Setup & Installation Guide

## 🚀 Quick Start

### First Time Setup

Run the automated setup script:

```bash
./setup.sh
```

This will:
- ✅ Check system requirements (Node.js, Docker, Docker Compose)
- ✅ Create environment configuration files
- ✅ Install all dependencies (server & client)
- ✅ Setup PostgreSQL database
- ✅ Run database migrations
- ✅ Verify database connection

### Starting the Application

After setup, start the application:

```bash
./start.sh
```

Or with Docker Compose:

```bash
docker-compose up
```

---

## 📋 System Requirements

### Required Software

- **Node.js**: v16 or higher
- **npm**: v7 or higher
- **Docker**: Latest version
- **Docker Compose**: Latest version

### Check Your System

```bash
node -v    # Should be v16.x.x or higher
npm -v     # Should be v7.x.x or higher
docker --version
docker-compose --version
```

---

## 🔧 Manual Setup (Alternative)

If you prefer manual setup:

### 1. Install Dependencies

```bash
# Server dependencies
cd server
npm install

# Client dependencies
cd ../client
npm install
```

### 2. Create Environment Files

**server/.env:**
```env
DATABASE_URL=postgres://admin:password@localhost:5432/alzohra_db
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=24h
CLIENT_URL=http://localhost:3001
```

**client/.env:**
```env
REACT_APP_API_URL=http://localhost:5000
REACT_APP_WS_URL=http://localhost:5000
```

### 3. Start Database

```bash
docker-compose up -d postgres
```

### 4. Run Migrations

```bash
cd server
npm run db:migrate
```

### 5. Start Application

```bash
# Terminal 1 - Server
cd server
npm run dev

# Terminal 2 - Client
cd client
npm start
```

---

## 🧪 Running Tests

```bash
cd server

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

---

## 🐳 Docker Commands

### Start all services
```bash
docker-compose up
```

### Start in detached mode
```bash
docker-compose up -d
```

### Stop all services
```bash
docker-compose down
```

### View logs
```bash
docker-compose logs -f
```

### Rebuild containers
```bash
docker-compose up --build
```

---

## 🔍 Troubleshooting

### Database Connection Issues

1. **Check if PostgreSQL is running:**
   ```bash
   docker ps | grep postgres
   ```

2. **Verify database connection:**
   ```bash
   cd server
   node scripts/check-db.js
   ```

3. **Reset database:**
   ```bash
   docker-compose down -v
   docker-compose up -d postgres
   npm run db:migrate
   ```

### Permission Issues

If you encounter permission errors with `node_modules`:

```bash
# Server
cd server
sudo chown -R $USER:$USER node_modules

# Client
cd client
sudo chown -R $USER:$USER node_modules
```

### Port Already in Use

If ports 3001, 5000, or 5432 are already in use:

1. **Find the process:**
   ```bash
   lsof -i :5000  # or :3001, :5432
   ```

2. **Kill the process:**
   ```bash
   kill -9 <PID>
   ```

3. **Or change ports in:**
   - `docker-compose.yml`
   - `server/.env`
   - `client/.env`

---

## 📁 Project Structure

```
zohra-rms-v2/
├── client/              # React frontend
│   ├── src/
│   ├── public/
│   └── package.json
├── server/              # Node.js backend
│   ├── src/
│   │   ├── modules/    # Feature modules
│   │   ├── config/     # Configuration
│   │   └── middleware/ # Express middleware
│   ├── tests/          # Unit tests
│   ├── scripts/        # Utility scripts
│   └── package.json
├── database/            # Database schemas
│   └── schema.sql
├── setup.sh            # First-run setup script
├── start.sh            # Application start script
└── docker-compose.yml  # Docker configuration
```

---

## 🌐 Access Points

After starting the application:

- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:5000
- **API Health**: http://localhost:5000/health
- **Database**: localhost:5432

---

## 📚 Available Scripts

### Server Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm test           # Run tests
npm run test:watch # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npm run db:migrate # Run database migrations
npm run db:seed    # Seed database with sample data
```

### Client Scripts

```bash
npm start          # Start development server
npm run build      # Build for production
npm test           # Run tests
```

---

## 🔐 Default Credentials

**Admin User:**
- Email: `admin@alzohra.com`
- Password: `admin123`

**Manager User:**
- Email: `manager@alzohra.com`
- Password: `manager123`

> ⚠️ **Important**: Change these credentials in production!

---

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the logs: `docker-compose logs -f`
3. Check database connection: `node server/scripts/check-db.js`

---

## 🎉 You're All Set!

The application should now be running successfully. Happy coding! 🚀
