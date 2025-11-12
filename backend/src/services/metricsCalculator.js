const liquidityService = require('./liquidityService');
const redisService = require('./redisService');
const orderBookManager = require('./orderBookManager');
const axios = require('axios');

class MetricsCalculator {
  constructor() {
    // 记录上次保存时间（用于控制保存频率）
    this.lastSaveTime = new Map(); // key: "symbol:type", value: timestamp
    
    // 保存频率配置（毫秒）
    this.saveInterval = {
      core: 30000,      // 核心指标：每30秒保存一次
      advanced: 30000   // 高级指标：每30秒保存一次（加快数据积累）
    };
  }

  /**
   * 计算所有指标
   */
  async calculateAllMetrics(symbol, type) {
    const orderBook = orderBookManager.getOrderBook(symbol, type);
    
    if (!orderBook) {
      throw new Error(`订单簿不存在: ${symbol}:${type}`);
    }

    // 基础指标（使用现有服务）
    const baseMetrics = liquidityService.calculateLiquidityMetrics(
      { bids: orderBook.bids, asks: orderBook.asks },
      symbol
    );

    // 扩展指标
    const extendedMetrics = {
      ...baseMetrics,
      
      // 冲击成本（Impact Cost）
      impactCost: this.calculateImpactCost(orderBook, symbol),
      
      // 库存风险（Inventory Risk）
      inventoryRisk: this.calculateInventoryRisk(orderBook),
      
      // 资金费率（从API获取）
      fundingRate: await this.getFundingRate(symbol, type),
      
      // ±0.1% 和 ±1% 档位深度
      depthAtLevels: this.calculateDepthAtLevels(orderBook, symbol)
    };

    // 保存到Redis（最新指标缓存）
    await redisService.saveMetrics(symbol, type, extendedMetrics);

    // 保存时间序列数据（按照频率控制）
    await this.saveTimeSeriesIfNeeded(symbol, type, extendedMetrics);

    return extendedMetrics;
  }

  /**
   * 根据频率控制保存时间序列数据
   */
  async saveTimeSeriesIfNeeded(symbol, type, metrics) {
    const key = `${symbol}:${type}`;
    const now = Date.now();
    const lastSave = this.lastSaveTime.get(key) || { core: 0, advanced: 0 };
    
    try {
      // 检查是否需要保存核心指标
      if (now - lastSave.core >= this.saveInterval.core) {
        await redisService.saveCoreMetricsTimeSeries(symbol, type, metrics);
        lastSave.core = now;
        console.log(`📊 已保存核心指标时间序列: ${key}`);
      }
      
      // 检查是否需要保存高级指标
      if (now - lastSave.advanced >= this.saveInterval.advanced) {
        await redisService.saveAdvancedMetricsTimeSeries(symbol, type, metrics);
        lastSave.advanced = now;
        console.log(`📈 已保存高级指标时间序列: ${key}`);
      }
      
      // 更新最后保存时间
      this.lastSaveTime.set(key, lastSave);
    } catch (error) {
      console.error(`保存时间序列失败 ${key}:`, error.message);
    }
  }

  /**
   * 动态调整保存频率（可选功能）
   * @param {string} type - 'core' 或 'advanced'
   * @param {number} intervalMs - 间隔时间（毫秒）
   */
  setSaveInterval(type, intervalMs) {
    if (type === 'core' || type === 'advanced') {
      this.saveInterval[type] = intervalMs;
      console.log(`⚙️ 已更新 ${type} 指标保存频率: ${intervalMs}ms`);
    }
  }

  /**
   * 立即保存时间序列（手动触发）
   */
  async saveTimeSeriesNow(symbol, type, metrics) {
    try {
      await Promise.all([
        redisService.saveCoreMetricsTimeSeries(symbol, type, metrics),
        redisService.saveAdvancedMetricsTimeSeries(symbol, type, metrics)
      ]);
      
      const key = `${symbol}:${type}`;
      const now = Date.now();
      this.lastSaveTime.set(key, { core: now, advanced: now });
      
      console.log(`✅ 已立即保存时间序列: ${key}`);
      return true;
    } catch (error) {
      console.error(`立即保存时间序列失败 ${symbol}:${type}:`, error.message);
      return false;
    }
  }

  /**
   * 计算冲击成本
   * 冲击成本 = (执行价格 - 中间价) / 中间价
   */
  calculateImpactCost(orderBook, symbol, tradeSize = 100000) {
    const { bids, asks } = orderBook;
    if (!bids.length || !asks.length) return null;

    const midPrice = (bids[0][0] + asks[0][0]) / 2;
    
    // 买入冲击成本
    const buySlippage = liquidityService.calculateSlippage(asks, tradeSize);
    const buyImpact = buySlippage / 100; // 转换为小数

    // 卖出冲击成本
    const sellSlippage = liquidityService.calculateSlippage(bids, tradeSize);
    const sellImpact = sellSlippage / 100;

    return {
      buy: buyImpact,
      sell: sellImpact,
      average: (buyImpact + Math.abs(sellImpact)) / 2,
      tradeSize
    };
  }

  /**
   * 计算库存风险
   * 库存风险 = 订单簿不平衡度 * 波动率
   */
  calculateInventoryRisk(orderBook) {
    const { bids, asks } = orderBook;
    if (!bids.length || !asks.length) return null;

    const bidDepth = liquidityService.calculateDepth(bids, bids.length);
    const askDepth = liquidityService.calculateDepth(asks, asks.length);
    
    const totalDepth = bidDepth + askDepth;
    if (totalDepth === 0) return null;

    const imbalance = (bidDepth - askDepth) / totalDepth;

    // 简化的风险评分（0-1）
    const riskScore = Math.abs(imbalance);

    return {
      imbalance,
      riskScore,
      bidDepth,
      askDepth,
      totalDepth
    };
  }

  /**
   * 获取资金费率（仅永续合约）
   */
  async getFundingRate(symbol, type) {
    if (type !== 'futures') {
      return null;
    }

    // 先从Redis获取
    const cached = await redisService.getFundingRate(symbol);
    if (cached && Date.now() - cached.timestamp < 300000) { // 5分钟内有效
      return cached.rate;
    }

    // 从API获取
    try {
      const response = await axios.get(`https://fapi.binance.com/fapi/v1/premiumIndex`, {
        params: { symbol },
        timeout: 5000
      });
      
      const data = response.data;
      const rate = parseFloat(data.lastFundingRate);
      
      const fundingRate = {
        rate,
        nextFundingTime: data.nextFundingTime,
        timestamp: Date.now()
      };
      
      await redisService.saveFundingRate(symbol, fundingRate);
      
      return fundingRate;
    } catch (error) {
      console.error(`获取资金费率失败 ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * 计算特定档位的深度
   */
  calculateDepthAtLevels(orderBook, symbol) {
    const { bids, asks } = orderBook;
    if (!bids.length || !asks.length) return null;

    const midPrice = (bids[0][0] + asks[0][0]) / 2;
    const isHighLiquidity = symbol === 'BTCUSDT' || symbol === 'ETHUSDT';
    
    // 根据交易对类型选择档位
    const levels = isHighLiquidity 
      ? [0.001, 0.01]  // ±0.1%, ±1%
      : [0.001, 0.01]; // ±0.1%, ±1%

    const result = {};

    for (const level of levels) {
      const lowerPrice = midPrice * (1 - level);
      const upperPrice = midPrice * (1 + level);
      
      result[`-${(level * 100).toFixed(1)}%`] = liquidityService.calculateDepthToPrice(bids, lowerPrice, 'bid');
      result[`+${(level * 100).toFixed(1)}%`] = liquidityService.calculateDepthToPrice(asks, upperPrice, 'ask');
    }

    return result;
  }
}

module.exports = new MetricsCalculator();

