# 项目结构

```
Binance_liquidity/
├── backend/                         # 后端服务
│   ├── src/
│   │   ├── api/
│   │   │   └── binance.js          # Binance API 调用（含限流处理）
│   │   ├── services/
│   │   │   └── liquidityService.js # 流动性计算服务
│   │   ├── routes/
│   │   │   └── liquidity.js        # API 路由
│   │   └── server.js               # Express 服务器
│   ├── package.json
│   └── .gitignore
│
├── frontend/                        # 前端应用
│   ├── src/
│   │   ├── components/
│   │   │   ├── LiquidityTable.tsx  # 流动性数据表格
│   │   │   └── StatusBar.tsx       # API状态栏
│   │   ├── services/
│   │   │   └── api.ts              # API 调用服务
│   │   ├── App.tsx                 # 主应用组件
│   │   ├── App.css                 # 应用样式
│   │   ├── main.tsx                # 应用入口
│   │   └── index.css               # 全局样式
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── .gitignore
│
├── start.sh                         # 启动脚本（macOS/Linux）
├── start.bat                        # 启动脚本（Windows）
├── package.json                     # 根项目配置
├── README.md                        # 完整文档
├── QUICKSTART.md                    # 快速开始指南
└── .gitignore                       # Git 忽略文件

```

## 核心文件说明

### 后端核心

**binance.js** - Binance API 调用层
- ✅ 智能限流检测（429/418错误）
- ✅ 自动暂停和恢复机制
- ✅ 权重追踪和管理
- ✅ BTC/ETH 500档，其他100档

**liquidityService.js** - 流动性计算
- ✅ 深度计算（买卖盘）
- ✅ 价差分析
- ✅ 滑点估算
- ✅ 流动性评分（0-100）
- ✅ 深度不平衡度

**liquidity.js** - API 路由
- GET /api/liquidity - 获取流动性数据
- GET /api/depth/:symbol - 获取深度数据
- GET /api/status - 获取API状态
- POST /api/reset - 重置API状态
- POST /api/clear-cache - 清除缓存

### 前端核心

**LiquidityTable.tsx** - 数据展示
- 现货 vs 永续对比
- 多维度指标显示
- 颜色编码（评分、涨跌）
- 响应式设计

**StatusBar.tsx** - 状态监控
- API状态实时显示
- 权重使用监控
- 限流倒计时
- 快捷操作按钮

**App.tsx** - 主应用
- 自动刷新机制
- 错误处理
- 配置管理
- 用户交互

## 技术亮点

### 限流保护
1. **429错误处理**
   - 自动读取 Retry-After header
   - 暂停所有请求
   - 倒计时显示
   - 自动恢复

2. **418错误处理**
   - 立即停止所有请求
   - 前端警告提示
   - 手动重置功能

3. **权重管理**
   - 实时追踪使用量
   - 每分钟自动重置
   - 可视化进度条
   - 预警机制

### 数据准确度
- BTC/ETH: 500档深度（权重10）
- 其他币: 100档深度（权重5）
- 请求间100ms延迟
- 30秒缓存机制

### 用户体验
- 深色主题（Binance风格）
- 实时更新
- 自动/手动刷新
- 错误提示
- 加载状态
- 响应式布局

