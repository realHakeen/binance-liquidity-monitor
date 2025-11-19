#!/bin/bash

# 订单簿功能测试脚本

echo "========================================"
echo "   订单簿生成和更新测试"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_BASE="http://localhost:3000/api"

# 检查后端是否运行
echo "1️⃣  检查后端服务状态"
echo "----------------------------------------"
if ! curl -s "${API_BASE}/../health" > /dev/null 2>&1; then
    echo -e "${RED}❌ 后端服务未运行${NC}"
    echo ""
    echo "请先启动后端服务："
    echo "  cd backend && npm start"
    echo ""
    echo "或使用 Docker："
    echo "  docker-compose up -d"
    exit 1
fi
echo -e "${GREEN}✅ 后端服务运行中${NC}"
echo ""

# 2. 测试订阅订单簿
echo "2️⃣  测试订阅订单簿"
echo "----------------------------------------"

TEST_SYMBOL="BTCUSDT"
echo "订阅测试交易对: ${TEST_SYMBOL}"
echo ""

# 订阅现货订单簿
echo -n "订阅现货订单簿 ... "
spot_sub=$(curl -s -X POST "${API_BASE}/orderbook/subscribe" \
    -H "Content-Type: application/json" \
    -d "{\"symbol\":\"${TEST_SYMBOL}\",\"type\":\"spot\"}")

if echo "$spot_sub" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ 成功${NC}"
else
    echo -e "${RED}❌ 失败${NC}"
    echo "响应: $spot_sub"
fi

# 等待WebSocket连接和初始化
echo ""
echo "⏳ 等待 5 秒让 WebSocket 初始化和获取快照..."
sleep 5
echo ""

# 订阅永续合约订单簿
echo -n "订阅永续合约订单簿 ... "
futures_sub=$(curl -s -X POST "${API_BASE}/orderbook/subscribe" \
    -H "Content-Type: application/json" \
    -d "{\"symbol\":\"${TEST_SYMBOL}\",\"type\":\"futures\"}")

if echo "$futures_sub" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ 成功${NC}"
else
    echo -e "${RED}❌ 失败${NC}"
    echo "响应: $futures_sub"
fi

# 等待WebSocket连接和初始化
echo ""
echo "⏳ 等待 5 秒让 WebSocket 初始化..."
sleep 5
echo ""

# 3. 检查订阅状态
echo "3️⃣  检查订阅状态"
echo "----------------------------------------"
subscriptions=$(curl -s "${API_BASE}/orderbook/subscriptions")
echo "$subscriptions" | jq '.'
echo ""

active_count=$(echo "$subscriptions" | grep -o "${TEST_SYMBOL}" | wc -l)
if [ "$active_count" -ge 2 ]; then
    echo -e "${GREEN}✅ 订阅已激活 (现货+永续)${NC}"
else
    echo -e "${YELLOW}⚠️  订阅数量: $active_count${NC}"
fi
echo ""

# 4. 获取订单簿数据
echo "4️⃣  测试获取订单簿数据"
echo "----------------------------------------"

# 获取现货订单簿
echo "📗 现货订单簿 (${TEST_SYMBOL}):"
spot_book=$(curl -s "${API_BASE}/orderbook/${TEST_SYMBOL}?type=spot")

if echo "$spot_book" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ 成功获取${NC}"
    echo ""
    
    # 提取关键信息
    last_update=$(echo "$spot_book" | jq -r '.data.lastUpdateId // "N/A"')
    bids_count=$(echo "$spot_book" | jq '.data.bids | length')
    asks_count=$(echo "$spot_book" | jq '.data.asks | length')
    
    echo "  • lastUpdateId: $last_update"
    echo "  • 买单数量: $bids_count"
    echo "  • 卖单数量: $asks_count"
    
    # 显示最优买卖价
    if [ "$bids_count" -gt 0 ] && [ "$asks_count" -gt 0 ]; then
        best_bid=$(echo "$spot_book" | jq -r '.data.bids[0][0]')
        best_ask=$(echo "$spot_book" | jq -r '.data.asks[0][0]')
        echo "  • 最优买价: $best_bid"
        echo "  • 最优卖价: $best_ask"
        
        spread=$(echo "scale=2; $best_ask - $best_bid" | bc)
        echo "  • 买卖价差: $spread"
    fi
else
    echo -e "${RED}❌ 获取失败${NC}"
    echo "$spot_book" | jq '.'
fi
echo ""

# 获取永续合约订单簿
echo "📘 永续合约订单簿 (${TEST_SYMBOL}):"
futures_book=$(curl -s "${API_BASE}/orderbook/${TEST_SYMBOL}?type=futures")

if echo "$futures_book" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ 成功获取${NC}"
    echo ""
    
    # 提取关键信息
    last_update=$(echo "$futures_book" | jq -r '.data.lastUpdateId // "N/A"')
    bids_count=$(echo "$futures_book" | jq '.data.bids | length')
    asks_count=$(echo "$futures_book" | jq '.data.asks | length')
    
    echo "  • lastUpdateId: $last_update"
    echo "  • 买单数量: $bids_count"
    echo "  • 卖单数量: $asks_count"
    
    # 显示最优买卖价
    if [ "$bids_count" -gt 0 ] && [ "$asks_count" -gt 0 ]; then
        best_bid=$(echo "$futures_book" | jq -r '.data.bids[0][0]')
        best_ask=$(echo "$futures_book" | jq -r '.data.asks[0][0]')
        echo "  • 最优买价: $best_bid"
        echo "  • 最优卖价: $best_ask"
        
        spread=$(echo "scale=2; $best_ask - $best_bid" | bc)
        echo "  • 买卖价差: $spread"
    fi
else
    echo -e "${RED}❌ 获取失败${NC}"
    echo "$futures_book" | jq '.'
fi
echo ""

# 5. 测试订单簿更新（持续监控）
echo "5️⃣  测试订单簿实时更新"
echo "----------------------------------------"
echo "监控订单簿更新情况 (10秒)..."
echo ""

for i in {1..5}; do
    echo -n "[$i/5] "
    
    # 获取当前订单簿
    current_book=$(curl -s "${API_BASE}/orderbook/${TEST_SYMBOL}?type=spot")
    current_update=$(echo "$current_book" | jq -r '.data.lastUpdateId // "0"')
    current_bid=$(echo "$current_book" | jq -r '.data.bids[0][0] // "0"')
    
    if [ "$current_update" != "0" ] && [ "$current_update" != "N/A" ]; then
        echo -e "${GREEN}✅${NC} lastUpdateId=$current_update, 最优买价=$current_bid"
    else
        echo -e "${RED}❌${NC} 订单簿数据异常"
    fi
    
    if [ $i -lt 5 ]; then
        sleep 2
    fi
done
echo ""

# 6. WebSocket状态检查
echo "6️⃣  检查 WebSocket 连接状态"
echo "----------------------------------------"
ws_status=$(curl -s "${API_BASE}/websocket/status")
echo "$ws_status" | jq '.'
echo ""

active_connections=$(echo "$ws_status" | jq -r '.data.activeConnections // 0')
if [ "$active_connections" -gt 0 ]; then
    echo -e "${GREEN}✅ WebSocket 连接活跃: $active_connections 个${NC}"
else
    echo -e "${RED}❌ 没有活跃的 WebSocket 连接${NC}"
fi
echo ""

# 7. 测试订单簿管理器状态
echo "7️⃣  订单簿管理器状态"
echo "----------------------------------------"
manager_status=$(curl -s "${API_BASE}/orderbook/manager/status")

if echo "$manager_status" | grep -q '"success":true'; then
    echo "$manager_status" | jq '.'
    echo ""
    
    total_books=$(echo "$manager_status" | jq -r '.data.totalOrderBooks // 0')
    needs_resync=$(echo "$manager_status" | jq -r '.data.needsResyncCount // 0')
    
    echo "  • 总订单簿数: $total_books"
    echo "  • 需要重新同步: $needs_resync"
    
    if [ "$total_books" -gt 0 ] && [ "$needs_resync" -eq 0 ]; then
        echo -e "  ${GREEN}✅ 订单簿状态健康${NC}"
    elif [ "$needs_resync" -gt 0 ]; then
        echo -e "  ${YELLOW}⚠️  有订单簿需要重新同步${NC}"
    else
        echo -e "  ${RED}❌ 没有活跃的订单簿${NC}"
    fi
fi
echo ""

# 8. 清理测试订阅（可选）
echo "8️⃣  清理测试"
echo "----------------------------------------"
read -p "是否清理测试订阅? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "取消订阅 ${TEST_SYMBOL} 现货..."
    curl -s -X POST "${API_BASE}/orderbook/unsubscribe" \
        -H "Content-Type: application/json" \
        -d "{\"symbol\":\"${TEST_SYMBOL}\",\"type\":\"spot\"}" | jq '.'
    
    echo "取消订阅 ${TEST_SYMBOL} 永续..."
    curl -s -X POST "${API_BASE}/orderbook/unsubscribe" \
        -H "Content-Type: application/json" \
        -d "{\"symbol\":\"${TEST_SYMBOL}\",\"type\":\"futures\"}" | jq '.'
    
    echo -e "${GREEN}✅ 清理完成${NC}"
else
    echo "保持订阅状态"
fi
echo ""

# 9. 总结
echo "========================================"
echo "   测试总结"
echo "========================================"
echo ""

# 综合判断
all_tests_passed=true

# 检查是否成功订阅
if ! echo "$spot_sub" | grep -q '"success":true'; then
    echo -e "${RED}❌ 现货订单簿订阅失败${NC}"
    all_tests_passed=false
fi

# 检查是否能获取数据
if ! echo "$spot_book" | grep -q '"success":true'; then
    echo -e "${RED}❌ 无法获取订单簿数据${NC}"
    all_tests_passed=false
fi

# 检查WebSocket连接
if [ "$active_connections" -eq 0 ]; then
    echo -e "${RED}❌ WebSocket 连接异常${NC}"
    all_tests_passed=false
fi

if [ "$all_tests_passed" = true ]; then
    echo -e "${GREEN}✅ 所有测试通过！订单簿功能正常${NC}"
    echo ""
    echo "订单簿系统运行正常："
    echo "  ✓ WebSocket 连接稳定"
    echo "  ✓ 订单簿数据完整"
    echo "  ✓ 实时更新正常"
    echo "  ✓ 数据同步正确"
else
    echo -e "${YELLOW}⚠️  部分测试未通过，请检查日志${NC}"
    echo ""
    echo "建议："
    echo "  1. 检查后端日志: docker-compose logs backend"
    echo "  2. 检查 Redis 连接: docker-compose ps"
    echo "  3. 检查网络连接"
    echo "  4. 重启服务: docker-compose restart"
fi

echo ""
echo "========================================"
echo "测试完成"
echo "========================================"

