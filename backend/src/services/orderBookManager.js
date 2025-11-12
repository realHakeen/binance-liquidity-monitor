const redisService = require('./redisService');

class OrderBookManager {
  constructor() {
    // 内存中的订单簿: { 'BTCUSDT:spot': { bids: [], asks: [], lastUpdateId: 0 } }
    this.orderBooks = new Map();
  }

  /**
   * 初始化订单簿（从REST API获取快照）
   */
  async initializeOrderBook(symbol, type, snapshot) {
    const key = `${symbol}:${type}`;
    
    // 排序：bids降序，asks升序
    const bids = snapshot.bids
      .map(([price, qty]) => [parseFloat(price), parseFloat(qty)])
      .sort((a, b) => b[0] - a[0]); // 降序
    
    const asks = snapshot.asks
      .map(([price, qty]) => [parseFloat(price), parseFloat(qty)])
      .sort((a, b) => a[0] - b[0]); // 升序

    const orderBook = {
      bids,
      asks,
      lastUpdateId: snapshot.lastUpdateId,
      firstUpdateId: snapshot.lastUpdateId, // 用于验证
      timestamp: Date.now()
    };

    this.orderBooks.set(key, orderBook);
    
    // 保存到Redis
    await redisService.saveOrderBookSnapshot(symbol, type, orderBook);
    
    console.log(`✅ 订单簿初始化: ${key} (${bids.length} bids, ${asks.length} asks)`);
    return orderBook;
  }

  /**
   * 应用增量更新（从WebSocket）
   */
  applyUpdate(symbol, type, update) {
    const key = `${symbol}:${type}`;
    const orderBook = this.orderBooks.get(key);
    
    if (!orderBook) {
      console.warn(`⚠️ 订单簿不存在: ${key}，需要先获取快照`);
      return false;
    }

    // 验证更新ID（确保顺序）
    if (update.u <= orderBook.firstUpdateId) {
      // 这个更新已经处理过了
      return false;
    }

    // 更新买单
    if (update.b) {
      this.updateSide(orderBook.bids, update.b, 'bid');
    }

    // 更新卖单
    if (update.a) {
      this.updateSide(orderBook.asks, update.a, 'ask');
    }

    // 更新最后处理ID
    orderBook.lastUpdateId = update.u;
    orderBook.timestamp = Date.now();

    // 限制档位数，防止无限增长（BTCUSDT/ETHUSDT=500档，其他=100档）
    const maxLevels = (symbol === 'BTCUSDT' || symbol === 'ETHUSDT') ? 500 : 100;
    if (orderBook.bids.length > maxLevels) {
      orderBook.bids = orderBook.bids.slice(0, maxLevels);
    }
    if (orderBook.asks.length > maxLevels) {
      orderBook.asks = orderBook.asks.slice(0, maxLevels);
    }

    // 保存到Redis（异步，不阻塞）
    redisService.saveOrderBookUpdate(symbol, type, update).catch(err => {
      console.error(`保存更新到Redis失败: ${err.message}`);
    });

    return true;
  }

  /**
   * 更新单边订单簿
   */
  updateSide(side, updates, sideType) {
    // 获取当前最优价格（用于过滤异常价格）
    const bestPrice = side.length > 0 ? side[0][0] : null;
    
    for (const [priceStr, qtyStr] of updates) {
      const price = parseFloat(priceStr);
      const qty = parseFloat(qtyStr);

      // 跳过无效数据
      if (isNaN(price) || isNaN(qty) || price <= 0) {
        continue;
      }

      // 过滤异常价格：新价格必须在最优价格的 ±2% 范围内
      if (bestPrice && Math.abs(price - bestPrice) / bestPrice > 0.02) {
        continue; // 跳过异常价格
      }

      // 找到价格对应的位置
      const index = side.findIndex(([p]) => Math.abs(p - price) < 1e-10);

      if (qty === 0) {
        // 数量为0，删除该档位
        if (index !== -1) {
          side.splice(index, 1);
        }
      } else {
        if (index !== -1) {
          // 更新现有档位
          side[index][1] = qty;
        } else {
          // 插入新档位
          side.push([price, qty]);
          
          // 重新排序
          if (sideType === 'bid') {
            side.sort((a, b) => b[0] - a[0]); // 降序
          } else {
            side.sort((a, b) => a[0] - b[0]); // 升序
          }
        }
      }
    }
  }

  /**
   * 获取当前订单簿
   */
  getOrderBook(symbol, type) {
    const key = `${symbol}:${type}`;
    return this.orderBooks.get(key) || null;
  }

  /**
   * 从Redis恢复订单簿
   */
  async restoreFromRedis(symbol, type) {
    const snapshot = await redisService.getOrderBookSnapshot(symbol, type);
    if (snapshot) {
      const key = `${symbol}:${type}`;
      this.orderBooks.set(key, snapshot);
      return snapshot;
    }
    return null;
  }

  /**
   * 获取所有活跃的订单簿
   */
  getAllOrderBooks() {
    const result = {};
    for (const [key, orderBook] of this.orderBooks.entries()) {
      result[key] = {
        bids: orderBook.bids.length,
        asks: orderBook.asks.length,
        lastUpdateId: orderBook.lastUpdateId,
        timestamp: orderBook.timestamp
      };
    }
    return result;
  }
}

module.exports = new OrderBookManager();

