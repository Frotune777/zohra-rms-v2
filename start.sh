#!/bin/bash

# Al Zohra RMS v2 - Smart Start Script
# Checks if setup is needed before starting the application

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Check if setup has been run
if [ ! -f ".setup_complete" ]; then
    echo "⚠️  First run detected!"
    echo ""
    echo "Running initial setup..."
    echo ""
    ./setup.sh
    echo ""
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    print_info "Starting Docker..."
    # Try to start Docker (this varies by system)
    if command -v systemctl &> /dev/null; then
        sudo systemctl start docker
    fi
    sleep 3
fi

# Start the application
print_info "Starting Al Zohra RMS v2..."
echo ""

# Check if user wants to use Docker Compose or local development
if [ "$1" == "--local" ]; then
    print_info "Starting in local development mode..."
    
    # Start database only
    docker-compose up -d postgres
    
    # Wait for database
    sleep 3
    
    # Start server
    cd server
    npm run dev &
    SERVER_PID=$!
    cd ..
    
    # Start client
    cd client
    npm start &
    CLIENT_PID=$!
    cd ..
    
    print_success "Application started in local mode"
    echo ""
    echo "Server PID: $SERVER_PID"
    echo "Client PID: $CLIENT_PID"
    echo ""
    echo "Press Ctrl+C to stop"
    
    # Wait for interrupt
    trap "kill $SERVER_PID $CLIENT_PID; docker-compose down; exit" INT
    wait
else
    # Start with Docker Compose
    docker-compose up
fi
