#!/bin/bash

# Al Zohra RMS v2 - First Run Setup Script
# This script checks and initializes all dependencies and database

set -e  # Exit on error

echo "🚀 Al Zohra RMS v2 - First Run Setup"
echo "===================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_error "Please do not run this script as root"
    exit 1
fi

echo "Step 1: Checking System Requirements"
echo "-------------------------------------"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    print_success "Node.js installed: $NODE_VERSION"
    
    # Check if version is >= 16
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$MAJOR_VERSION" -lt 16 ]; then
        print_error "Node.js version 16 or higher is required. Current: $NODE_VERSION"
        exit 1
    fi
else
    print_error "Node.js is not installed"
    print_info "Please install Node.js 16 or higher from https://nodejs.org/"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    print_success "npm installed: $NPM_VERSION"
else
    print_error "npm is not installed"
    exit 1
fi

# Check Docker
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    print_success "Docker installed: $DOCKER_VERSION"
else
    print_error "Docker is not installed"
    print_info "Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi

# Check Docker Compose
if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
    print_success "Docker Compose is available"
else
    print_error "Docker Compose is not installed"
    print_info "Please install Docker Compose"
    exit 1
fi

echo ""
echo "Step 2: Setting up Environment Files"
echo "-------------------------------------"

# Create .env file for server if it doesn't exist
if [ ! -f "server/.env" ]; then
    print_info "Creating server/.env file..."
    cat > server/.env << EOF
# Database Configuration
DATABASE_URL=postgres://admin:password@localhost:5432/alzohra_db

# Server Configuration
PORT=5000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRES_IN=24h

# CORS Configuration
CLIENT_URL=http://localhost:3002
EOF
    print_success "Created server/.env file"
else
    print_success "server/.env file already exists"
fi

# Create .env file for client if it doesn't exist
if [ ! -f "client/.env" ]; then
    print_info "Creating client/.env file..."
    cat > client/.env << EOF
# API Configuration
VITE_API_URL=http://localhost:5000
REACT_APP_WS_URL=http://localhost:5000
EOF
    print_success "Created client/.env file"
else
    print_success "client/.env file already exists"
fi

echo ""
echo "Step 3: Installing Dependencies"
echo "--------------------------------"

# Install server dependencies
if [ -d "server" ]; then
    print_info "Installing server dependencies..."
    cd server
    
    # Check if node_modules exists and has correct permissions
    if [ -d "node_modules" ]; then
        print_info "Checking node_modules permissions..."
        if [ -w "node_modules" ]; then
            print_success "node_modules has correct permissions"
        else
            print_info "Fixing node_modules permissions..."
            sudo chown -R $USER:$USER node_modules 2>/dev/null || true
        fi
    fi
    
    npm install
    print_success "Server dependencies installed"
    cd ..
else
    print_error "Server directory not found"
    exit 1
fi

# Install client dependencies
if [ -d "client" ]; then
    print_info "Installing client dependencies..."
    cd client
    
    # Check if node_modules exists and has correct permissions
    if [ -d "node_modules" ]; then
        print_info "Checking node_modules permissions..."
        if [ -w "node_modules" ]; then
            print_success "node_modules has correct permissions"
        else
            print_info "Fixing node_modules permissions..."
            sudo chown -R $USER:$USER node_modules 2>/dev/null || true
        fi
    fi
    
    npm install
    print_success "Client dependencies installed"
    cd ..
else
    print_error "Client directory not found"
    exit 1
fi

echo ""
echo "Step 4: Database Setup"
echo "----------------------"

# Check if Docker is running
if ! docker info &> /dev/null; then
    print_error "Docker daemon is not running"
    print_info "Please start Docker and run this script again"
    exit 1
fi

# Check if database container is running
if docker ps | grep -q postgres; then
    print_success "PostgreSQL container is already running"
else
    print_info "Starting PostgreSQL container..."
    docker-compose up -d postgres
    
    # Wait for PostgreSQL to be ready
    print_info "Waiting for PostgreSQL to be ready..."
    sleep 5
    
    MAX_RETRIES=30
    RETRY_COUNT=0
    while ! docker exec $(docker ps -q -f name=postgres) pg_isready -U admin &> /dev/null; do
        RETRY_COUNT=$((RETRY_COUNT+1))
        if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
            print_error "PostgreSQL failed to start within timeout"
            exit 1
        fi
        echo -n "."
        sleep 1
    done
    echo ""
    print_success "PostgreSQL is ready"
fi

# Run database migrations
print_info "Running database migrations..."
if [ -f "database/init.sql" ]; then
    docker exec -i $(docker ps -q -f name=postgres) psql -U admin -d alzohra_db < database/init.sql 2>/dev/null || true
    print_success "Database schema initialized"
    
    # Run additional migrations if they exist
    if [ -f "database/missing_tables.sql" ]; then
        docker exec -i $(docker ps -q -f name=postgres) psql -U admin -d alzohra_db < database/missing_tables.sql 2>/dev/null || true
        print_success "Additional tables created"
    fi
elif [ -f "database/schema.sql" ]; then
    docker exec -i $(docker ps -q -f name=postgres) psql -U admin -d alzohra_db < database/schema.sql 2>/dev/null || true
    print_success "Database schema initialized"
else
    print_info "No schema file found, skipping database initialization"
fi

echo ""
echo "Step 5: Verification"
echo "--------------------"

# Verify server can connect to database
print_info "Verifying database connection..."
cd server
if node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://admin:password@localhost:5433/alzohra_db' });
pool.query('SELECT NOW()')
    .then(() => { console.log('✓ Database connection successful'); process.exit(0); })
    .catch(err => { console.error('✗ Database connection failed:', err.message); process.exit(1); });
" 2>/dev/null; then
    print_success "Database connection verified"
else
    print_error "Database connection failed"
    print_info "Please check your database configuration"
fi
cd ..

echo ""
echo "Step 6: Creating Setup Marker"
echo "------------------------------"

# Create a marker file to indicate setup is complete
touch .setup_complete
print_success "Setup marker created"

echo ""
echo "=========================================="
echo "✅ Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Start the application:"
echo "     ./start.sh"
echo ""
echo "  2. Or start with Docker Compose:"
echo "     docker-compose up"
echo ""
echo "  3. Access the application:"
echo "     - Frontend: http://localhost:3001"
echo "     - Backend:  http://localhost:5000"
echo ""
echo "  4. Run tests:"
echo "     cd server && npm test"
echo ""
print_success "Happy coding! 🚀"
