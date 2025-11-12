const EventEmitter = require('events');

class MessageBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // 允许多个监听器
  }

  /**
   * 发布订单簿更新事件
   */
  publishOrderBookUpdate(symbol, type) {
    this.emit('orderbook:update', { symbol, type, timestamp: Date.now() });
  }

  /**
   * 发布指标更新事件
   */
  publishMetricsUpdate(symbol, type, metrics) {
    this.emit('metrics:update', { symbol, type, metrics, timestamp: Date.now() });
  }

  /**
   * 发布错误事件
   */
  publishError(symbol, type, error) {
    const errorData = { symbol, type, error, timestamp: Date.now() };
    
    // 如果没有监听器，直接记录日志而不是抛出错误
    if (this.listenerCount('error') === 0) {
      console.error(`⚠️ 未处理的错误 ${symbol}:${type}:`, error.message || error);
    } else {
      this.emit('error', errorData);
    }
  }
}

module.exports = new MessageBus();

