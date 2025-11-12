#!/bin/bash

# 系统诊断脚本 - 检查深度监控所需的所有组件

echo "================================"
echo "🔍 系统诊断"
echo "================================"
echo ""

# 1. 检查 Redis
echo "1️⃣ 检查 Redis..."
if command -v redis-cli &> /dev/null; then
  if redis-cli ping &> /dev/null; then
    echo "  ✅ Redis 正在运行"
    redis-cli INFO server | grep redis_version
  else
    echo "  ❌ Redis 已安装但未运行"
    echo "     请运行: brew services start redis"
  fi
else
  echo "  ❌ Redis 未安装"
  echo "     请运行: brew install redis"
  echo "     或查看: REDIS_SETUP.md"
fi
echo ""

# 2. 检查后端服务
echo "2️⃣ 检查后端服务..."
if curl -s http://localhost:3000/api/status &> /dev/null; then
  echo "  ✅ 后端服务正在运行 (端口 3000)"
else
  echo "  ❌ 后端服务未运行"
  echo "     请在 backend 目录运行: npm start"
fi
echo ""

# 3. 检查前端服务
echo "3️⃣ 检查前端服务..."
if curl -s http://localhost:5173 &> /dev/null; then
  echo "  ✅ 前端服务正在运行 (端口 5173)"
else
  echo "  ❌ 前端服务未运行"
  echo "     请在 frontend 目录运行: npm run dev"
fi
echo ""

# 4. 检查 WebSocket 订阅
echo "4️⃣ 检查 WebSocket 订阅..."
if curl -s http://localhost:3000/api/orderbook/subscriptions &> /dev/null; then
  subscriptions=$(curl -s http://localhost:3000/api/orderbook/subscriptions | grep -o '"count":[0-9]*' | cut -d: -f2)
  if [ "$subscriptions" -gt 0 ]; then
    echo "  ✅ 有 $subscriptions 个活跃订阅"
  else
    echo "  ⚠️ 没有活跃订阅"
    echo "     系统会在启动时自动订阅 Top 10 交易对"
  fi
else
  echo "  ❌ 无法检查订阅（后端未运行）"
fi
echo ""

# 5. 检查历史数据
echo "5️⃣ 检查历史数据..."
if curl -s http://localhost:3000/api/history/stats/BTCUSDT?type=spot &> /dev/null; then
  stats=$(curl -s http://localhost:3000/api/history/stats/BTCUSDT?type=spot)
  if echo "$stats" | grep -q '"success":true'; then
    echo "  ✅ 找到历史数据"
    echo "$stats" | grep -o '"count":[0-9]*' | head -2
  else
    echo "  ❌ 没有历史数据"
    echo "     原因可能是:"
    echo "     - Redis 未运行"
    echo "     - 系统刚启动，还未收集数据"
    echo "     - 运行 ./init-depth-data.sh 手动初始化数据"
  fi
else
  echo "  ❌ 无法检查历史数据（后端未运行）"
fi
echo ""

# 总结
echo "================================"
echo "📋 诊断总结"
echo "================================"
echo ""

if command -v redis-cli &> /dev/null && redis-cli ping &> /dev/null; then
  if curl -s http://localhost:3000/api/status &> /dev/null; then
    echo "✅ 基础设施正常"
    echo ""
    echo "💡 如果深度监控界面仍然没有数据："
    echo "   1. 等待 1-2 分钟让系统自动收集数据"
    echo "   2. 或运行: ./init-depth-data.sh"
    echo "   3. 刷新浏览器页面"
  else
    echo "⚠️ 请启动后端服务"
    echo "   cd backend && npm start"
  fi
else
  echo "❌ 请先安装并启动 Redis"
  echo "   查看详细说明: REDIS_SETUP.md"
  echo ""
  echo "   快速安装:"
  echo "   brew install redis"
  echo "   brew services start redis"
fi
echo ""

