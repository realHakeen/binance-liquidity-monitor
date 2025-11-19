#!/bin/bash

# 测试订阅和健康检查机制
# 用法: ./test-subscription-health.sh

echo "=================================================="
echo "🧪 测试 WebSocket 订阅和健康检查机制"
echo "=================================================="
echo ""

API_URL="http://localhost:3000/api"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 等待服务启动
echo -e "${BLUE}⏳ 等待服务启动...${NC}"
for i in {1..30}; do
  if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 服务已启动${NC}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${RED}❌ 服务启动超时${NC}"
    exit 1
  fi
  sleep 1
done

echo ""
echo "=================================================="
echo "📊 测试 1: 检查活跃订阅状态"
echo "=================================================="

# 等待订阅初始化（至少等待15秒让健康检查运行一次）
echo -e "${BLUE}⏳ 等待10秒让订阅初始化...${NC}"
sleep 10

echo ""
echo "获取当前订阅状态..."
SUBS_RESPONSE=$(curl -s "${API_URL}/websocket/status")

if [ $? -eq 0 ]; then
  echo "$SUBS_RESPONSE" | jq '.' 2>/dev/null || echo "$SUBS_RESPONSE"
  
  # 提取关键信息
  ACTIVE_COUNT=$(echo "$SUBS_RESPONSE" | jq -r '.data.activeConnections // 0' 2>/dev/null)
  FAILED_COUNT=$(echo "$SUBS_RESPONSE" | jq -r '.data.failedSubscriptions // 0' 2>/dev/null)
  
  echo ""
  echo -e "${BLUE}📈 统计信息:${NC}"
  echo -e "  活跃连接数: ${GREEN}${ACTIVE_COUNT}${NC}"
  echo -e "  失败订阅数: ${YELLOW}${FAILED_COUNT}${NC}"
  
  if [ "$ACTIVE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ 有活跃的订阅连接${NC}"
  else
    echo -e "${YELLOW}⚠️  暂无活跃连接（可能正在初始化）${NC}"
  fi
  
  if [ "$FAILED_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  有失败的订阅（将自动重试）${NC}"
    echo "$SUBS_RESPONSE" | jq '.data.failedList' 2>/dev/null
  fi
else
  echo -e "${RED}❌ 无法获取订阅状态${NC}"
fi

echo ""
echo "=================================================="
echo "📊 测试 2: 检查订单簿状态"
echo "=================================================="

# 测试几个主要交易对
TEST_SYMBOLS=("BTCUSDT" "ETHUSDT" "SOLUSDT")

for symbol in "${TEST_SYMBOLS[@]}"; do
  echo ""
  echo -e "${BLUE}测试 ${symbol}...${NC}"
  
  # 获取现货订单簿
  SPOT_RESPONSE=$(curl -s "${API_URL}/orderbook/${symbol}?type=spot")
  
  if echo "$SPOT_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    BIDS=$(echo "$SPOT_RESPONSE" | jq -r '.data.orderBook.bids | length' 2>/dev/null)
    ASKS=$(echo "$SPOT_RESPONSE" | jq -r '.data.orderBook.asks | length' 2>/dev/null)
    LAST_UPDATE=$(echo "$SPOT_RESPONSE" | jq -r '.data.orderBook.lastUpdateId' 2>/dev/null)
    AGE=$(echo "$SPOT_RESPONSE" | jq -r '.data.orderBook.ageSeconds // "N/A"' 2>/dev/null)
    
    echo -e "  Spot: ${GREEN}✅ 正常${NC} | Bids: $BIDS | Asks: $ASKS | UpdateID: $LAST_UPDATE | Age: ${AGE}s"
  else
    ERROR_MSG=$(echo "$SPOT_RESPONSE" | jq -r '.error // "Unknown error"' 2>/dev/null)
    echo -e "  Spot: ${YELLOW}⚠️  ${ERROR_MSG}${NC}"
  fi
  
  # 测试期货（如果可用）
  FUTURES_RESPONSE=$(curl -s "${API_URL}/orderbook/${symbol}?type=futures")
  
  if echo "$FUTURES_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    BIDS=$(echo "$FUTURES_RESPONSE" | jq -r '.data.orderBook.bids | length' 2>/dev/null)
    ASKS=$(echo "$FUTURES_RESPONSE" | jq -r '.data.orderBook.asks | length' 2>/dev/null)
    LAST_UPDATE=$(echo "$FUTURES_RESPONSE" | jq -r '.data.orderBook.lastUpdateId' 2>/dev/null)
    AGE=$(echo "$FUTURES_RESPONSE" | jq -r '.data.orderBook.ageSeconds // "N/A"' 2>/dev/null)
    
    echo -e "  Futures: ${GREEN}✅ 正常${NC} | Bids: $BIDS | Asks: $ASKS | UpdateID: $LAST_UPDATE | Age: ${AGE}s"
  else
    ERROR_MSG=$(echo "$FUTURES_RESPONSE" | jq -r '.error // "Unknown error"' 2>/dev/null)
    echo -e "  Futures: ${YELLOW}⚠️  ${ERROR_MSG}${NC}"
  fi
done

echo ""
echo "=================================================="
echo "📊 测试 3: 监控健康检查机制（30秒）"
echo "=================================================="
echo -e "${BLUE}⏳ 监控30秒，观察健康检查和重试机制...${NC}"
echo ""

# 每5秒检查一次状态
for i in {1..6}; do
  echo -e "${BLUE}[时刻 ${i}/6] $(date '+%H:%M:%S')${NC}"
  
  SUBS_RESPONSE=$(curl -s "${API_URL}/websocket/status")
  ACTIVE_COUNT=$(echo "$SUBS_RESPONSE" | jq -r '.data.activeConnections // 0' 2>/dev/null)
  FAILED_COUNT=$(echo "$SUBS_RESPONSE" | jq -r '.data.failedSubscriptions // 0' 2>/dev/null)
  
  echo "  活跃连接: $ACTIVE_COUNT | 失败订阅: $FAILED_COUNT"
  
  # 如果有失败的订阅，显示详情
  if [ "$FAILED_COUNT" -gt 0 ]; then
    echo "$SUBS_RESPONSE" | jq -r '.data.failedList[] | "    - \(.key): 重试\(.retryCount)次, 原因: \(.reason)"' 2>/dev/null
  fi
  
  if [ $i -lt 6 ]; then
    sleep 5
  fi
done

echo ""
echo "=================================================="
echo "📊 测试 4: 验证数据新鲜度（僵尸数据检测）"
echo "=================================================="

for symbol in "${TEST_SYMBOLS[@]}"; do
  RESPONSE=$(curl -s "${API_URL}/orderbook/${symbol}?type=spot")
  
  if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    AGE=$(echo "$RESPONSE" | jq -r '.data.orderBook.ageSeconds // "N/A"' 2>/dev/null)
    LAST_UPDATE=$(echo "$RESPONSE" | jq -r '.data.orderBook.timestamp' 2>/dev/null)
    
    if [ "$AGE" != "N/A" ] && [ "$AGE" -lt 120 ]; then
      echo -e "${GREEN}✅ ${symbol}: 数据新鲜 (${AGE}秒前)${NC}"
    elif [ "$AGE" != "N/A" ]; then
      echo -e "${RED}❌ ${symbol}: 数据过期 (${AGE}秒前) - 应该被健康检查修复${NC}"
    else
      echo -e "${YELLOW}⚠️  ${symbol}: 无法获取数据年龄${NC}"
    fi
  else
    echo -e "${YELLOW}⚠️  ${symbol}: 订单簿不可用${NC}"
  fi
done

echo ""
echo "=================================================="
echo "📊 最终统计"
echo "=================================================="

FINAL_RESPONSE=$(curl -s "${API_URL}/websocket/status")
echo "$FINAL_RESPONSE" | jq '.data | {
  activeConnections,
  failedSubscriptions,
  recentConnectionAttempts,
  connectionLimit,
  resyncsInProgress,
  usagePercent
}' 2>/dev/null || echo "$FINAL_RESPONSE"

echo ""
echo "=================================================="
echo "✅ 测试完成"
echo "=================================================="
echo ""
echo "提示:"
echo "  - 查看后端日志: tail -f backend/logs/app.log (如果有)"
echo "  - 或者查看 Docker 日志: docker logs -f binance-backend"
echo "  - 健康检查每15秒运行一次"
echo "  - 失败订阅会自动重试（最少间隔5秒）"
echo "  - 断流检测：超过60秒无更新会自动重新订阅"
echo "  - 僵尸数据防护：超过120秒的数据不会保存到Redis"
echo ""

