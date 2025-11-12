#!/bin/bash

# 快速初始化深度历史数据
# 通过手动触发保存来快速填充历史数据

echo "================================"
echo "🚀 初始化深度历史数据"
echo "================================"
echo ""

# 获取所有订阅的交易对
echo "📋 获取订阅列表..."
SYMBOLS=$(curl -s http://localhost:3000/api/orderbook/subscriptions | jq -r '.subscriptions | keys[]' | cut -d: -f1 | sort -u)

if [ -z "$SYMBOLS" ]; then
  echo "❌ 没有找到订阅的交易对"
  echo "💡 请先确保系统已启动并订阅了交易对"
  exit 1
fi

echo "✅ 找到以下交易对："
echo "$SYMBOLS"
echo ""

# 为每个交易对保存数据（每隔5秒保存一次，共保存10次）
echo "💾 开始保存数据（每5秒一次，共10次）..."
echo ""

for i in {1..10}; do
  echo "第 $i/10 次保存..."
  
  for symbol in $SYMBOLS; do
    # 保存现货数据
    result=$(curl -s -X POST -H "Content-Type: application/json" \
      -d '{"type":"spot"}' \
      http://localhost:3000/api/history/save/$symbol)
    
    success=$(echo $result | jq -r '.success')
    
    if [ "$success" = "true" ]; then
      echo "  ✅ $symbol (现货) 保存成功"
    else
      echo "  ❌ $symbol (现货) 保存失败"
    fi
  done
  
  if [ $i -lt 10 ]; then
    echo "  ⏳ 等待5秒..."
    sleep 5
  fi
done

echo ""
echo "================================"
echo "✅ 初始化完成！"
echo "================================"
echo ""
echo "📊 现在可以在前端查看深度变化图表了"
echo ""
echo "💡 验证数据："
echo "  运行: ./check-depth-data.sh"
echo ""

