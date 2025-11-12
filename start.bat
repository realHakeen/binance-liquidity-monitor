@echo off
chcp 65001 >nul
title Binance 流动性监控系统

echo ==================================
echo 💧 Binance 流动性监控系统
echo ==================================
echo.

REM 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: Node.js 未安装
    echo 请访问 https://nodejs.org 安装 Node.js
    pause
    exit /b 1
)

echo ✅ Node.js 已安装
node -v
echo.

REM 安装后端依赖
if not exist "backend\node_modules" (
    echo 📦 安装后端依赖...
    cd backend
    call npm install
    cd ..
    echo.
)

REM 安装前端依赖
if not exist "frontend\node_modules" (
    echo 📦 安装前端依赖...
    cd frontend
    call npm install
    cd ..
    echo.
)

echo 🚀 启动服务...
echo.

REM 启动后端
echo 📡 启动后端服务 (端口 3000)...
cd backend
start "Binance Backend" cmd /k "npm start"
cd ..
timeout /t 3 /nobreak >nul

echo.

REM 启动前端
echo 🎨 启动前端服务 (端口 5173)...
cd frontend
start "Binance Frontend" cmd /k "npm run dev"
cd ..

timeout /t 3 /nobreak >nul

echo.
echo ==================================
echo ✅ 服务启动成功！
echo ==================================
echo.
echo 📡 后端地址: http://localhost:3000
echo 🎨 前端地址: http://localhost:5173
echo.
echo ⚠️  注意事项:
echo    - BTC/ETH 使用 500档深度
echo    - 其他币种使用 100档深度
echo    - 429错误会自动暂停并等待
echo    - 418错误需要手动重置或更换IP
echo.
echo 🛑 关闭相应的命令行窗口即可停止服务
echo ==================================
echo.
pause

