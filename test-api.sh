#!/bin/bash

# API测试脚本

echo "=================================="
echo "🧪 Binance 流动性监控 API 测试"
echo "=================================="
echo ""

API_BASE="http://localhost:3000"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_endpoint() {
    local name=$1
    local url=$2
    local method=${3:-GET}
    
    echo -n "测试 $name ... "
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$url")
    else
        response=$(curl -s -w "\n%{http_code}" "$url")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✅ 成功${NC} (HTTP $http_code)"
        return 0
    elif [ "$http_code" -ge 400 ] && [ "$http_code" -lt 500 ]; then
        echo -e "${YELLOW}⚠️  客户端错误${NC} (HTTP $http_code)"
        return 1
    else
        echo -e "${RED}❌ 失败${NC} (HTTP $http_code)"
        return 1
    fi
}

# 检查后端是否运行
echo "1️⃣  检查后端服务..."
if ! curl -s "$API_BASE/health" > /dev/null; then
    echo -e "${RED}❌ 后端未运行！请先启动后端服务。${NC}"
    echo ""
    echo "启动后端："
    echo "  cd backend && npm start"
    exit 1
fi
echo -e "${GREEN}✅ 后端服务正常${NC}"
echo ""

# 测试健康检查
echo "2️⃣  测试健康检查..."
test_endpoint "健康检查" "$API_BASE/health"
echo ""

# 测试API状态
echo "3️⃣  测试API状态..."
test_endpoint "API状态" "$API_BASE/api/status"
echo ""

# 测试流动性数据
echo "4️⃣  测试流动性数据..."
echo "⚠️  这将调用 Binance API，可能需要较长时间..."
test_endpoint "流动性数据" "$API_BASE/api/liquidity"
echo ""

# 测试特定交易对深度
echo "5️⃣  测试交易对深度..."
test_endpoint "BTC现货深度" "$API_BASE/api/depth/BTCUSDT?type=spot"
test_endpoint "ETH永续深度" "$API_BASE/api/depth/ETHUSDT?type=futures"
echo ""

# 再次检查API状态
echo "6️⃣  检查API使用情况..."
status_response=$(curl -s "$API_BASE/api/status")
used_weight=$(echo "$status_response" | grep -o '"usedWeight":[0-9]*' | grep -o '[0-9]*')
is_blocked=$(echo "$status_response" | grep -o '"isBlocked":[a-z]*' | grep -o '[a-z]*$')
is_paused=$(echo "$status_response" | grep -o '"isPaused":[a-z]*' | grep -o '[a-z]*$')

echo "使用权重: $used_weight / 6000"

if [ "$is_blocked" = "true" ]; then
    echo -e "${RED}⚠️  API已被封禁 (418)${NC}"
elif [ "$is_paused" = "true" ]; then
    echo -e "${YELLOW}⚠️  触发限流 (429)${NC}"
else
    echo -e "${GREEN}✅ API状态正常${NC}"
fi
echo ""

# 测试清除缓存
echo "7️⃣  测试清除缓存..."
test_endpoint "清除缓存" "$API_BASE/api/clear-cache" "POST"
echo ""

echo "=================================="
echo "✅ 测试完成！"
echo "=================================="
echo ""
echo "💡 提示："
echo "  - 前端地址: http://localhost:5173"
echo "  - 后端地址: http://localhost:3000"
echo "  - 查看完整响应: curl http://localhost:3000/api/liquidity | jq"
echo ""

