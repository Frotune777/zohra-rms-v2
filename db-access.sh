#!/bin/bash

# Database Access Helper Script
# Usage: ./db-access.sh [command]

DB_CONTAINER="alzohra-db"
DB_USER="admin"
DB_NAME="alzohra_db"
DB_PASSWORD="password"

case "$1" in
  "shell")
    echo "🔌 Connecting to PostgreSQL shell..."
    docker exec -it $DB_CONTAINER psql -U $DB_USER -d $DB_NAME
    ;;
  "tables")
    echo "📋 Listing all tables..."
    docker exec -it $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "\dt"
    ;;
  "users")
    echo "👥 Showing users..."
    docker exec -it $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "SELECT id, name, email, role FROM users;"
    ;;
  "backup")
    BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
    echo "💾 Creating backup: $BACKUP_FILE"
    docker exec $DB_CONTAINER pg_dump -U $DB_USER $DB_NAME > $BACKUP_FILE
    echo "✅ Backup saved to: $BACKUP_FILE"
    ;;
  "info")
    echo "📊 Database Connection Info:"
    echo "  Host: localhost"
    echo "  Port: 5432"
    echo "  Database: $DB_NAME"
    echo "  Username: $DB_USER"
    echo "  Password: $DB_PASSWORD"
    echo ""
    echo "🔗 Connection String:"
    echo "  postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
    ;;
  *)
    echo "Database Access Helper"
    echo ""
    echo "Usage: ./db-access.sh [command]"
    echo ""
    echo "Commands:"
    echo "  shell   - Open PostgreSQL shell"
    echo "  tables  - List all tables"
    echo "  users   - Show all users"
    echo "  backup  - Create database backup"
    echo "  info    - Show connection details"
    echo ""
    echo "Example: ./db-access.sh shell"
    ;;
esac
