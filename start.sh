#!/bin/bash

# Al Zohra RMS - Easy Start Script
# This script starts all services with Docker Compose

echo "🚀 Starting Al Zohra RMS..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "Please start Docker and try again"
    exit 1
fi

# Check if .env exists, if not copy from .env.example
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please update .env with your actual configuration"
    echo ""
fi

# Start services
echo "🛑 Stopping existing containers to free up ports..."
docker compose down || true

echo "🧹 Releasing ports 3001 and 5000 from rogue processes..."
for port in 3001 5000; do
    PIDS=$(lsof -t -i:$port -sTCP:LISTEN 2>/dev/null)
    if [ ! -z "$PIDS" ]; then
        echo "Killing processes on port $port: $PIDS"
        kill -9 $PIDS
    fi
done

echo "🐳 Starting Docker containers..."
docker compose up -d --build

# Wait for services to be healthy
echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check service status
echo ""
echo "📊 Service Status:"
docker compose ps

echo ""
echo "✅ Al Zohra RMS is starting!"
echo ""
echo "🌐 Access the application:"
echo "   Frontend: http://localhost:3001"
echo "   Backend:  http://localhost:5000"
echo ""
echo "📝 Default credentials:"
echo "   Owner:    owner@alzohra.com / owner123"
echo "   Manager:  manager@alzohra.com / manager123"
echo "   Staff:    staff@alzohra.com / staff123"
echo ""
echo "📋 Useful commands:"
echo "   View logs:  docker compose logs -f"
echo "   Stop:       ./stop.sh or docker compose down"
echo "   Restart:    docker compose restart"
echo ""
