#!/bin/bash

# Binance API 封禁检测脚本

echo "========================================"
echo "   Binance API 封禁状态检测"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. 直接测试 Binance API（不通过本地后端）
echo "📡 1. 直接测试 Binance API 连通性"
echo "----------------------------------------"

# 测试现货 API
echo -n "测试现货 API (api.binance.com) ... "
spot_response=$(curl -s -w "\n%{http_code}" "https://api.binance.com/api/v3/ping" --connect-timeout 5)
spot_code=$(echo "$spot_response" | tail -n1)

if [ "$spot_code" = "200" ]; then
    echo -e "${GREEN}✅ 正常${NC}"
elif [ "$spot_code" = "418" ]; then
    echo -e "${RED}❌ IP被封禁 (418)${NC}"
    echo "⚠️  您的IP已被Binance封禁，请更换IP或等待解封"
elif [ "$spot_code" = "429" ]; then
    echo -e "${YELLOW}⚠️  触发限流 (429)${NC}"
    echo "⚠️  请求过于频繁，请稍后再试"
else
    echo -e "${RED}❌ 连接失败 (HTTP $spot_code)${NC}"
fi
echo ""

# 测试永续合约 API
echo -n "测试永续合约 API (fapi.binance.com) ... "
futures_response=$(curl -s -w "\n%{http_code}" "https://fapi.binance.com/fapi/v1/ping" --connect-timeout 5)
futures_code=$(echo "$futures_response" | tail -n1)

if [ "$futures_code" = "200" ]; then
    echo -e "${GREEN}✅ 正常${NC}"
elif [ "$futures_code" = "418" ]; then
    echo -e "${RED}❌ IP被封禁 (418)${NC}"
    echo "⚠️  您的IP已被Binance封禁，请更换IP或等待解封"
elif [ "$futures_code" = "429" ]; then
    echo -e "${YELLOW}⚠️  触发限流 (429)${NC}"
    echo "⚠️  请求过于频繁，请稍后再试"
else
    echo -e "${RED}❌ 连接失败 (HTTP $futures_code)${NC}"
fi
echo ""

# 测试服务器时间（检查时间同步）
echo -n "测试服务器时间同步 ... "
time_response=$(curl -s "https://api.binance.com/api/v3/time" --connect-timeout 5)
if [ $? -eq 0 ]; then
    server_time=$(echo "$time_response" | grep -o '"serverTime":[0-9]*' | grep -o '[0-9]*')
    local_time=$(date +%s)000
    time_diff=$((server_time - local_time))
    time_diff_abs=${time_diff#-}
    
    if [ "$time_diff_abs" -lt 5000 ]; then
        echo -e "${GREEN}✅ 同步正常${NC} (差异: ${time_diff}ms)"
    else
        echo -e "${YELLOW}⚠️  时间差异较大${NC} (差异: ${time_diff}ms)"
    fi
else
    echo -e "${RED}❌ 无法获取服务器时间${NC}"
fi
echo ""

# 2. 测试实际数据获取（更深入的测试）
echo "📊 2. 测试实际数据获取能力"
echo "----------------------------------------"

# 测试获取深度数据
echo -n "获取 BTCUSDT 深度数据 ... "
depth_response=$(curl -s -w "\n%{http_code}" "https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=5" --connect-timeout 10)
depth_code=$(echo "$depth_response" | tail -n1)
depth_body=$(echo "$depth_response" | sed '$d')

if [ "$depth_code" = "200" ]; then
    echo -e "${GREEN}✅ 成功${NC}"
    bids_count=$(echo "$depth_body" | grep -o '"bids":\[\[' | wc -l)
    asks_count=$(echo "$depth_body" | grep -o '"asks":\[\[' | wc -l)
    if [ "$bids_count" -gt 0 ] && [ "$asks_count" -gt 0 ]; then
        echo "   ✓ 买卖盘数据正常"
    fi
elif [ "$depth_code" = "418" ]; then
    echo -e "${RED}❌ IP被封禁 (418)${NC}"
elif [ "$depth_code" = "429" ]; then
    echo -e "${YELLOW}⚠️  触发限流 (429)${NC}"
else
    echo -e "${RED}❌ 失败 (HTTP $depth_code)${NC}"
fi
echo ""

# 测试获取24小时数据
echo -n "获取 24小时交易数据 ... "
ticker_response=$(curl -s -w "\n%{http_code}" "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT" --connect-timeout 10)
ticker_code=$(echo "$ticker_response" | tail -n1)

if [ "$ticker_code" = "200" ]; then
    echo -e "${GREEN}✅ 成功${NC}"
elif [ "$ticker_code" = "418" ]; then
    echo -e "${RED}❌ IP被封禁 (418)${NC}"
elif [ "$ticker_code" = "429" ]; then
    echo -e "${YELLOW}⚠️  触发限流 (429)${NC}"
else
    echo -e "${RED}❌ 失败 (HTTP $ticker_code)${NC}"
fi
echo ""

# 3. 检查本地后端状态（如果运行中）
echo "🖥️  3. 检查本地后端状态"
echo "----------------------------------------"

backend_running=$(curl -s "http://localhost:3000/health" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 后端服务运行中${NC}"
    echo ""
    
    # 获取后端记录的API状态
    echo "后端记录的 Binance API 状态："
    status_response=$(curl -s "http://localhost:3000/api/status" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        # 解析状态
        is_blocked=$(echo "$status_response" | grep -o '"isBlocked":[a-z]*' | grep -o '[a-z]*$')
        is_paused=$(echo "$status_response" | grep -o '"isPaused":[a-z]*' | grep -o '[a-z]*$')
        used_weight=$(echo "$status_response" | grep -o '"usedWeight":[0-9]*' | grep -o '[0-9]*')
        can_request=$(echo "$status_response" | grep -o '"canMakeRequest":[a-z]*' | grep -o '[a-z]*$')
        
        echo "  - 是否被封禁 (418): ${is_blocked}"
        echo "  - 是否限流中 (429): ${is_paused}"
        echo "  - 使用权重: ${used_weight}/6000"
        echo "  - 可以请求: ${can_request}"
        echo ""
        
        if [ "$is_blocked" = "true" ]; then
            echo -e "${RED}⚠️  后端检测到IP被封禁${NC}"
            echo ""
            echo "解决方案："
            echo "  1. 更换网络IP地址"
            echo "  2. 使用VPN或代理"
            echo "  3. 等待一段时间后自动解封（通常几小时到1天）"
            echo "  4. 联系Binance支持"
        elif [ "$is_paused" = "true" ]; then
            echo -e "${YELLOW}⚠️  后端检测到触发限流${NC}"
            echo ""
            echo "解决方案："
            echo "  1. 等待限流时间结束（通常60秒）"
            echo "  2. 减少请求频率"
            echo "  3. 使用WebSocket代替REST API"
        else
            echo -e "${GREEN}✅ 后端API状态正常${NC}"
        fi
    fi
else
    echo -e "${YELLOW}⚠️  后端服务未运行${NC}"
    echo "如需启动后端："
    echo "  cd backend && npm start"
fi
echo ""

# 4. WebSocket 测试
echo "🔌 4. 测试 WebSocket 连接"
echo "----------------------------------------"
echo "测试 WebSocket 连通性 (stream.binance.com) ..."

# 使用 curl 测试 WebSocket 握手
ws_response=$(curl -s -w "\n%{http_code}" --http1.1 \
    -H "Connection: Upgrade" \
    -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    "https://stream.binance.com:9443/ws/btcusdt@depth" \
    --connect-timeout 5 2>&1)

ws_code=$(echo "$ws_response" | tail -n1)

if echo "$ws_response" | grep -q "101\|Switching Protocols"; then
    echo -e "${GREEN}✅ WebSocket 连接正常${NC}"
elif echo "$ws_response" | grep -q "418"; then
    echo -e "${RED}❌ WebSocket 被封禁 (418)${NC}"
else
    echo -e "${YELLOW}⚠️  WebSocket 状态未知${NC}"
fi
echo ""

# 5. 总结
echo "========================================"
echo "   总结与建议"
echo "========================================"
echo ""

# 综合判断
all_ok=true

if [ "$spot_code" = "418" ] || [ "$futures_code" = "418" ]; then
    echo -e "${RED}❌ 检测到 IP 被封禁 (418 错误)${NC}"
    echo ""
    echo "您的 IP 地址已被 Binance 封禁，这通常是由于："
    echo "  • 短时间内发送过多请求"
    echo "  • 违反 API 使用规则"
    echo "  • 使用了被禁止的 IP 段"
    echo ""
    echo "解决方案："
    echo "  1. 更换 IP 地址（重启路由器/使用VPN）"
    echo "  2. 等待自动解封（通常 2-24 小时）"
    echo "  3. 联系 Binance 技术支持"
    echo "  4. 使用 Binance 提供的官方客户端"
    all_ok=false
elif [ "$spot_code" = "429" ] || [ "$futures_code" = "429" ]; then
    echo -e "${YELLOW}⚠️  触发限流 (429 错误)${NC}"
    echo ""
    echo "您的请求频率过高，建议："
    echo "  1. 等待 60 秒后重试"
    echo "  2. 降低请求频率"
    echo "  3. 优先使用 WebSocket 而不是 REST API"
    echo "  4. 合理设置请求间隔"
    all_ok=false
elif [ "$spot_code" != "200" ] || [ "$futures_code" != "200" ]; then
    echo -e "${RED}❌ API 连接异常${NC}"
    echo ""
    echo "可能的原因："
    echo "  1. 网络连接问题"
    echo "  2. 防火墙拦截"
    echo "  3. Binance 服务暂时不可用"
    echo "  4. DNS 解析问题"
    echo ""
    echo "建议："
    echo "  1. 检查网络连接"
    echo "  2. 尝试使用 VPN"
    echo "  3. 检查防火墙设置"
    echo "  4. 稍后重试"
    all_ok=false
fi

if [ "$all_ok" = true ]; then
    echo -e "${GREEN}✅ Binance API 工作正常${NC}"
    echo ""
    echo "您的网络可以正常访问 Binance API："
    echo "  • 现货 API: 正常"
    echo "  • 永续合约 API: 正常"
    echo "  • 数据获取: 正常"
    echo ""
    echo "可以安全地运行应用程序。"
fi

echo ""
echo "========================================"
echo "检测完成"
echo "========================================"

