#!/bin/bash

# 清空 Redis 数据
echo "清空 Redis 数据..."

# 尝试 Docker 容器
if docker ps | grep -q binance-redis; then
    docker exec binance-redis redis-cli FLUSHALL
    echo "✅ Redis 数据已清空 (Docker)"
# 尝试本地 Redis
elif command -v redis-cli &> /dev/null && redis-cli ping &> /dev/null; then
    redis-cli FLUSHALL
    echo "✅ Redis 数据已清空 (本地)"
else
    echo "❌ Redis 未运行"
    exit 1
fi

echo "🔄 重启 backend 服务重新采集..."
docker-compose restart backend 2>/dev/null || echo "请手动重启 backend 服务"

