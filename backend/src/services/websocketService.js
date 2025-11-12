const WebSocket = require('ws');
const orderBookManager = require('./orderBookManager');
const binanceAPI = require('../api/binance');
const messageBus = require('./messageBus');
const wsConfig = require('../config/websocket.config');

class WebSocketService {
  constructor() {
    this.connections = new Map(); // symbol:type -> WebSocket
    this.reconnectTimers = new Map();
    this.pingTimers = new Map(); // PING定时器
    this.connectionAttempts = []; // 连接尝试记录（用于限流检查）
    
    // 使用外部配置
    this.config = { ...wsConfig };
  }

  /**
   * 检查连接限流
   */
  checkConnectionRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // 清理过期的连接记录
    this.connectionAttempts = this.connectionAttempts.filter(time => time > oneMinuteAgo);
    
    // 检查是否超过限制
    if (this.connectionAttempts.length >= this.config.maxConnectionsPerMinute) {
      const oldestAttempt = this.connectionAttempts[0];
      const waitTime = Math.ceil((oldestAttempt + 60000 - now) / 1000);
      throw new Error(`连接限流：每分钟最多${this.config.maxConnectionsPerMinute}次连接，请等待${waitTime}秒`);
    }
    
    // 记录本次连接尝试
    this.connectionAttempts.push(now);
  }

  /**
   * 订阅订单簿深度流
   */
  async subscribeOrderBook(symbol, type = 'spot') {
    const key = `${symbol}:${type}`;
    
    // 检查连接限流
    try {
      this.checkConnectionRateLimit();
    } catch (error) {
      console.warn(`⚠️ ${error.message}`);
      throw error;
    }
    
    // 如果已经连接，先关闭
    if (this.connections.has(key)) {
      this.unsubscribeOrderBook(symbol, type);
    }

    // 1. 先获取REST快照
    console.log(`📡 获取 ${symbol} ${type} 订单簿快照...`);
    let snapshot;
    try {
      if (type === 'futures') {
        snapshot = await binanceAPI.getFuturesDepth(symbol);
      } else {
        snapshot = await binanceAPI.getSpotDepth(symbol);
      }
      
      if (!snapshot) {
        throw new Error('无法获取快照');
      }
    } catch (error) {
      console.error(`❌ 获取快照失败: ${error.message}`);
      messageBus.publishError(symbol, type, error);
      throw error;
    }

    // 2. 初始化本地订单簿
    await orderBookManager.initializeOrderBook(symbol, type, snapshot);

    // 3. 连接WebSocket
    const streamName = type === 'futures' 
      ? `${symbol.toLowerCase()}@depth@${this.config.updateInterval}`
      : `${symbol.toLowerCase()}@depth@${this.config.updateInterval}`;

    const wsUrl = type === 'futures'
      ? `wss://fstream.binance.com/ws/${streamName}`
      : `wss://stream.binance.com:9443/ws/${streamName}`;

    console.log(`🔌 连接WebSocket: ${wsUrl}`);

    // WebSocket选项（忽略SSL证书错误）
    const wsOptions = {
      rejectUnauthorized: false // 忽略自签名证书错误
    };

    const ws = new WebSocket(wsUrl, wsOptions);

    ws.on('open', () => {
      console.log(`✅ WebSocket连接成功: ${key}`);
      
      // 启动PING定时器
      this.startPingTimer(key, ws);
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // 处理PING消息
        if (message.e === 'ping') {
          ws.pong();
          console.log(`🏓 响应PING: ${key}`);
          return;
        }
        
        // 处理订单簿更新
        this.handleOrderBookUpdate(symbol, type, message);
      } catch (error) {
        console.error(`❌ 解析WebSocket消息失败: ${error.message}`);
      }
    });

    ws.on('pong', () => {
      // 收到PONG响应
      console.log(`🏓 收到PONG响应: ${key}`);
    });

    ws.on('error', (error) => {
      console.error(`❌ WebSocket错误 ${key}:`, error.message);
      messageBus.publishError(symbol, type, error);
    });

    ws.on('close', () => {
      console.log(`⚠️ WebSocket断开: ${key}`);
      this.connections.delete(key);
      
      // 清除PING定时器
      this.clearPingTimer(key);
      
      // 清除之前的重连定时器
      const existingTimer = this.reconnectTimers.get(key);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      
      // 自动重连（带退避）
      const reconnectDelay = this.config.reconnectDelay;
      console.log(`⏱️ ${reconnectDelay / 1000}秒后重连...`);
      
      const timer = setTimeout(() => {
        this.subscribeOrderBook(symbol, type).catch(err => {
          console.error(`❌ 重连失败 ${key}:`, err.message);
        });
      }, reconnectDelay);
      
      this.reconnectTimers.set(key, timer);
    });

    this.connections.set(key, ws);
  }

  /**
   * 启动PING定时器
   */
  startPingTimer(key, ws) {
    // 清除旧的定时器
    this.clearPingTimer(key);
    
    // 定期发送PING
    const timer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
        console.log(`🏓 发送PING: ${key}`);
      }
    }, this.config.pingInterval);
    
    this.pingTimers.set(key, timer);
  }

  /**
   * 清除PING定时器
   */
  clearPingTimer(key) {
    const timer = this.pingTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.pingTimers.delete(key);
    }
  }

  /**
   * 处理订单簿更新
   */
  handleOrderBookUpdate(symbol, type, update) {
    // 应用增量更新
    const success = orderBookManager.applyUpdate(symbol, type, update);
    
    if (success) {
      // 触发指标计算（通过消息总线）
      messageBus.publishOrderBookUpdate(symbol, type);
    }
  }

  /**
   * 取消订阅
   */
  unsubscribeOrderBook(symbol, type) {
    const key = `${symbol}:${type}`;
    const ws = this.connections.get(key);
    
    if (ws) {
      ws.close();
      this.connections.delete(key);
      console.log(`🔌 已取消订阅: ${key}`);
    }

    // 清除PING定时器
    this.clearPingTimer(key);

    // 清除重连定时器
    const timer = this.reconnectTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(key);
    }
  }

  /**
   * 获取所有活跃连接
   */
  getActiveConnections() {
    return Array.from(this.connections.keys());
  }

  /**
   * 取消所有订阅
   */
  unsubscribeAll() {
    for (const key of this.connections.keys()) {
      const [symbol, type] = key.split(':');
      this.unsubscribeOrderBook(symbol, type);
    }
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentConnections = this.connectionAttempts.filter(time => time > oneMinuteAgo).length;
    
    return {
      activeConnections: this.connections.size,
      recentConnectionAttempts: recentConnections,
      connectionLimit: this.config.maxConnectionsPerMinute,
      config: this.config
    };
  }

  /**
   * 更新配置（允许动态调整）
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('📝 WebSocket配置已更新:', this.config);
  }
}

module.exports = new WebSocketService();

