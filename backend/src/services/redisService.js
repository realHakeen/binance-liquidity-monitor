const redis = require('redis');

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.client = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              console.warn('⚠️  Redis重连失败，将使用内存存储');
              return false; // 停止重连
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      this.client.on('error', (err) => {
        // 只在连接建立后记录错误
        if (this.isConnected) {
          console.error('Redis错误:', err.message);
        }
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('✅ Redis连接成功');
        this.isConnected = true;
      });

      // 设置连接超时
      const connectPromise = this.client.connect();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Redis连接超时')), 3000);
      });

      await Promise.race([connectPromise, timeoutPromise]);
      return true;
    } catch (error) {
      console.warn('⚠️  Redis连接失败，将使用内存存储（数据不会持久化）');
      console.warn('   提示: 如需使用Redis，请确保Redis服务已启动');
      if (this.client) {
        try {
          await this.client.quit();
        } catch (e) {
          // 忽略关闭错误
        }
        this.client = null;
      }
      this.isConnected = false;
      return false;
    }
  }

  /**
   * 存储订单簿快照
   */
  async saveOrderBookSnapshot(symbol, type, orderBook) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      const key = `orderbook:${type}:${symbol}:snapshot`;
      const data = {
        ...orderBook,
        lastUpdateId: orderBook.lastUpdateId,
        timestamp: Date.now()
      };
      
      await this.client.setEx(key, 3600, JSON.stringify(data)); // 1小时过期
      return true;
    } catch (error) {
      console.error(`保存订单簿快照失败 ${symbol}:${type}:`, error.message);
      return false;
    }
  }

  /**
   * 获取订单簿快照
   */
  async getOrderBookSnapshot(symbol, type) {
    if (!this.isConnected || !this.client) return null;
    
    try {
      const key = `orderbook:${type}:${symbol}:snapshot`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`获取订单簿快照失败 ${symbol}:${type}:`, error.message);
      return null;
    }
  }

  /**
   * 存储增量更新
   */
  async saveOrderBookUpdate(symbol, type, update) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      const key = `orderbook:${type}:${symbol}:updates`;
      await this.client.lPush(key, JSON.stringify(update));
      await this.client.lTrim(key, 0, 999); // 保留最近1000条
      await this.client.expire(key, 3600);
      return true;
    } catch (error) {
      console.error(`保存订单簿更新失败 ${symbol}:${type}:`, error.message);
      return false;
    }
  }

  /**
   * 存储计算后的指标
   */
  async saveMetrics(symbol, type, metrics) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      const key = `metrics:${type}:${symbol}`;
      const data = {
        ...metrics,
        timestamp: Date.now()
      };
      
      await this.client.setEx(key, 300, JSON.stringify(data)); // 5分钟过期
      return true;
    } catch (error) {
      console.error(`保存指标失败 ${symbol}:${type}:`, error.message);
      return false;
    }
  }

  /**
   * 获取指标
   */
  async getMetrics(symbol, type) {
    if (!this.isConnected || !this.client) return null;
    
    try {
      const key = `metrics:${type}:${symbol}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`获取指标失败 ${symbol}:${type}:`, error.message);
      return null;
    }
  }

  /**
   * 存储资金费率
   */
  async saveFundingRate(symbol, rate) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      const key = `funding:${symbol}`;
      await this.client.setEx(key, 3600, JSON.stringify({
        rate,
        timestamp: Date.now()
      }));
      return true;
    } catch (error) {
      console.error(`保存资金费率失败 ${symbol}:`, error.message);
      return false;
    }
  }

  /**
   * 获取资金费率
   */
  async getFundingRate(symbol) {
    if (!this.isConnected || !this.client) return null;
    
    try {
      const key = `funding:${symbol}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`获取资金费率失败 ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * 保存核心指标时间序列
   * 精简的高价值指标，用于趋势分析
   */
  async saveCoreMetricsTimeSeries(symbol, type, metrics) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      const key = `ts:core:${type}:${symbol}`;
      const timestamp = Date.now();
      
      // 提取核心指标（最重要的数据）
      const coreData = {
        t: timestamp,                                    // 时间戳
        sp: metrics.spreadPercent || 0,                 // 价差百分比
        td: metrics.totalDepth || 0,                    // 总深度
        bd: metrics.bidDepth || 0,                      // 买盘深度（添加用于图表）
        ad: metrics.askDepth || 0,                      // 卖盘深度（添加用于图表）
        s1: metrics.slippageAnalysis?.buy?.['100k'] || 0, // 10万滑点
        s2: metrics.slippageAnalysis?.buy?.['1m'] || 0,   // 100万滑点
        ls: metrics.liquidityScore || 0,                // 流动性评分
        im: metrics.imbalance || 0,                     // 不平衡度
        mp: metrics.midPrice || 0,                      // 中间价
        bb: metrics.bestBid || 0,                       // 最优买价（添加用于图表）
        ba: metrics.bestAsk || 0                        // 最优卖价（添加用于图表）
      };
      
      // 使用 Sorted Set 存储，以时间戳为score
      await this.client.zAdd(key, {
        score: timestamp,
        value: JSON.stringify(coreData)
      });
      
      // 只保留最近30天的数据
      const thirtyDaysAgo = timestamp - 30 * 24 * 60 * 60 * 1000;
      await this.client.zRemRangeByScore(key, '-inf', thirtyDaysAgo);
      
      // 设置过期时间（31天，留点余量）
      await this.client.expire(key, 31 * 24 * 60 * 60);
      
      return true;
    } catch (error) {
      console.error(`保存核心指标时间序列失败 ${symbol}:${type}:`, error.message);
      return false;
    }
  }

  /**
   * 保存高级指标时间序列
   * 更详细的指标，用于深度分析
   */
  async saveAdvancedMetricsTimeSeries(symbol, type, metrics) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      const key = `ts:advanced:${type}:${symbol}`;
      const timestamp = Date.now();
      
      // 判断是否为BTC或ETH（与liquidityService保持一致）
      const isHighLiquidityPair = symbol === 'BTCUSDT' || symbol === 'ETHUSDT';
      
      // 选择合适的百分比档位：BTC/ETH用0.1%，其他用1%
      const depthKey = isHighLiquidityPair ? '0.10%' : '1.00%';
      
      // 提取高级指标
      const advancedData = {
        t: timestamp,                                       // 时间戳
        bd: metrics.bidDepth || 0,                         // 买盘深度
        ad: metrics.askDepth || 0,                         // 卖盘深度
        ic: metrics.impactCost?.average || 0,              // 平均冲击成本
        d1b: metrics.depthAnalysis?.bid?.[depthKey] || 0,  // 买盘深度（动态选择）
        d1a: metrics.depthAnalysis?.ask?.[depthKey] || 0,  // 卖盘深度（动态选择）
        bb: metrics.bestBid || 0,                          // 最优买价
        ba: metrics.bestAsk || 0,                          // 最优卖价
        dp: depthKey                                        // 保存使用的深度百分比
      };
      
      await this.client.zAdd(key, {
        score: timestamp,
        value: JSON.stringify(advancedData)
      });
      
      // 只保留最近30天的数据
      const thirtyDaysAgo = timestamp - 30 * 24 * 60 * 60 * 1000;
      await this.client.zRemRangeByScore(key, '-inf', thirtyDaysAgo);
      
      // 设置过期时间（31天）
      await this.client.expire(key, 31 * 24 * 60 * 60);
      
      return true;
    } catch (error) {
      console.error(`保存高级指标时间序列失败 ${symbol}:${type}:`, error.message);
      return false;
    }
  }

  /**
   * 获取核心指标历史数据
   * @param {string} symbol - 交易对
   * @param {string} type - 类型 (spot/futures)
   * @param {number} startTime - 开始时间戳（可选）
   * @param {number} endTime - 结束时间戳（可选）
   * @param {number} limit - 返回数据点数量限制（可选，默认1000）
   */
  async getCoreMetricsHistory(symbol, type, startTime = null, endTime = null, limit = 1000) {
    if (!this.isConnected || !this.client) return null;
    
    try {
      const key = `ts:core:${type}:${symbol}`;
      const start = startTime || '-inf';
      const end = endTime || '+inf';
      
      // 获取时间范围内的数据
      const data = await this.client.zRangeByScore(key, start, end, {
        LIMIT: { offset: 0, count: limit }
      });
      
      if (!data || data.length === 0) return [];
      
      // 解析并还原数据
      return data.map(item => {
        const parsed = JSON.parse(item);
        return {
          timestamp: parsed.t,
          spreadPercent: parsed.sp,
          totalDepth: parsed.td,
          bidDepth: parsed.bd,          // 买盘深度
          askDepth: parsed.ad,          // 卖盘深度
          slippage_100k: parsed.s1,
          slippage_1m: parsed.s2,
          liquidityScore: parsed.ls,
          imbalance: parsed.im,
          midPrice: parsed.mp,
          bestBid: parsed.bb,           // 最优买价
          bestAsk: parsed.ba            // 最优卖价
        };
      });
    } catch (error) {
      console.error(`获取核心指标历史失败 ${symbol}:${type}:`, error.message);
      return null;
    }
  }

  /**
   * 获取高级指标历史数据
   */
  async getAdvancedMetricsHistory(symbol, type, startTime = null, endTime = null, limit = 1000) {
    if (!this.isConnected || !this.client) return null;
    
    try {
      const key = `ts:advanced:${type}:${symbol}`;
      const start = startTime || '-inf';
      const end = endTime || '+inf';
      
      const data = await this.client.zRangeByScore(key, start, end, {
        LIMIT: { offset: 0, count: limit }
      });
      
      if (!data || data.length === 0) return [];
      
      return data.map(item => {
        const parsed = JSON.parse(item);
        return {
          timestamp: parsed.t,
          bidDepth: parsed.bd,
          askDepth: parsed.ad,
          impactCost_avg: parsed.ic,
          depth_1pct_bid: parsed.d1b,
          depth_1pct_ask: parsed.d1a,
          bestBid: parsed.bb,
          bestAsk: parsed.ba,
          depthPercent: parsed.dp || '1.00%'  // 默认1%用于向后兼容
        };
      });
    } catch (error) {
      console.error(`获取高级指标历史失败 ${symbol}:${type}:`, error.message);
      return null;
    }
  }

  /**
   * 获取最近N个数据点
   */
  async getRecentMetrics(symbol, type, count = 100, includeAdvanced = false) {
    if (!this.isConnected || !this.client) return null;
    
    try {
      // 获取核心指标（最近N个）
      const coreKey = `ts:core:${type}:${symbol}`;
      const coreData = await this.client.zRange(coreKey, -count, -1);
      
      if (!coreData || coreData.length === 0) return null;
      
      const result = {
        core: coreData.map(item => {
          const parsed = JSON.parse(item);
          return {
            timestamp: parsed.t,
            spreadPercent: parsed.sp,
            totalDepth: parsed.td,
            slippage_100k: parsed.s1,
            slippage_1m: parsed.s2,
            liquidityScore: parsed.ls,
            imbalance: parsed.im,
            midPrice: parsed.mp
          };
        })
      };
      
      // 如果需要高级指标
      if (includeAdvanced) {
        const advancedKey = `ts:advanced:${type}:${symbol}`;
        const advancedData = await this.client.zRange(advancedKey, -count, -1);
        
        if (advancedData && advancedData.length > 0) {
          result.advanced = advancedData.map(item => {
            const parsed = JSON.parse(item);
            return {
              timestamp: parsed.t,
              bidDepth: parsed.bd,
              askDepth: parsed.ad,
              impactCost_avg: parsed.ic,
              depth_1pct_bid: parsed.d1b,
              depth_1pct_ask: parsed.d1a,
              bestBid: parsed.bb,
              bestAsk: parsed.ba
            };
          });
        }
      }
      
      return result;
    } catch (error) {
      console.error(`获取最近指标失败 ${symbol}:${type}:`, error.message);
      return null;
    }
  }

  /**
   * 获取时间序列统计信息
   */
  async getTimeSeriesStats(symbol, type) {
    if (!this.isConnected || !this.client) return null;
    
    try {
      const coreKey = `ts:core:${type}:${symbol}`;
      const advancedKey = `ts:advanced:${type}:${symbol}`;
      
      const [coreCount, advancedCount] = await Promise.all([
        this.client.zCard(coreKey),
        this.client.zCard(advancedKey)
      ]);
      
      // 获取时间范围
      let timeRange = null;
      if (coreCount > 0) {
        const [oldest, newest] = await Promise.all([
          this.client.zRange(coreKey, 0, 0),
          this.client.zRange(coreKey, -1, -1)
        ]);
        
        if (oldest.length > 0 && newest.length > 0) {
          const oldestData = JSON.parse(oldest[0]);
          const newestData = JSON.parse(newest[0]);
          timeRange = {
            start: oldestData.t,
            end: newestData.t,
            duration: newestData.t - oldestData.t
          };
        }
      }
      
      return {
        symbol,
        type,
        coreDataPoints: coreCount,
        advancedDataPoints: advancedCount,
        timeRange
      };
    } catch (error) {
      console.error(`获取时间序列统计失败 ${symbol}:${type}:`, error.message);
      return null;
    }
  }

  /**
   * 断开连接
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        this.isConnected = false;
        console.log('Redis连接已断开');
      } catch (error) {
        // 忽略关闭时的错误
        this.isConnected = false;
      }
    }
    this.client = null;
  }
}

module.exports = new RedisService();

