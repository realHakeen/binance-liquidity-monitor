# Docker Setup Guide

This guide explains how to build and run the Binance Liquidity Monitor using Docker.

## 📋 Prerequisites

- Docker >= 20.10
- Docker Compose >= 2.0

## 🚀 Quick Start

### Production Mode

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

### Development Mode (with hot reload)

```bash
# Build and start all services in dev mode
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop all services
docker-compose -f docker-compose.dev.yml down
```

## 📦 Services

### Production (`docker-compose.yml`)

- **Frontend**: Nginx serving built React app on port **80**
- **Backend**: Node.js Express API on port **3000**
- **Redis**: Redis 7 on port **6379**

### Development (`docker-compose.dev.yml`)

- **Frontend**: Vite dev server with hot reload on port **5173**
- **Backend**: Node.js with nodemon for hot reload on port **3000**
- **Redis**: Redis 7 on port **6379**

## 🔧 Build Commands

### Build all services

```bash
# Production
docker-compose build

# Development
docker-compose -f docker-compose.dev.yml build
```

### Build specific service

```bash
# Production
docker-compose build frontend
docker-compose build backend

# Development
docker-compose -f docker-compose.dev.yml build frontend
docker-compose -f docker-compose.dev.yml build backend
```

### Rebuild without cache

```bash
docker-compose build --no-cache
```

## 🌐 Access Services

### Production

- Frontend: http://localhost
- Backend API: http://localhost:3000
- Backend Health: http://localhost:3000/health
- Redis: localhost:6379

### Development

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Backend Health: http://localhost:3000/health
- Redis: localhost:6379

## 📝 Environment Variables

### Backend

Create `backend/.env` file:

```env
NODE_ENV=production
PORT=3000
REDIS_URL=redis://redis:6379
LOG_LEVEL=info
CORS_ORIGIN=*
```

### Frontend

For development, create `frontend/.env`:

```env
VITE_API_URL=http://localhost:3000
```

## 🔍 Useful Commands

### View logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f redis
```

### Execute commands in containers

```bash
# Backend shell
docker-compose exec backend sh

# Frontend shell
docker-compose exec frontend sh

# Redis CLI
docker-compose exec redis redis-cli
```

### Check service status

```bash
docker-compose ps
```

### Restart services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart backend
```

## 🧹 Cleanup

### Remove containers and networks

```bash
docker-compose down
```

### Remove containers, networks, and volumes

```bash
docker-compose down -v
```

### Remove images

```bash
# Remove all project images
docker-compose down --rmi all

# Remove specific image
docker rmi binance-liquidity-frontend
docker rmi binance-liquidity-backend
```

### Complete cleanup

```bash
# Stop and remove everything
docker-compose down -v --rmi all

# Remove unused Docker resources
docker system prune -a
```

## 🐛 Troubleshooting

### Port already in use

```bash
# Find process using port
lsof -i :3000
lsof -i :5173
lsof -i :6379
lsof -i :80

# Kill process
kill -9 <PID>
```

### Container won't start

```bash
# Check logs
docker-compose logs <service-name>

# Check container status
docker-compose ps

# Rebuild container
docker-compose up -d --build <service-name>
```

### Redis connection issues

```bash
# Test Redis connection
docker-compose exec redis redis-cli ping

# Check Redis logs
docker-compose logs redis
```

### Frontend not loading

```bash
# Check if frontend is built (production)
docker-compose exec frontend ls -la /usr/share/nginx/html

# Check nginx logs
docker-compose logs frontend

# Check nginx config
docker-compose exec frontend nginx -t
```

### Hot reload not working (dev mode)

```bash
# Ensure volumes are mounted correctly
docker-compose -f docker-compose.dev.yml config

# Rebuild dev containers
docker-compose -f docker-compose.dev.yml up -d --build
```

## 📊 Health Checks

All services include health checks:

```bash
# Check health status
docker-compose ps

# Manual health check
curl http://localhost:3000/health
curl http://localhost/health
```

## 🔐 Security Notes

- Production setup uses Nginx for serving static files
- Backend API is proxied through Nginx in production
- Redis is only accessible within Docker network
- Use environment variables for sensitive configuration

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Nginx Documentation](https://nginx.org/en/docs/)

