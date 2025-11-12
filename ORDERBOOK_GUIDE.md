# 📖 订单簿管理使用指南

本指南介绍如何使用实时订单簿管理功能。

## 🚀 快速开始

### 1. 安装依赖

确保已安装所有依赖：

```bash
cd backend
npm install
```

### 2. 配置 Redis (可选)

如果不使用 Redis，系统将使用内存存储（数据不会持久化）。

```bash
# 安装 Redis (macOS)
brew install redis

# 启动 Redis
redis-server
```

在 `backend/.env` 中配置：

```env
REDIS_URL=redis://localhost:6379
```

### 3. 启动服务

```bash
cd backend
npm start
```

## 📡 API 使用示例

### 订阅订单簿流

订阅 BTCUSDT 现货订单簿：

```bash
curl -X POST http://localhost:3000/api/orderbook/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "type": "spot"
  }'
```

订阅 ETHUSDT 永续合约订单簿：

```bash
curl -X POST http://localhost:3000/api/orderbook/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "ETHUSDT",
    "type": "futures"
  }'
```

### 获取实时订单簿和指标

```bash
curl http://localhost:3000/api/orderbook/BTCUSDT?type=spot&levels=20
```

响应包含：
- 实时订单簿（bids/asks）
- 所有计算的指标（深度、滑点、冲击成本、库存风险等）

### 查看所有活跃订阅

```bash
curl http://localhost:3000/api/orderbook/subscriptions
```

### 取消订阅

```bash
curl -X POST http://localhost:3000/api/orderbook/unsubscribe \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "type": "spot"
  }'
```

## 📊 指标说明

### 基础指标

- **bidDepth**: 买盘深度（USDT）
- **askDepth**: 卖盘深度（USDT）
- **spreadPercent**: 价差百分比
- **liquidityScore**: 流动性评分（0-100）

### 扩展指标

#### 冲击成本 (Impact Cost)

以指定金额（默认 100K USDT）交易时的价格冲击：

```json
{
  "impactCost": {
    "buy": 0.0005,    // 买入冲击成本
    "sell": 0.0003,   // 卖出冲击成本
    "average": 0.0004, // 平均冲击成本
    "tradeSize": 100000
  }
}
```

#### 库存风险 (Inventory Risk)

订单簿不平衡度和风险评分：

```json
{
  "inventoryRisk": {
    "imbalance": 0.02,      // 不平衡度 (-1 到 1)
    "riskScore": 0.02,       // 风险评分 (0 到 1)
    "bidDepth": 5000000,
    "askDepth": 4800000,
    "totalDepth": 9800000
  }
}
```

#### 资金费率 (Funding Rate)

仅永续合约，当前资金费率：

```json
{
  "fundingRate": {
    "rate": 0.0001,          // 资金费率
    "nextFundingTime": 1699999999999,
    "timestamp": 1699999999999
  }
}
```

#### 档位深度 (Depth at Levels)

特定价格偏离下的深度：

```json
{
  "depthAtLevels": {
    "-0.1%": 2000000,  // 中间价向下 0.1% 的买盘深度
    "+0.1%": 1800000,   // 中间价向上 0.1% 的卖盘深度
    "-1.0%": 8000000,   // 中间价向下 1.0% 的买盘深度
    "+1.0%": 7500000    // 中间价向上 1.0% 的卖盘深度
  }
}
```

## 🔄 工作流程

### 1. 初始化流程

```
用户请求订阅
    ↓
REST API 获取快照
    ↓
初始化本地订单簿
    ↓
保存到 Redis
    ↓
连接 WebSocket
    ↓
开始接收增量更新
```

### 2. 更新流程

```
WebSocket 收到更新
    ↓
验证更新ID
    ↓
应用更新到本地订单簿
    ↓
保存更新到 Redis
    ↓
触发消息总线事件
    ↓
自动计算指标
    ↓
保存指标到 Redis
```

## 🛠️ 开发示例

### Node.js 示例

```javascript
const axios = require('axios');

// 订阅订单簿
async function subscribeOrderBook(symbol, type = 'spot') {
  const response = await axios.post('http://localhost:3000/api/orderbook/subscribe', {
    symbol,
    type
  });
  console.log('订阅成功:', response.data);
}

// 获取实时数据
async function getOrderBook(symbol, type = 'spot') {
  const response = await axios.get(`http://localhost:3000/api/orderbook/${symbol}`, {
    params: { type, levels: 20 }
  });
  return response.data;
}

// 使用示例
(async () => {
  // 订阅 BTCUSDT
  await subscribeOrderBook('BTCUSDT', 'spot');
  
  // 等待几秒让数据更新
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // 获取实时数据
  const data = await getOrderBook('BTCUSDT', 'spot');
  console.log('实时订单簿:', data.data.orderBook);
  console.log('指标:', data.data.metrics);
})();
```

### Python 示例

```python
import requests
import time

BASE_URL = "http://localhost:3000/api"

# 订阅订单簿
def subscribe_orderbook(symbol, type="spot"):
    response = requests.post(
        f"{BASE_URL}/orderbook/subscribe",
        json={"symbol": symbol, "type": type}
    )
    return response.json()

# 获取实时数据
def get_orderbook(symbol, type="spot", levels=20):
    response = requests.get(
        f"{BASE_URL}/orderbook/{symbol}",
        params={"type": type, "levels": levels}
    )
    return response.json()

# 使用示例
if __name__ == "__main__":
    # 订阅 BTCUSDT
    result = subscribe_orderbook("BTCUSDT", "spot")
    print("订阅结果:", result)
    
    # 等待数据更新
    time.sleep(5)
    
    # 获取实时数据
    data = get_orderbook("BTCUSDT", "spot")
    print("订单簿:", data["data"]["orderBook"])
    print("指标:", data["data"]["metrics"])
```

## ⚠️ 注意事项

1. **WebSocket 自动重连**: 如果连接断开，系统会在 5 秒后自动重连
2. **更新ID验证**: 系统会验证更新ID，确保数据顺序正确
3. **Redis 可选**: 如果不使用 Redis，数据只存储在内存中，重启后会丢失
4. **指标计算延迟**: 指标计算有 100ms 延迟，避免过于频繁的计算
5. **资金费率**: 仅永续合约有资金费率，现货返回 null

## 🔍 故障排查

### 问题: 订阅后无法获取数据

- 检查 WebSocket 连接是否成功
- 查看服务器日志确认快照是否获取成功
- 验证交易对名称是否正确（必须大写，如 BTCUSDT）

### 问题: Redis 连接失败

- 检查 Redis 是否运行: `redis-cli ping`
- 验证 REDIS_URL 配置是否正确
- 系统会在 Redis 不可用时使用内存存储

### 问题: 指标计算失败

- 确保订单簿已成功初始化
- 检查订单簿数据是否有效（bids/asks 不为空）
- 查看服务器日志获取详细错误信息

## 📚 相关文档

- [README.md](./README.md) - 项目主文档
- [Binance WebSocket 文档](https://binance-docs.github.io/apidocs/spot/en/#websocket-market-data)
- [Binance REST API 文档](https://binance-docs.github.io/apidocs/spot/en/#market-data-endpoints)

