# 时间序列数据 API 文档

## 概述

本系统实现了流动性指标的时间序列存储功能，将衍生数据（深度、滑点、流动性评分等）长期保存在Redis中，用于趋势分析和历史回溯。

## 数据分层策略

### 1. 实时层（内存）
- **存储位置**: OrderBookManager 内存
- **内容**: 完整订单簿原始数据（bids/asks数组）
- **用途**: 实时计算和快速响应
- **保留时间**: 仅保留最新数据

### 2. 缓存层（Redis - 5分钟 TTL）
- **Key格式**: `metrics:${type}:${symbol}`
- **内容**: 所有计算后的衍生指标
- **用途**: 快速API响应，避免重复计算
- **保留时间**: 5分钟

### 3. 时间序列层（Redis Sorted Set - 30天）
#### 核心指标 (`ts:core:${type}:${symbol}`)
- **保存频率**: 每60秒
- **内容**:
  - `spreadPercent` - 价差百分比（交易成本）
  - `totalDepth` - 总深度（市场容量）
  - `slippage_100k` - 10万美金滑点
  - `slippage_1m` - 100万美金滑点
  - `liquidityScore` - 流动性评分
  - `imbalance` - 订单簿不平衡度
  - `midPrice` - 中间价

#### 高级指标 (`ts:advanced:${type}:${symbol}`)
- **保存频率**: 每5分钟
- **内容**:
  - `bidDepth` / `askDepth` - 详细深度
  - `impactCost_avg` - 平均冲击成本
  - `depth_1pct_bid/ask` - 1%档位深度
  - `bestBid` / `bestAsk` - 最优价格

## API 接口

### 1. 获取核心指标历史

```http
GET /api/history/core/:symbol?type=spot&startTime=1699500000000&endTime=1699600000000&limit=1000
```

**参数**:
- `symbol` (必需): 交易对，如 `BTCUSDT`
- `type` (可选): `spot` 或 `futures`，默认 `spot`
- `startTime` (可选): 开始时间戳（毫秒）
- `endTime` (可选): 结束时间戳（毫秒）
- `limit` (可选): 返回数据点数量，默认1000

**响应示例**:
```json
{
  "success": true,
  "data": {
    "symbol": "BTCUSDT",
    "type": "spot",
    "dataPoints": 150,
    "metrics": [
      {
        "timestamp": 1699500000000,
        "spreadPercent": 0.01,
        "totalDepth": 2950000,
        "slippage_100k": 0.05,
        "slippage_1m": 0.35,
        "liquidityScore": 85,
        "imbalance": 0.15,
        "midPrice": 43250.5
      }
      // ... more data points
    ],
    "query": {
      "startTime": 1699500000000,
      "endTime": 1699600000000,
      "limit": 1000
    }
  }
}
```

**使用场景**:
- 绘制价差趋势图
- 分析流动性变化
- 监控市场健康度
- 评估最佳交易时机

---

### 2. 获取高级指标历史

```http
GET /api/history/advanced/:symbol?type=spot&startTime=xxx&endTime=xxx&limit=1000
```

**参数**: 同核心指标

**响应示例**:
```json
{
  "success": true,
  "data": {
    "symbol": "BTCUSDT",
    "type": "spot",
    "dataPoints": 30,
    "metrics": [
      {
        "timestamp": 1699500000000,
        "bidDepth": 1500000,
        "askDepth": 1450000,
        "impactCost_avg": 0.115,
        "depth_1pct_bid": 2500000,
        "depth_1pct_ask": 2450000,
        "bestBid": 43250,
        "bestAsk": 43251
      }
      // ... more data points
    ]
  }
}
```

**使用场景**:
- 深度分析
- 大单执行成本评估
- 市场微观结构研究

---

### 3. 获取最近N个数据点

```http
GET /api/history/recent/:symbol?type=spot&count=100&includeAdvanced=true
```

**参数**:
- `symbol` (必需): 交易对
- `type` (可选): `spot` 或 `futures`，默认 `spot`
- `count` (可选): 返回数据点数量，默认100
- `includeAdvanced` (可选): 是否包含高级指标，默认 `false`

**响应示例**:
```json
{
  "success": true,
  "data": {
    "symbol": "BTCUSDT",
    "type": "spot",
    "coreDataPoints": 100,
    "advancedDataPoints": 20,
    "core": [ /* 核心指标数组 */ ],
    "advanced": [ /* 高级指标数组（如果请求） */ ]
  }
}
```

**使用场景**:
- 快速获取近期数据
- 实时监控面板
- 短期趋势分析

---

### 4. 获取时间序列统计信息

```http
GET /api/history/stats/:symbol?type=spot
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "symbol": "BTCUSDT",
    "type": "spot",
    "coreDataPoints": 1440,
    "advancedDataPoints": 288,
    "timeRange": {
      "start": 1699500000000,
      "end": 1699586400000,
      "duration": 86400000,
      "durationHours": "24.00",
      "startDate": "2023-11-09T00:00:00.000Z",
      "endDate": "2023-11-10T00:00:00.000Z"
    }
  }
}
```

**使用场景**:
- 检查数据完整性
- 评估数据可用范围
- 系统监控

---

### 5. 立即保存时间序列（手动触发）

```http
POST /api/history/save/:symbol
Content-Type: application/json

{
  "type": "spot"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "已立即保存 BTCUSDT spot 的时间序列数据",
  "metrics": { /* 完整的指标数据 */ }
}
```

**使用场景**:
- 手动触发重要时刻的数据快照
- 测试和调试
- 数据备份

---

### 6. 配置保存频率

```http
POST /api/history/config
Content-Type: application/json

{
  "type": "core",
  "intervalMs": 60000
}
```

**参数**:
- `type` (必需): `core` 或 `advanced`
- `intervalMs` (必需): 保存间隔（毫秒）

**响应示例**:
```json
{
  "success": true,
  "message": "已更新 core 指标保存频率为 60000ms",
  "config": {
    "core": 60000,
    "advanced": 300000
  }
}
```

**使用场景**:
- 动态调整存储频率
- 根据存储压力优化
- 针对不同交易对使用不同策略

---

## 数据存储优化

### 字段缩写（减少存储空间）

核心指标在Redis中使用缩写存储：
- `t` → timestamp
- `sp` → spreadPercent
- `td` → totalDepth
- `s1` → slippage_100k
- `s2` → slippage_1m
- `ls` → liquidityScore
- `im` → imbalance
- `mp` → midPrice

高级指标缩写：
- `bd` → bidDepth
- `ad` → askDepth
- `ic` → impactCost_avg
- `d1b` → depth_1pct_bid
- `d1a` → depth_1pct_ask
- `bb` → bestBid
- `ba` → bestAsk

### 存储空间估算

假设监控50个币对，30天数据：
- **核心指标**: 每个数据点约200字节
  - 每分钟保存：50 × 1440 × 200 × 30 = ~432 MB
- **高级指标**: 每个数据点约300字节
  - 每5分钟保存：50 × 288 × 300 × 30 = ~130 MB
- **总计**: 约 560 MB（非常合理）

---

## 使用示例

### 1. 获取BTC过去24小时的价差趋势

```bash
# 计算24小时前的时间戳
START_TIME=$(($(date +%s) * 1000 - 86400000))
END_TIME=$(date +%s)000

curl "http://localhost:3001/api/history/core/BTCUSDT?startTime=$START_TIME&endTime=$END_TIME"
```

### 2. 获取最近100个数据点（包含高级指标）

```bash
curl "http://localhost:3001/api/history/recent/BTCUSDT?count=100&includeAdvanced=true"
```

### 3. 查看数据统计

```bash
curl "http://localhost:3001/api/history/stats/BTCUSDT?type=spot"
```

### 4. 手动触发数据保存

```bash
curl -X POST http://localhost:3001/api/history/save/BTCUSDT \
  -H "Content-Type: application/json" \
  -d '{"type": "spot"}'
```

### 5. 调整保存频率为30秒

```bash
curl -X POST http://localhost:3001/api/history/config \
  -H "Content-Type: application/json" \
  -d '{"type": "core", "intervalMs": 30000}'
```

---

## 前端集成示例

### React/TypeScript

```typescript
// 获取历史数据用于图表
async function fetchLiquidityHistory(symbol: string) {
  const endTime = Date.now();
  const startTime = endTime - 24 * 60 * 60 * 1000; // 24小时前
  
  const response = await fetch(
    `http://localhost:3001/api/history/core/${symbol}?` +
    `startTime=${startTime}&endTime=${endTime}&limit=1440`
  );
  
  const result = await response.json();
  
  if (result.success) {
    return result.data.metrics.map(m => ({
      time: new Date(m.timestamp),
      spread: m.spreadPercent,
      depth: m.totalDepth,
      score: m.liquidityScore
    }));
  }
  
  return [];
}

// 使用示例
const history = await fetchLiquidityHistory('BTCUSDT');
// 用 Chart.js 或 Recharts 绘制图表
```

---

## 监控和维护

### 检查Redis存储情况

```bash
redis-cli
> KEYS ts:core:*
> ZCARD ts:core:spot:BTCUSDT
> MEMORY USAGE ts:core:spot:BTCUSDT
```

### 清理过期数据

数据会自动过期（31天），也可手动清理：

```bash
redis-cli
> DEL ts:core:spot:BTCUSDT
> DEL ts:advanced:spot:BTCUSDT
```

---

## 最佳实践

1. **高频币对**（BTC/ETH）：
   - 核心指标：30-60秒
   - 高级指标：3-5分钟

2. **普通币对**：
   - 核心指标：60-120秒
   - 高级指标：5-10分钟

3. **数据查询**：
   - 使用 `limit` 参数控制返回数据量
   - 短期分析用 `/recent` 接口更快
   - 长期分析用时间范围查询

4. **性能优化**：
   - Redis内存充足时可增加存储时长
   - 根据实际需求调整保存频率
   - 定期检查存储空间使用情况

---

## 故障排查

### 问题：返回404错误
- **原因**: 数据尚未开始收集或Redis未连接
- **解决**: 
  1. 检查Redis是否运行
  2. 确认订单簿已订阅
  3. 等待1-5分钟让系统收集数据

### 问题：数据点数量少于预期
- **原因**: 保存频率较低或数据还在累积中
- **解决**: 
  1. 检查保存频率配置
  2. 使用 `/stats` 接口查看数据范围
  3. 如需更多历史数据，降低保存间隔

### 问题：返回空数组
- **原因**: 时间范围没有数据
- **解决**: 
  1. 检查 startTime/endTime 是否合理
  2. 使用 `/stats` 确认可用时间范围
  3. 尝试不指定时间参数获取所有数据

---

## 技术细节

### Redis数据结构

使用 **Sorted Set (ZSET)**:
- **Score**: 时间戳（毫秒）
- **Member**: JSON字符串（压缩后的指标数据）

**优点**:
- 自动按时间排序
- 高效的范围查询
- 支持自动过期清理

### 并发安全

- 使用 `Map` 记录最后保存时间，防止重复保存
- Redis操作为异步非阻塞，不影响主流程
- 保存失败不会影响实时数据

### 扩展性

如需更长期存储，可考虑：
- **InfluxDB**: 专业时序数据库
- **TimescaleDB**: PostgreSQL时序扩展
- **定期归档**: 将Redis数据导出到文件或数据库

