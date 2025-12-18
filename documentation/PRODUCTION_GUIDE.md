# Al Zohra RMS - Production Deployment Guide

This guide provides step-by-step instructions for deploying Al Zohra RMS v2 in a production environment.

## 1. Prerequisites
- Linux Server (Ubuntu 22.04+ recommended)
- Docker & Docker Compose installed
- Domain name with SSL certificates (Certbot/Let's Encrypt)
- SMTP Server (for email notifications)

## 2. Environment Configuration
Create a `.env` file in the root directory with the following variables:

```env
# Backend Configuration
PORT=5000
NODE_ENV=production
JWT_SECRET=your_strong_jwt_secret_key
CLIENT_URL=https://yourdomain.com

# Database Configuration
DATABASE_URL=postgresql://user:password@db:5432/alzohra_db
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=alzohra_db
```

## 3. Deployment with Docker
Use Docker Compose for a consistent environment.

```bash
# Start all services in detached mode
docker-compose up -d --build
```

## 4. Security Recommendations
- **SSL/TLS**: Use Nginx as a reverse proxy to handle SSL termination.
- **Firewall**: Restrict access to port 5432 (Postgres) to only the server itself or specific IP addresses.
- **Secrets**: Never commit your `.env` file to version control.

## 5. Maintenance & Backups
### Database Backup Script
Create a daily cron job to backup your database:

```bash
#!/bin/bash
BACKUP_DIR="/path/to/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
docker exec -t alzohra-db pg_dumpall -c -U user > $BACKUP_DIR/db_backup_$TIMESTAMP.sql
```

## 6. Monitoring
- **Logs**: Access backend logs via `docker logs alzohra-server`.
- **Health**: Monitor `https://api.yourdomain.com/health`.
