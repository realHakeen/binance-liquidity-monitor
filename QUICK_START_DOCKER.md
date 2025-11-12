# 🐳 Docker Quick Start Guide

## Prerequisites

- Docker >= 20.10
- Docker Compose >= 2.0

## 🚀 Quick Commands

### Production Mode

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Access:**
- Frontend: http://localhost
- Backend API: http://localhost:3000/health

### Development Mode (Hot Reload)

```bash
# Build and start in dev mode
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop services
docker-compose -f docker-compose.dev.yml down
```

**Access:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000/health

## 📋 Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend (Prod) | 80 | Nginx serving React app |
| Frontend (Dev) | 5173 | Vite dev server with hot reload |
| Backend | 3000 | Node.js Express API |
| Redis | 6379 | Redis database |

## 🔧 Build Commands

```bash
# Build all services
docker-compose build

# Build specific service
docker-compose build frontend
docker-compose build backend

# Rebuild without cache
docker-compose build --no-cache
```

## 📝 Environment Variables

### Backend

Create `backend/.env`:

```env
NODE_ENV=production
PORT=3000
REDIS_URL=redis://redis:6379
```

### Frontend (Dev)

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:3000
```

## 🐛 Troubleshooting

### Port already in use

```bash
# Find and kill process
lsof -i :3000
kill -9 <PID>
```

### View logs

```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f redis
```

### Restart service

```bash
docker-compose restart backend
```

## 🧹 Cleanup

```bash
# Remove containers and volumes
docker-compose down -v

# Remove everything including images
docker-compose down -v --rmi all
```

## 📚 More Info

See [DOCKER.md](./DOCKER.md) for detailed documentation.
