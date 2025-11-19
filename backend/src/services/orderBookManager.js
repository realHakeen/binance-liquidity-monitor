const redisService = require('./redisService');

/**
 * OrderBookManager - 管理币安订单簿的增量更新
 * 
 * 核心逻辑遵循币安官方文档：
 * https://binance-docs.github.io/apidocs/spot/en/#how-to-manage-a-local-order-book-correctly
 * 
 * 关键规则：
 * 1. 从REST获取快照，得到lastUpdateId
 * 2. WebSocket更新包含U(firstUpdateId)和u(lastUpdateId)
 * 3. 更新连续性判断：
 *    - 如果 u <= lastUpdateId: 忽略（已处理）
 *    - 如果 U > lastUpdateId + 1: 缺失更新，需要重新同步
 *    - 如果 U <= lastUpdateId + 1 且 u > lastUpdateId: 应用更新
 */
class OrderBookManager {
  constructor() {
    // 内存中的订单簿: { 'BTCUSDT:spot': { bids, asks, lastUpdateId, needsResync, ... } }
    this.orderBooks = new Map();
    
    // 期货连续性失败计数器: { 'BTCUSDT:futures': 2 }
    this.futuresFailureCount = new Map();
  }

  /**
   * 初始化订单簿（从REST API获取快照）
   * @param {string} symbol - 交易对符号
   * @param {string} type - 类型(spot/futures)
   * @param {Object} snapshot - REST快照 { bids, asks, lastUpdateId }
   * @returns {Object} 初始化的订单簿
   */
  async initializeOrderBook(symbol, type, snapshot) {
    const key = `${symbol}:${type}`;
    
    // 排序：bids降序（最高价在前），asks升序（最低价在前）
    const bids = snapshot.bids
      .map(([price, qty]) => [parseFloat(price), parseFloat(qty)])
      .sort((a, b) => b[0] - a[0]); // 降序
    
    const asks = snapshot.asks
      .map(([price, qty]) => [parseFloat(price), parseFloat(qty)])
      .sort((a, b) => a[0] - b[0]); // 升序

    const orderBook = {
      bids,
      asks,
      lastUpdateId: snapshot.lastUpdateId, // 跟踪最新应用的更新ID
      needsResync: false, // 是否需要重新同步
      timestamp: Date.now(),
      // 保留快照ID用于调试（非运行时逻辑使用）
      snapshotUpdateId: snapshot.lastUpdateId,
      hasReceivedUpdate: false // 🆕 标记是否收到过实时更新
    };

    this.orderBooks.set(key, orderBook);
    
    // 保存到Redis（新快照总是保存，不检查年龄）
    await redisService.saveOrderBookSnapshot(symbol, type, orderBook);
    
    console.log(`✅ [OrderBook] 初始化完成: ${key} | lastUpdateId=${snapshot.lastUpdateId} | bids=${bids.length}, asks=${asks.length}`);
    return orderBook;
  }

  /**
   * 应用增量更新（从WebSocket）
   * 
   * 币安WebSocket更新格式：
   * 
   * 现货(Spot):
   * {
   *   U: firstUpdateId,  // 此更新包含的第一个updateId
   *   u: lastUpdateId,   // 此更新包含的最后一个updateId
   *   b: [[price, qty], ...],  // 买单更新
   *   a: [[price, qty], ...]   // 卖单更新
   * }
   * 
   * 期货(Futures):
   * {
   *   U: firstUpdateId,  // 此更新包含的第一个updateId
   *   u: lastUpdateId,   // 此更新包含的最后一个updateId
   *   pu: prevLastUpdateId,  // 上一个流事件的最后updateId
   *   b: [[price, qty], ...],  // 买单更新
   *   a: [[price, qty], ...]   // 卖单更新
   * }
   * 
   * @param {string} symbol - 交易对
   * @param {string} type - 类型(spot/futures)
   * @param {Object} update - WebSocket更新 {U, u, b, a} 或 {U, u, pu, b, a}
   * @returns {boolean} 是否成功应用更新
   */
  applyUpdate(symbol, type, update) {
    const key = `${symbol}:${type}`;
    const orderBook = this.orderBooks.get(key);
    
    // 检查订单簿是否存在
    if (!orderBook) {
      console.error(`❌ [OrderBook] 订单簿不存在: ${key} | 需要先调用 initializeOrderBook`);
      return false;
    }

    // 检查是否已标记为需要重同步
    if (orderBook.needsResync) {
      console.warn(`⚠️ [OrderBook] 已标记需要重同步: ${key} | 忽略此更新`);
      return false;
    }

    const { U: firstUpdateId, u: lastUpdateIdInUpdate, pu: prevLastUpdateId } = update;
    const currentLastUpdateId = orderBook.lastUpdateId;
    
    // 🆕 调试日志：记录验证逻辑
    const isFirstUpdate = !orderBook.hasReceivedUpdate;
    if (isFirstUpdate || type === 'futures') {
      console.log(`🔍 [DEBUG] ${key} 验证更新:`, {
        currentLastUpdateId,
        U: firstUpdateId,
        u: lastUpdateIdInUpdate,
        pu: prevLastUpdateId,
        isFirstUpdate,
        type
      });
    }

    // ============================================
    // 币安官方规则：根据市场类型使用不同的验证逻辑
    // ============================================
    
    if (type === 'futures') {
      // ========== 期货市场验证逻辑（修复版）==========
      // 参考: https://binance-docs.github.io/apidocs/futures/en/#how-to-manage-a-local-order-book-correctly
      
      // 规则1: 更新太旧，直接丢弃（不触发重新同步）
      if (lastUpdateIdInUpdate < currentLastUpdateId) {
        console.log(`⏭️ [Futures] ${key} 更新太旧，丢弃: u=${lastUpdateIdInUpdate} < current=${currentLastUpdateId}`);
        return false;
      }
      
      // 规则2: 区分首次事件和后续事件
      if (!orderBook.hasReceivedUpdate) {
        // ===== 首次事件（快照之后的第一条）=====
        // 完全忽略 pu 字段，只检查 U/u 与快照的覆盖性
        // 官方要求: U <= lastUpdateId+1 且 u >= lastUpdateId+1
        const isCovering = 
          firstUpdateId <= currentLastUpdateId + 1 && 
          lastUpdateIdInUpdate >= currentLastUpdateId + 1;
        
        if (!isCovering) {
          console.warn(
            `⚠️ [Futures] ${key} 首次事件未覆盖快照ID，丢弃本条（不立刻重同步）| ` +
            `快照ID=${currentLastUpdateId}, U=${firstUpdateId}, u=${lastUpdateIdInUpdate}, ` +
            `pu=${prevLastUpdateId || 'undefined'}`
          );
          // 不标记 needsResync，只丢弃这条消息
          return false;
        }
        
        // 覆盖性验证通过，清除失败计数
        this.futuresFailureCount.delete(key);
        console.log(`✅ [Futures] ${key} 首次事件覆盖性验证通过: U=${firstUpdateId} <= ${currentLastUpdateId + 1}, u=${lastUpdateIdInUpdate} >= ${currentLastUpdateId + 1}`);
        
      } else {
        // ===== 后续事件：使用 pu 做连续性校验 =====
        if (prevLastUpdateId !== undefined) {
          if (prevLastUpdateId !== currentLastUpdateId) {
            // pu 不连续，使用软失败计数器
            const failCount = (this.futuresFailureCount.get(key) || 0) + 1;
            this.futuresFailureCount.set(key, failCount);
            
            console.warn(
              `⚠️ [Futures] ${key} pu不连续，丢弃本条 (失败计数: ${failCount}/3) | ` +
              `pu=${prevLastUpdateId}, 期望=${currentLastUpdateId}, U=${firstUpdateId}, u=${lastUpdateIdInUpdate}`
            );
            
            // 连续失败3次才触发重新同步
            if (failCount >= 3) {
              console.error(`❌ [Futures] ${key} 连续失败${failCount}次，触发重新同步`);
              this.markOutOfSync(symbol, type);
              this.futuresFailureCount.delete(key);
            }
            return false;
          }
          
          // pu 连续性验证通过，清除失败计数
          this.futuresFailureCount.delete(key);
          console.log(`✅ [Futures] ${key} pu连续性验证通过: pu=${prevLastUpdateId} == current=${currentLastUpdateId}`);
        }
      }
      
    } else {
      // ========== 现货市场验证逻辑 ==========
      // 参考: https://binance-docs.github.io/apidocs/spot/en/#how-to-manage-a-local-order-book-correctly
      
      // 规则1: 更新太旧，已经处理过
      if (lastUpdateIdInUpdate <= currentLastUpdateId) {
        return false;
      }

      // 规则2: 检测到缺失更新（出现gap）
      // 期望：U应该 <= lastUpdateId + 1（允许有重叠）
      // 如果 U > lastUpdateId + 1，说明中间缺失了更新
      if (firstUpdateId > currentLastUpdateId + 1) {
        console.error(
          `❌ [OrderBook] 现货订单簿更新不连续，检测到gap: ${key} | ` +
          `当前lastUpdateId=${currentLastUpdateId}, ` +
          `收到U=${firstUpdateId}, u=${lastUpdateIdInUpdate} | ` +
          `缺失范围: [${currentLastUpdateId + 1}, ${firstUpdateId - 1}]`
        );
        
        this.markOutOfSync(symbol, type);
        return false;
      }
    }

    // 规则3: 正常情况，应用更新
    // 现货: U <= lastUpdateId + 1 且 u > lastUpdateId
    // 期货: U == lastUpdateId + 1 且 u >= lastUpdateId
    
    // 更新买单
    if (update.b && update.b.length > 0) {
      this.updateSide(orderBook.bids, update.b, 'bid', symbol);
    }

    // 更新卖单
    if (update.a && update.a.length > 0) {
      this.updateSide(orderBook.asks, update.a, 'ask', symbol);
    }

    // 更新lastUpdateId为此次更新的u
    orderBook.lastUpdateId = lastUpdateIdInUpdate;
    orderBook.timestamp = Date.now();
    orderBook.hasReceivedUpdate = true; // 🆕 标记已收到更新

    // 限制档位数，防止无限增长
    // 增加山寨币的档位数，确保能覆盖1%的价格范围
    const maxLevels = (symbol === 'BTCUSDT' || symbol === 'ETHUSDT') ? 500 : 300;
    if (orderBook.bids.length > maxLevels) {
      orderBook.bids = orderBook.bids.slice(0, maxLevels);
    }
    if (orderBook.asks.length > maxLevels) {
      orderBook.asks = orderBook.asks.slice(0, maxLevels);
    }

    // 只在订单簿有效且数据新鲜时保存到Redis（异步，不阻塞）
    // ⭐ 防止僵尸数据：如果订单簿超过120秒未更新，不保存到Redis
    if (!orderBook.needsResync) {
      const ageSeconds = (Date.now() - orderBook.timestamp) / 1000;
      
      if (ageSeconds > 120) {
        console.warn(`⚠️ [OrderBook] 跳过保存僵尸数据: ${key} | 年龄=${ageSeconds.toFixed(0)}秒`);
      } else {
        redisService.saveOrderBookUpdate(symbol, type, update).catch(err => {
          console.error(`⚠️ [OrderBook] 保存更新到Redis失败: ${key} | ${err.message}`);
        });
      }
    }

    return true;
  }

  /**
   * 更新单边订单簿（买单或卖单）
   * 
   * 价格过滤逻辑：
   * - 之前使用±2%过滤太激进，市场快速波动时会导致订单簿冻结
   * - 现改为±50%，仅用于过滤明显异常的价格（如交易所bug或网络损坏）
   * - 注意：此过滤是保守策略，正常市场波动不应触发
   * 
   * @param {Array} side - 订单簿的一侧 [[price, qty], ...]
   * @param {Array} updates - 更新数组 [[price, qty], ...]
   * @param {string} sideType - 'bid' 或 'ask'
   * @param {string} symbol - 交易对名称（用于日志）
   */
  updateSide(side, updates, sideType, symbol) {
    for (const [priceStr, qtyStr] of updates) {
      const price = parseFloat(priceStr);
      const qty = parseFloat(qtyStr);

      // 基本验证：跳过无效数据
      if (isNaN(price) || isNaN(qty) || price <= 0 || qty < 0) {
        continue;
      }

      // 价格合理性检查（保守策略：±50%）
      // 目的：过滤明显错误的价格，但允许正常的市场大幅波动
      // 注意：在处理多个更新时，bestPrice会随着side的变化而更新
      if (side.length > 0) {
        const bestPrice = side[0][0];
        const priceDeviation = Math.abs(price - bestPrice) / bestPrice;
        
        // ±50% 阈值：只过滤极端异常价格
        // 如果市场真的波动50%以上，应触发上层监控并重新同步
        if (priceDeviation > 0.50) {
          console.warn(
            `⚠️ [OrderBook] 价格偏离过大: ${symbol} ${sideType} | ` +
            `bestPrice=${bestPrice}, newPrice=${price}, deviation=${(priceDeviation * 100).toFixed(2)}%`
          );
          // 暂时跳过此更新，避免污染订单簿
          // 如果持续出现，上层应该检测到lastUpdateId不连续并触发重新同步
          continue;
        }
      }

      // 查找价格对应的档位（使用浮点数容差比较）
      const index = side.findIndex(([p]) => Math.abs(p - price) < 1e-10);

      if (qty === 0) {
        // 数量为0：删除该档位
        if (index !== -1) {
          side.splice(index, 1);
        }
        // 如果档位不存在，无需操作
      } else {
        if (index !== -1) {
          // 档位已存在：更新数量
          side[index][1] = qty;
        } else {
          // 新档位：插入并重新排序
          side.push([price, qty]);
          
          // 排序：买单降序，卖单升序
          if (sideType === 'bid') {
            side.sort((a, b) => b[0] - a[0]); // 降序：最高价在前
          } else {
            side.sort((a, b) => a[0] - b[0]); // 升序：最低价在前
          }
        }
      }
    }
  }

  /**
   * 标记订单簿为需要重新同步
   * @param {string} symbol 
   * @param {string} type 
   */
  markOutOfSync(symbol, type) {
    const key = `${symbol}:${type}`;
    const orderBook = this.orderBooks.get(key);
    
    if (orderBook) {
      orderBook.needsResync = true;
      console.error(`🔴 [OrderBook] 标记需要重新同步: ${key} | 请调用 initializeOrderBook 重新获取快照`);
    }
  }

  /**
   * 检查订单簿是否需要重新同步
   * @param {string} symbol 
   * @param {string} type 
   * @returns {boolean}
   */
  needsResync(symbol, type) {
    const key = `${symbol}:${type}`;
    const orderBook = this.orderBooks.get(key);
    return orderBook ? orderBook.needsResync : true; // 不存在也算需要同步
  }

  /**
   * 获取当前订单簿
   * @param {string} symbol 
   * @param {string} type 
   * @returns {Object|null} 订单簿对象或null
   */
  getOrderBook(symbol, type) {
    const key = `${symbol}:${type}`;
    const orderBook = this.orderBooks.get(key);
    
    // 如果订单簿需要重新同步，返回null（让调用方重新初始化）
    if (orderBook && orderBook.needsResync) {
      return null;
    }
    
    // ⭐ 防止僵尸数据：如果订单簿超过120秒未更新，返回null
    // 这会让调用方（如API）知道数据已过期，不应该使用
    if (orderBook) {
      const ageSeconds = (Date.now() - orderBook.timestamp) / 1000;
      if (ageSeconds > 120) {
        console.warn(`⚠️ [OrderBook] 订单簿已过期: ${key} | 年龄=${ageSeconds.toFixed(0)}秒`);
        return null;
      }
    }
    
    return orderBook || null;
  }

  /**
   * 从Redis恢复订单簿
   * 注意：Redis中的快照可能已经过时，需要检查
   * @param {string} symbol 
   * @param {string} type 
   * @returns {Object|null}
   */
  async restoreFromRedis(symbol, type) {
    const snapshot = await redisService.getOrderBookSnapshot(symbol, type);
    if (snapshot) {
      const key = `${symbol}:${type}`;
      
      // 检查快照年龄
      const ageMinutes = (Date.now() - snapshot.timestamp) / 1000 / 60;
      if (ageMinutes > 5) {
        console.warn(
          `⚠️ [OrderBook] Redis快照较旧: ${key} | ` +
          `年龄=${ageMinutes.toFixed(1)}分钟, lastUpdateId=${snapshot.lastUpdateId} | ` +
          `建议重新获取REST快照`
        );
      }
      
      // 确保快照包含必要字段
      if (!snapshot.needsResync) {
        snapshot.needsResync = false;
      }
      
      this.orderBooks.set(key, snapshot);
      console.log(`🔄 [OrderBook] 从Redis恢复: ${key} | lastUpdateId=${snapshot.lastUpdateId}`);
      return snapshot;
    }
    return null;
  }

  /**
   * 获取所有活跃的订单簿状态
   * @returns {Object} 订单簿状态摘要
   */
  getAllOrderBooks() {
    const result = {};
    for (const [key, orderBook] of this.orderBooks.entries()) {
      result[key] = {
        bids: orderBook.bids.length,
        asks: orderBook.asks.length,
        lastUpdateId: orderBook.lastUpdateId,
        needsResync: orderBook.needsResync || false,
        timestamp: orderBook.timestamp,
        ageSeconds: Math.floor((Date.now() - orderBook.timestamp) / 1000)
      };
    }
    return result;
  }

  /**
   * 调试工具：获取订单簿顶部N档
   * @param {string} symbol 
   * @param {string} type 
   * @param {number} levels - 档位数，默认5
   * @returns {Object|null}
   */
  getTopLevels(symbol, type, levels = 5) {
    const orderBook = this.getOrderBook(symbol, type);
    if (!orderBook) return null;

    return {
      symbol,
      type,
      bids: orderBook.bids.slice(0, levels),
      asks: orderBook.asks.slice(0, levels),
      lastUpdateId: orderBook.lastUpdateId,
      needsResync: orderBook.needsResync,
      timestamp: orderBook.timestamp
    };
  }

  /**
   * 清除订单簿（用于完全重新初始化）
   * @param {string} symbol 
   * @param {string} type 
   */
  clearOrderBook(symbol, type) {
    const key = `${symbol}:${type}`;
    this.orderBooks.delete(key);
    this.futuresFailureCount.delete(key); // 清除失败计数器
    console.log(`🗑️ [OrderBook] 已清除: ${key}`);
  }
}

module.exports = new OrderBookManager();

