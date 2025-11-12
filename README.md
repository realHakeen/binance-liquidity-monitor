# 💧 Binance 流动性监控系统

一个实时监控Binance交易所流动性的全栈应用，支持现货和永续合约市场深度分析。

## 📋 功能特性

- ✅ **实时监控**: 自动获取前10大交易量的USDT交易对
- 📊 **深度分析**: 
  - BTC/ETH 使用 500档深度（更精确）
  - 其他币种使用 100档深度
- 🔒 **智能限流处理**:
  - 自动检测 429 错误并根据 Retry-After 暂停
  - 检测 418 错误（IP封禁）并立即停止请求
  - 实时权重监控（每分钟6000权重限制）
- 💹 **多维度指标**:
  - 买卖盘深度
  - 价差分析
  - 滑点计算（多规模：100K, 300K, 500K, 1M, 5M）
  - 深度不平衡度
  - 流动性综合评分
  - **冲击成本** (Impact Cost)
  - **库存风险** (Inventory Risk)
  - **资金费率** (Funding Rate，仅永续合约)
  - **±0.1% 和 ±1% 档位深度**
- 🎨 **现代化UI**: 深色主题，响应式设计
- 💾 **缓存机制**: 30秒缓存减少API调用
- 🔄 **实时订单簿管理**:
  - REST API 获取完整订单簿快照
  - WebSocket 增量更新订单簿
  - 本地维护实时订单簿状态
  - Redis 持久化存储
- 📡 **消息总线**: 解耦组件，支持事件驱动架构
- 📈 **时间序列数据存储** (NEW):
  - 长期保存衍生指标（深度、滑点、流动性评分等）
  - 核心指标每60秒保存，高级指标每5分钟保存
  - 支持30天历史数据查询
  - 提供完整的历史数据API接口

## 🏗️ 技术栈

### 后端
- **Node.js** + **Express**
- **Axios** - HTTP客户端
- **WebSocket (ws)** - 实时数据流
- **Redis** - 数据持久化
- **Binance REST API** + **WebSocket API**

### 前端
- **React 18** + **TypeScript**
- **Vite** - 构建工具
- **Axios** - API调用
- **CSS3** - 样式设计

## 📦 安装

### 前置要求
- Node.js >= 16.x
- npm 或 yarn
- Redis >= 6.0 (可选，用于数据持久化)

### 克隆仓库
```bash
git clone <your-repo-url>
cd Binance_liquidity
```

### 安装依赖

#### 后端
```bash
cd backend
npm install
```

#### 前端
```bash
cd frontend
npm install
```

## 🚀 运行

### 方法1: 使用启动脚本（推荐）

在项目根目录运行：

```bash
# macOS/Linux
./start.sh

# Windows
start.bat
```

### 方法2: 手动启动

**启动后端** (终端1)
```bash
cd backend
npm start
# 或开发模式
npm run dev
```

后端将运行在 `http://localhost:3000`

**启动前端** (终端2)
```bash
cd frontend
npm run dev
```

前端将运行在 `http://localhost:5173`

## 🔌 API端点

### 获取流动性数据
```
GET /api/liquidity
```

返回前10大交易对的现货和永续合约流动性数据。

**响应示例**:
```json
{
  "success": true,
  "cached": false,
  "timestamp": 1699999999999,
  "data": [
    {
      "symbol": "BTCUSDT",
      "spot": {
        "bidDepth": 5000000,
        "askDepth": 4800000,
        "totalDepth": 9800000,
        "bestBid": 35000.50,
        "bestAsk": 35001.00,
        "spread": 0.50,
        "spreadPercent": 0.0014,
        "liquidityScore": 95
      },
      "futures": { /* 同上 */ },
      "volume": 150000000,
      "priceChange": 2.5
    }
  ],
  "apiStatus": {
    "isBlocked": false,
    "isPaused": false,
    "usedWeight": 150,
    "canMakeRequest": true
  }
}
```

### 获取特定交易对深度
```
GET /api/depth/:symbol?type=spot|futures
```

### 获取API状态
```
GET /api/status
```

### 重置API状态
```
POST /api/reset
```

### 时间序列数据API (NEW)

#### 获取核心指标历史
```
GET /api/history/core/:symbol?type=spot&startTime=xxx&endTime=xxx&limit=1000
```
获取指定交易对的核心指标历史数据（价差、深度、滑点、流动性评分等）

#### 获取高级指标历史
```
GET /api/history/advanced/:symbol?type=spot&startTime=xxx&endTime=xxx&limit=1000
```
获取高级指标历史数据（详细深度、冲击成本等）

#### 获取最近N个数据点
```
GET /api/history/recent/:symbol?type=spot&count=100&includeAdvanced=true
```
快速获取最近的数据点，适合实时监控

#### 获取时间序列统计
```
GET /api/history/stats/:symbol?type=spot
```
查看数据点数量、时间范围等统计信息

#### 立即保存时间序列
```
POST /api/history/save/:symbol
Body: { "type": "spot" }
```
手动触发保存当前指标到时间序列

#### 配置保存频率
```
POST /api/history/config
Body: { "type": "core|advanced", "intervalMs": 60000 }
```
动态调整时间序列数据保存频率

**详细文档**: 查看 [`TIMESERIES_API.md`](./TIMESERIES_API.md) 了解完整的API说明和使用示例

### 清除缓存
```
POST /api/clear-cache
```

### 订单簿管理

#### 订阅订单簿流
```
POST /api/orderbook/subscribe
Content-Type: application/json

{
  "symbol": "BTCUSDT",
  "type": "spot"  // 或 "futures"
}
```

#### 取消订阅订单簿流
```
POST /api/orderbook/unsubscribe
Content-Type: application/json

{
  "symbol": "BTCUSDT",
  "type": "spot"
}
```

#### 获取实时订单簿和指标
```
GET /api/orderbook/:symbol?type=spot&levels=20
```

返回实时订单簿数据和所有计算的指标（深度、滑点、冲击成本、库存风险、资金费率等）。

**响应示例**:
```json
{
  "success": true,
  "data": {
    "symbol": "BTCUSDT",
    "type": "spot",
    "orderBook": {
      "bids": [[35000.50, 1.5], ...],
      "asks": [[35001.00, 2.0], ...],
      "lastUpdateId": 123456789,
      "timestamp": 1699999999999,
      "age": 2
    },
    "metrics": {
      "bidDepth": 5000000,
      "askDepth": 4800000,
      "spreadPercent": 0.0014,
      "impactCost": {
        "buy": 0.0005,
        "sell": 0.0003,
        "average": 0.0004
      },
      "inventoryRisk": {
        "imbalance": 0.02,
        "riskScore": 0.02
      },
      "fundingRate": null,
      "depthAtLevels": {
        "-0.1%": 2000000,
        "+0.1%": 1800000,
        "-1.0%": 8000000,
        "+1.0%": 7500000
      }
    }
  }
}
```

#### 获取所有活跃订阅
```
GET /api/orderbook/subscriptions
```

#### 获取WebSocket服务状态
```
GET /api/websocket/status
```

返回WebSocket连接状态、配置信息和连接使用率：

```json
{
  "success": true,
  "data": {
    "activeConnections": 5,
    "recentConnectionAttempts": 12,
    "connectionLimit": 50,
    "usagePercent": 24.00,
    "warning": null,
    "config": {
      "updateInterval": "100ms",
      "reconnectDelay": 5000,
      "pingInterval": 30000,
      "maxConnectionsPerMinute": 50
    }
  }
}
```

#### 更新WebSocket配置
```
POST /api/websocket/config
Content-Type: application/json

{
  "updateInterval": "1000ms",  // 可选: "100ms" | "1000ms"
  "reconnectDelay": 10000,     // 毫秒
  "pingInterval": 25000,       // 毫秒
  "maxConnectionsPerMinute": 30
}
```

### WebSocket配置说明

#### 推送频率 (`updateInterval`)
- **100ms**: 每秒10次更新，适合高频交易场景
- **1000ms**: 每秒1次更新，适合一般分析场景，节省带宽

**重要**: Binance的WebSocket推送频率不会导致限流，因为这是服务器推送的频率，不是客户端发送的频率。

#### 其他配置参数
- **reconnectDelay**: 连接断开后的重连延迟（建议5-10秒）
- **pingInterval**: PING心跳间隔（建议20-30秒）
- **maxConnectionsPerMinute**: 每分钟最大连接数（Binance限制每5分钟300次，建议设为30-50）

## ⚠️ 限流策略

### Binance REST API 限制
- **权重限制**: 6000 权重/分钟
- **请求深度权重**:
  - 100档: 5 权重
  - 500档: 10 权重
  - 24小时ticker: 40 权重

### Binance WebSocket 限制
- **连接数限制**: 每个IP每5分钟最多300次连接尝试
- **消息速率限制**: 每秒最多5条消息（PING/PONG/订阅等控制消息）
- **心跳机制**: 服务器每20秒发送PING，客户端需在60秒内响应PONG
- **重要**: 数据推送（订单簿更新）不计入消息速率限制

**本项目的WebSocket保护措施**:
- ✅ 连接数限流：默认每分钟最多50次连接（250次/5分钟，安全余量）
- ✅ 自动PING/PONG：每30秒发送心跳保持连接活跃
- ✅ 智能重连：连接断开后等待5秒再重连，避免频繁重连
- ✅ 实时监控：通过 `/api/websocket/status` 查看连接状态
- ✅ 可配置参数：支持动态调整所有WebSocket配置

**查看详细的WebSocket限制说明**: 请阅读 [WEBSOCKET_LIMITS.md](./WEBSOCKET_LIMITS.md)

### 错误处理

#### 429 错误 - 触发限流
系统会自动：
1. 暂停所有请求
2. 读取 `Retry-After` header
3. 等待指定时间后自动恢复
4. 在前端显示等待倒计时

#### 418 错误 - IP被封禁
系统会：
1. 立即停止所有请求
2. 在前端显示警告
3. 需要手动重置或更换IP
4. 建议联系Binance支持

### 优化措施
- ✅ 30秒缓存机制
- ✅ BTC/ETH优先级处理（500档）
- ✅ 请求间自动延迟（100ms）
- ✅ 实时权重监控
- ✅ 智能重试机制

## 📊 数据指标说明

### 深度 (Depth)
指定档位内的总交易额（USDT计价）。深度越大，流动性越好。

### 价差 (Spread)
最佳买价与卖价之间的差额百分比。价差越小，流动性越好。

### 滑点 (Slippage)
以$10,000买入/卖出时的平均价格偏离百分比。

### 不平衡 (Imbalance)
买盘与卖盘的深度差异：
- 正值：买盘更深（看涨情绪）
- 负值：卖盘更深（看跌情绪）

### 流动性评分 (Score)
综合评分（0-100）：
- **80-100**: 优秀流动性
- **50-79**: 中等流动性
- **0-49**: 较差流动性

计算公式：
- 深度评分：70%权重（100万USDT为满分）
- 价差评分：30%权重（0.05%为满分）

## 🎨 界面预览

- 📊 实时数据表格：现货 vs 永续对比
- 📈 API状态监控：权重使用情况
- ⚡ 自动刷新：可配置间隔（30秒-5分钟）
- 🎯 指标卡片：数据说明和限流提示

## 🛠️ 开发

### 后端开发
```bash
cd backend
npm run dev  # 使用 nodemon 自动重启
```

### 前端开发
```bash
cd frontend
npm run dev  # Vite 热更新
```

### 构建生产版本
```bash
cd frontend
npm run build
```

## 📝 配置

### 后端环境变量
创建 `backend/.env` 文件：
```env
PORT=3000
NODE_ENV=development
MAX_REQUESTS_PER_MINUTE=1200
REQUEST_WEIGHT_LIMIT=6000
REDIS_URL=redis://localhost:6379
```

**注意**: Redis 是可选的。如果不配置 Redis，系统将使用内存存储（数据不会持久化）。

### 前端代理配置
已在 `vite.config.ts` 中配置代理到后端 API。

## 🔧 故障排查

### 问题: 前端无法连接后端
- 检查后端是否在运行（`http://localhost:3000/health`）
- 检查端口是否被占用
- 查看浏览器控制台错误信息

### 问题: 频繁触发 429 错误
- 减少刷新频率（建议60秒以上）
- 检查是否有其他程序在调用 Binance API
- 等待权重重置（每分钟重置）

### 问题: 收到 418 错误
- 说明IP被Binance封禁
- 等待一段时间或更换IP
- 联系Binance支持解封
- 点击"重置"按钮重置系统状态

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## ⚡ 性能优化建议

1. **缓存策略**: 已实现30秒缓存，减少API调用
2. **批量请求**: 使用 Promise.all 并发获取数据
3. **错误恢复**: 自动重试机制
4. **权重管理**: 实时监控，预防限流
5. **订单簿管理**: REST快照 + WebSocket增量更新，减少API调用
6. **Redis持久化**: 订单簿和指标数据持久化，支持快速恢复

## 🔄 订单簿管理架构

### 工作流程

1. **初始化阶段**:
   - 使用 REST API 获取完整订单簿快照
   - 初始化本地订单簿状态
   - 保存快照到 Redis

2. **实时更新阶段**:
   - 通过 WebSocket 接收增量更新
   - 应用更新到本地订单簿
   - 触发指标计算
   - 保存更新和指标到 Redis

3. **指标计算**:
   - 深度分析
   - 滑点计算（多规模）
   - 冲击成本
   - 库存风险
   - 资金费率（永续合约）
   - ±0.1% 和 ±1% 档位深度

### 模块说明

- **OrderBookManager**: 管理本地订单簿状态（快照+增量）
- **WebSocketService**: 处理 WebSocket 连接和消息
- **MetricsCalculator**: 计算所有流动性指标
- **RedisService**: 数据持久化服务
- **MessageBus**: 消息总线，解耦组件通信

## 🔗 相关链接

- [Binance API 文档](https://binance-docs.github.io/apidocs/spot/en/)
- [Binance 限流规则](https://binance-docs.github.io/apidocs/spot/en/#limits)

## 📧 联系方式

如有问题或建议，请通过 Issue 联系。

---

**⚠️ 免责声明**: 本项目仅用于学习和研究目的。使用Binance API时请遵守其服务条款和使用限制。

