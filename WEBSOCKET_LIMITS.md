# Binance WebSocket 限制说明

## 📋 官方限制

### 1. 连接数限制
- **每个IP地址**：5分钟内最多 **300次连接尝试**
- 超过限制将导致IP被临时封禁
- 建议：每分钟不超过50次连接（250次/5分钟，留有安全余量）

### 2. 消息速率限制
- **每秒最多5条消息**，包括：
  - PING 消息
  - PONG 消息
  - 订阅/取消订阅消息
- **注意**：数据推送（订单簿更新）不计入此限制
- 超过限制的连接将被断开
- 重复违规可能导致IP被封禁

### 3. PING/PONG 机制
- 服务器每 **20秒** 发送一次 PING
- 客户端必须在 **60秒内** 回复 PONG
- 未及时回复将导致连接断开
- 我们的实现：主动每30秒发送PING保持连接活跃

## 🔧 本项目的实现

### WebSocket 推送频率
```javascript
updateInterval: '100ms'  // 可选: '100ms' | '1000ms'
```

- **100ms**: 每秒推送10次更新
  - ✅ 高频率，适合实时交易
  - ❌ 消耗更多带宽
  - ✅ Binance官方支持，不会被限制

- **1000ms**: 每秒推送1次更新
  - ✅ 低频率，节省带宽
  - ✅ 适合一般分析场景
  - ✅ 减少服务器负载

**重要**：推送频率是服务器推送到客户端的频率，**不是客户端发送消息的频率**。因此100ms的推送频率不会触发"每秒5条消息"的限制。

### 连接管理
```javascript
maxConnectionsPerMinute: 50  // 每分钟最多50次连接
```

- 实时监控连接尝试次数
- 超过限制会自动拒绝新连接
- 防止因频繁重连导致IP被封

### 重连策略
```javascript
reconnectDelay: 5000  // 5秒后重连
```

- 连接断开后等待5秒再重连
- 避免频繁重连触发限制
- 可配置指数退避策略

### PING保活
```javascript
pingInterval: 30000  // 每30秒发送PING
```

- 主动发送PING保持连接
- 在Binance要求的60秒超时之前发送
- 自动响应服务器的PING消息

## ⚠️ 安全建议

### 1. 控制同时订阅的交易对数量
```javascript
// 不要同时订阅太多交易对
// 建议：同时订阅不超过10-20个交易对
```

### 2. 避免频繁订阅/取消订阅
```javascript
// ❌ 不好的做法
setInterval(() => {
  websocketService.subscribeOrderBook('BTCUSDT', 'spot');
  websocketService.unsubscribeOrderBook('BTCUSDT', 'spot');
}, 1000);

// ✅ 好的做法：长期保持连接
websocketService.subscribeOrderBook('BTCUSDT', 'spot');
```

### 3. 监控连接状态
```javascript
// 定期检查连接状态
const status = websocketService.getStatus();
console.log('活跃连接数:', status.activeConnections);
console.log('最近连接尝试:', status.recentConnectionAttempts);
```

### 4. 错误处理
```javascript
// 捕获连接错误
try {
  await websocketService.subscribeOrderBook('BTCUSDT', 'spot');
} catch (error) {
  if (error.message.includes('连接限流')) {
    // 等待一段时间后再试
    console.error('触发连接限流，请稍后再试');
  }
}
```

## 📊 推荐配置

### 高频交易场景
```javascript
{
  updateInterval: '100ms',      // 高频更新
  maxConnectionsPerMinute: 30,  // 更保守的限制
  reconnectDelay: 10000,        // 较长的重连延迟
  pingInterval: 25000           // 更频繁的保活
}
```

### 一般分析场景
```javascript
{
  updateInterval: '1000ms',     // 低频更新
  maxConnectionsPerMinute: 50,  // 标准限制
  reconnectDelay: 5000,         // 标准重连延迟
  pingInterval: 30000           // 标准保活
}
```

### 多交易对监控场景
```javascript
{
  updateInterval: '100ms',      // 保持实时性
  maxConnectionsPerMinute: 20,  // 严格限制
  reconnectDelay: 15000,        // 更长的重连延迟
  pingInterval: 30000           // 标准保活
}
```

## 🚨 常见错误和解决方案

### 错误1: 连接被频繁断开
**原因**：未实现PING/PONG机制
**解决**：已在代码中实现自动PING/PONG

### 错误2: IP被封禁
**原因**：短时间内连接次数过多
**解决**：
- 增加重连延迟
- 降低 `maxConnectionsPerMinute`
- 避免频繁订阅/取消订阅

### 错误3: 连接超时
**原因**：网络不稳定或服务器限流
**解决**：
- 增加 `connectionTimeout`
- 实现指数退避重连策略
- 检查网络连接

## 📝 监控建议

定期检查以下指标：

```javascript
const status = websocketService.getStatus();

// 1. 活跃连接数
console.log('活跃连接:', status.activeConnections);

// 2. 最近连接尝试
console.log('连接尝试:', status.recentConnectionAttempts, '/', status.connectionLimit);

// 3. 连接使用率
const usage = (status.recentConnectionAttempts / status.connectionLimit * 100).toFixed(2);
console.log('连接使用率:', usage + '%');

if (usage > 80) {
  console.warn('⚠️ 连接使用率过高，接近限制');
}
```

## 🔗 参考资料

- [Binance API 官方文档](https://developers.binance.com/docs/zh-CN/binance-spot-api-docs/web-socket-streams)
- [WebSocket 速率限制](https://developers.binance.com/docs/zh-CN/binance-spot-api-docs/websocket-api/rate-limits)
- [WebSocket 最佳实践](https://academy.binance.com/zh-TC/articles/what-are-binance-websocket-limits)

## 💡 配置修改方法

如需修改配置，编辑文件：
```
backend/src/config/websocket.config.js
```

修改后无需重启，服务会自动使用新配置（需要重新建立连接）。

