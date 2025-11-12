# 快速开始

## 1. 安装依赖
```bash
# 后端
cd backend && npm install && cd ..

# 前端
cd frontend && npm install && cd ..
```

## 2. 启动服务

### 使用启动脚本（推荐）
```bash
# macOS/Linux
./start.sh

# Windows
start.bat
```

### 手动启动
```bash
# 终端1 - 后端
cd backend && npm start

# 终端2 - 前端  
cd frontend && npm run dev
```

## 3. 访问应用
- 前端: http://localhost:5173
- 后端: http://localhost:3000

## 关键特性

✅ **BTC/ETH**: 500档深度（更精确）
✅ **其他币种**: 100档深度  
✅ **429限流**: 自动暂停并等待
✅ **418封禁**: 立即停止，需手动重置
✅ **缓存**: 30秒内使用缓存数据
✅ **权重监控**: 实时显示API使用情况

## 测试 API

```bash
# 获取流动性数据
curl http://localhost:3000/api/liquidity

# 获取API状态
curl http://localhost:3000/api/status

# 健康检查
curl http://localhost:3000/health
```

## 常见问题

**Q: 出现 429 错误怎么办？**
A: 系统会自动暂停并等待，无需手动操作。

**Q: 出现 418 错误怎么办？**
A: IP被封禁，点击"重置"按钮或更换IP。

**Q: 如何调整刷新频率？**
A: 在前端界面选择自动刷新间隔（建议60秒以上）。

