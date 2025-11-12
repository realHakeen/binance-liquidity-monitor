#!/bin/bash

# Binance Liquidity Monitor - 启动脚本

echo "=================================="
echo "💧 Binance 流动性监控系统"
echo "=================================="
echo ""

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 错误: Node.js 未安装"
    echo "请访问 https://nodejs.org 安装 Node.js"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"
echo ""

# 安装后端依赖
if [ ! -d "backend/node_modules" ]; then
    echo "📦 安装后端依赖..."
    cd backend
    npm install
    cd ..
    echo ""
fi

# 安装前端依赖
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 安装前端依赖..."
    cd frontend
    npm install
    cd ..
    echo ""
fi

echo "🚀 启动服务..."
echo ""

# 启动后端（后台运行）
echo "📡 启动后端服务 (端口 3000)..."
cd backend
npm start > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 3

# 检查后端是否启动成功
if kill -0 $BACKEND_PID 2>/dev/null; then
    echo "✅ 后端启动成功 (PID: $BACKEND_PID)"
else
    echo "❌ 后端启动失败，请检查 backend.log"
    exit 1
fi

echo ""

# 启动前端
echo "🎨 启动前端服务 (端口 5173)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

# 等待前端启动
sleep 3

echo ""
echo "=================================="
echo "✅ 服务启动成功！"
echo "=================================="
echo ""
echo "📡 后端地址: http://localhost:3000"
echo "🎨 前端地址: http://localhost:5173"
echo ""
echo "⚠️  注意事项:"
echo "   - BTC/ETH 使用 500档深度"
echo "   - 其他币种使用 100档深度"
echo "   - 429错误会自动暂停并等待"
echo "   - 418错误需要手动重置或更换IP"
echo ""
echo "🛑 停止服务: 按 Ctrl+C"
echo "=================================="
echo ""

# 保存 PID 到文件
echo $BACKEND_PID > .backend.pid
echo $FRONTEND_PID > .frontend.pid

# 捕获退出信号
trap cleanup EXIT INT TERM

cleanup() {
    echo ""
    echo "🛑 正在停止服务..."
    
    if [ -f .backend.pid ]; then
        BACKEND_PID=$(cat .backend.pid)
        if kill -0 $BACKEND_PID 2>/dev/null; then
            kill $BACKEND_PID
            echo "✅ 后端已停止"
        fi
        rm .backend.pid
    fi
    
    if [ -f .frontend.pid ]; then
        FRONTEND_PID=$(cat .frontend.pid)
        if kill -0 $FRONTEND_PID 2>/dev/null; then
            kill $FRONTEND_PID
            echo "✅ 前端已停止"
        fi
        rm .frontend.pid
    fi
    
    echo "👋 再见！"
    exit 0
}

# 等待用户中断
wait

