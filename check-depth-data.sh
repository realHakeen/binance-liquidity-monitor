#!/bin/bash

# 检查深度历史数据状态

echo "================================"
echo "📊 检查深度历史数据"
echo "================================"
echo ""

# 检查订阅状态
echo "1️⃣ 检查订阅状态..."
curl -s http://localhost:3000/api/orderbook/subscriptions | jq '.subscriptions | to_entries[] | {symbol: .key, lastUpdate: (.value.lastUpdate | todate)}'
echo ""

# 检查 BTCUSDT 的统计信息
echo "2️⃣ 检查 BTCUSDT 统计信息..."
curl -s http://localhost:3000/api/history/stats/BTCUSDT?type=spot | jq '.'
echo ""

# 检查最近的数据（不包含高级指标）
echo "3️⃣ 检查核心数据（最近10条）..."
curl -s 'http://localhost:3000/api/history/recent/BTCUSDT?type=spot&count=10&includeAdvanced=false' | jq '.data | {coreDataPoints, sample: .core[0:2]}'
echo ""

# 检查高级指标数据
echo "4️⃣ 检查高级数据（最近10条）..."
curl -s 'http://localhost:3000/api/history/recent/BTCUSDT?type=spot&count=10&includeAdvanced=true' | jq '.data | {advancedDataPoints, sample: .advanced[0:2]}'
echo ""

# 手动触发保存
echo "5️⃣ 手动触发保存当前数据到时间序列..."
curl -X POST -H "Content-Type: application/json" \
  -d '{"type":"spot"}' \
  http://localhost:3000/api/history/save/BTCUSDT | jq '.success, .message'
echo ""

echo "================================"
echo "✅ 检查完成"
echo "================================"
echo ""
echo "💡 提示："
echo "- 如果没有数据，说明系统刚启动，需要等待数据收集"
echo "- 核心指标每30秒保存一次"
echo "- 高级指标每5分钟保存一次"
echo "- 可以多次运行手动保存命令来快速填充数据"
echo ""

