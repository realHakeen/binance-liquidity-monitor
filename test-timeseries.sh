#!/bin/bash

# 时间序列数据功能测试脚本
# 用于验证新实现的历史数据存储和查询功能

BASE_URL="http://localhost:3001/api"
SYMBOL="BTCUSDT"
TYPE="spot"

echo "=================================================="
echo "🧪 时间序列数据功能测试"
echo "=================================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_api() {
    local name=$1
    local method=$2
    local url=$3
    local data=$4
    
    echo -e "${YELLOW}▶ 测试: $name${NC}"
    echo "  URL: $method $url"
    
    if [ "$method" == "POST" ]; then
        response=$(curl -s -X POST "$url" \
            -H "Content-Type: application/json" \
            -d "$data")
    else
        response=$(curl -s "$url")
    fi
    
    # 检查是否成功
    if echo "$response" | jq -e '.success == true' > /dev/null 2>&1; then
        echo -e "  ${GREEN}✅ 成功${NC}"
        echo "$response" | jq '.' | head -20
    else
        echo -e "  ${RED}❌ 失败${NC}"
        echo "$response" | jq '.'
    fi
    echo ""
}

# 1. 手动触发保存当前数据
echo "=================================================="
echo "1️⃣  手动触发保存时间序列数据"
echo "=================================================="
test_api "立即保存 $SYMBOL 数据" \
    "POST" \
    "$BASE_URL/history/save/$SYMBOL" \
    "{\"type\": \"$TYPE\"}"

# 等待一秒
sleep 1

# 2. 获取统计信息
echo "=================================================="
echo "2️⃣  获取时间序列统计信息"
echo "=================================================="
test_api "查询数据统计" \
    "GET" \
    "$BASE_URL/history/stats/$SYMBOL?type=$TYPE"

# 3. 获取最近数据
echo "=================================================="
echo "3️⃣  获取最近10个核心指标数据点"
echo "=================================================="
test_api "查询最近数据" \
    "GET" \
    "$BASE_URL/history/recent/$SYMBOL?type=$TYPE&count=10&includeAdvanced=false"

# 4. 获取最近数据（包含高级指标）
echo "=================================================="
echo "4️⃣  获取最近5个数据点（包含高级指标）"
echo "=================================================="
test_api "查询最近数据（完整）" \
    "GET" \
    "$BASE_URL/history/recent/$SYMBOL?type=$TYPE&count=5&includeAdvanced=true"

# 5. 获取时间范围数据
echo "=================================================="
echo "5️⃣  获取过去1小时的核心指标数据"
echo "=================================================="
END_TIME=$(date +%s)000
START_TIME=$((END_TIME - 3600000))  # 1小时前
test_api "查询1小时历史数据" \
    "GET" \
    "$BASE_URL/history/core/$SYMBOL?type=$TYPE&startTime=$START_TIME&endTime=$END_TIME&limit=100"

# 6. 查看当前保存频率配置
echo "=================================================="
echo "6️⃣  查看当前配置（通过保存来查看返回的配置）"
echo "=================================================="
echo "核心指标: 默认每60秒保存一次"
echo "高级指标: 默认每300秒（5分钟）保存一次"
echo ""

# 7. 测试配置修改（可选）
echo "=================================================="
echo "7️⃣  测试：调整核心指标保存频率为30秒"
echo "=================================================="
read -p "是否执行此测试？会修改保存频率 (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    test_api "修改保存频率" \
        "POST" \
        "$BASE_URL/history/config" \
        "{\"type\": \"core\", \"intervalMs\": 30000}"
else
    echo "  跳过此测试"
    echo ""
fi

# 8. 检查订单簿订阅状态
echo "=================================================="
echo "8️⃣  检查订单簿订阅状态（确保数据源正常）"
echo "=================================================="
test_api "查询订阅状态" \
    "GET" \
    "$BASE_URL/orderbook/subscriptions"

# 9. 获取实时指标（用于对比）
echo "=================================================="
echo "9️⃣  获取当前实时指标（用于对比历史数据）"
echo "=================================================="
test_api "查询实时指标" \
    "GET" \
    "$BASE_URL/orderbook/$SYMBOL?type=$TYPE&levels=10"

echo "=================================================="
echo "✨ 测试完成！"
echo "=================================================="
echo ""
echo "📊 如何验证功能："
echo "  1. 检查 '立即保存' 测试是否成功"
echo "  2. 查看统计信息中的数据点数量"
echo "  3. 确认最近数据返回了有效值"
echo "  4. 对比实时指标和历史数据的一致性"
echo ""
echo "🔍 如果没有历史数据："
echo "  1. 等待1-5分钟让系统自动收集数据"
echo "  2. 确保Redis服务正在运行"
echo "  3. 确认订单簿已订阅（查看第8步结果）"
echo "  4. 重新运行此脚本"
echo ""
echo "📖 详细文档: 查看 TIMESERIES_API.md"
echo ""

