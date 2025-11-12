#!/bin/bash

# WebSocket状态监控脚本

BASE_URL="http://localhost:3000/api"

echo "========================================"
echo "   Binance WebSocket 状态监控"
echo "========================================"
echo ""

# 1. 获取WebSocket状态
echo "📊 1. WebSocket 服务状态"
echo "----------------------------------------"
curl -s "${BASE_URL}/websocket/status" | jq '.'
echo ""

# 2. 获取活跃订阅
echo "📡 2. 活跃订阅列表"
echo "----------------------------------------"
curl -s "${BASE_URL}/orderbook/subscriptions" | jq '.'
echo ""

# 3. 获取API状态
echo "🔍 3. Binance API 状态"
echo "----------------------------------------"
curl -s "${BASE_URL}/status" | jq '.'
echo ""

# 4. 显示配置建议
echo "💡 配置建议"
echo "----------------------------------------"
echo "如需修改WebSocket配置，可以使用以下API："
echo ""
echo "# 修改为1秒推送频率（节省带宽）"
echo "curl -X POST ${BASE_URL}/websocket/config \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"updateInterval\": \"1000ms\"}'"
echo ""
echo "# 查看当前配置"
echo "curl -s ${BASE_URL}/websocket/status | jq '.data.config'"
echo ""

echo "========================================"
echo "✅ 状态检查完成"
echo "========================================"

