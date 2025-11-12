#!/bin/bash

# 自动订阅Top 10交易对脚本（现货 + 永续合约）

echo "🔄 等待后端启动..."
sleep 5

echo "📡 开始订阅Top 10交易对..."

API_URL="http://localhost:3000/api"

# 订阅Top 10交易对（现货 + 永续合约）
for symbol in ZECUSDT BTCUSDT USDCUSDT ETHUSDT SOLUSDT FILUSDT ICPUSDT NEARUSDT BNBUSDT GIGGLEUSDT; do
  echo "📊 订阅 $symbol spot + futures..."
  
  # 现货
  curl -s -X POST $API_URL/orderbook/subscribe \
    -H 'Content-Type: application/json' \
    -d "{\"symbol\": \"$symbol\", \"type\": \"spot\"}" | jq -r '.message // .error'
  sleep 0.5
  
  # 永续合约
  curl -s -X POST $API_URL/orderbook/subscribe \
    -H 'Content-Type: application/json' \
    -d "{\"symbol\": \"$symbol\", \"type\": \"futures\"}" | jq -r '.message // .error'
  sleep 0.5
done

echo ""
echo "✅ 订阅完成！"
echo ""

# 显示订阅状态
echo "📋 当前活跃订阅:"
curl -s $API_URL/orderbook/subscriptions | jq -r '.data.connections[]'

echo ""
echo "📊 WebSocket状态:"
curl -s $API_URL/websocket/status | jq '.data | {activeConnections, usagePercent, updateInterval: .config.updateInterval}'

echo ""
echo "🎉 全部完成！访问 http://localhost:5173 查看数据"

