#!/bin/bash

# Al Zohra RMS - Stop Script
# This script stops all services

echo "🛑 Stopping Al Zohra RMS..."
echo ""

docker-compose down

echo ""
echo "✅ All services stopped"
echo ""
echo "📋 To start again: ./start.sh"
echo "📋 To remove volumes: docker-compose down -v"
echo ""
