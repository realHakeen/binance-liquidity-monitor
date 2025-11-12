/**
 * 流动性计算服务
 * 计算各种流动性指标
 */
class LiquidityService {
  /**
   * 计算流动性指标
   */
  calculateLiquidityMetrics(orderBook, symbol) {
    const { bids, asks } = orderBook;
    
    if (!bids || !asks || bids.length === 0 || asks.length === 0) {
      throw new Error('订单簿数据无效');
    }
    
    // 记录档位数（用于监控）
    const levels = Math.min(bids.length, asks.length);
    
    // 计算价差
    const bestBid = parseFloat(bids[0][0]);
    const bestAsk = parseFloat(asks[0][0]);
    const spread = bestAsk - bestBid;
    const spreadPercent = (spread / bestBid) * 100;
    
    // 计算中间价
    const midPrice = (bestBid + bestAsk) / 2;
    
    // 基于价格范围的深度计算（0.1% 偏离）
    // 买盘：bestBid 到 bestBid * 0.999 范围内的所有挂单
    // 卖盘：bestAsk 到 bestAsk * 1.001 范围内的所有挂单
    const bidDepth = this.calculateDepthToPrice(bids, bestBid * 0.999, 'bid');
    const askDepth = this.calculateDepthToPrice(asks, bestAsk * 1.001, 'ask');
    
    // 计算多个规模的滑点
    const slippageAnalysis = this.calculateMultipleSlippages(asks, bids);
    
    // 计算不同价格偏离的深度
    const depthAnalysis = this.calculateDepthAtPriceDeviations(bids, asks, midPrice, symbol);
    
    // 计算流动性评分
    const liquidityScore = this.calculateLiquidityScore(bidDepth, askDepth, spreadPercent);
    
    // 计算深度不平衡度
    const imbalance = (bidDepth - askDepth) / (bidDepth + askDepth);
    
    return {
      bidDepth: Math.round(bidDepth),
      askDepth: Math.round(askDepth),
      totalDepth: Math.round(bidDepth + askDepth),
      bestBid,
      bestAsk,
      spread,
      spreadPercent: parseFloat(spreadPercent.toFixed(4)),
      midPrice,
      
      // 兼容旧字段
      slippage10k: slippageAnalysis.buy['100k'],
      
      // 新增：多规模滑点分析
      slippageAnalysis,
      
      // 新增：价格偏离深度分析
      depthAnalysis,
      
      liquidityScore,
      imbalance: parseFloat(imbalance.toFixed(4)),
      levels, // 使用的档位数
      timestamp: Date.now()
    };
  }

  /**
   * 计算深度总量（以USDT计价）
   */
  calculateDepth(orders, levels) {
    return orders.slice(0, levels).reduce((sum, [price, quantity]) => {
      return sum + parseFloat(price) * parseFloat(quantity);
    }, 0);
  }

  /**
   * 计算滑点 - 以指定金额买入/卖出的平均价格偏离
   */
  calculateSlippage(orders, usdtAmount) {
    let remainingAmount = usdtAmount;
    let totalCost = 0;
    let totalQuantity = 0;
    
    // 确保orders是有效的数组
    if (!orders || orders.length === 0) {
      return 999;
    }
    
    for (const [priceStr, quantityStr] of orders) {
      const price = parseFloat(priceStr);
      const quantity = parseFloat(quantityStr);
      
      // 检查是否有无效数据
      if (isNaN(price) || isNaN(quantity) || price <= 0 || quantity <= 0) {
        continue;
      }
      
      const orderValue = price * quantity;
      
      if (isNaN(orderValue) || orderValue === 0) {
        continue;
      }
      
      if (remainingAmount <= orderValue) {
        // 这一档就能完成
        const neededQuantity = remainingAmount / price;
        totalCost += remainingAmount;
        totalQuantity += neededQuantity;
        remainingAmount = 0;
        break;
      } else {
        // 需要继续下一档
        totalCost += orderValue;
        totalQuantity += quantity;
        remainingAmount -= orderValue;
      }
    }
    
    if (remainingAmount > 0) {
      // 深度不足
      return 999;
    }
    
    const avgPrice = totalCost / totalQuantity;
    const bestPrice = parseFloat(orders[0][0]);
    return ((avgPrice - bestPrice) / bestPrice) * 100;
  }

  /**
   * 计算流动性评分（0-100）
   * 综合考虑深度、价差和滑点
   */
  calculateLiquidityScore(bidDepth, askDepth, spreadPercent) {
    // 深度评分 (70%权重)
    // 超过100万USDT深度得满分
    const totalDepth = bidDepth + askDepth;
    const depthScore = Math.min(totalDepth / 1000000, 1) * 70;
    
    // 价差评分 (30%权重)
    // 价差小于0.05%得满分
    const spreadScore = Math.max(0, (1 - spreadPercent / 0.05)) * 30;
    
    return Math.min(Math.round(depthScore + spreadScore), 100);
  }

  /**
   * 计算多个规模的滑点
   * 规模：100K, 300K, 500K, 1M, 5M
   */
  calculateMultipleSlippages(asks, bids) {
    const amounts = {
      '100k': 100000,
      '300k': 300000,
      '500k': 500000,
      '1m': 1000000,
      '5m': 5000000
    };

    const result = {
      buy: {},   // 买入滑点（从asks获取）
      sell: {}   // 卖出滑点（从bids获取）
    };

    // 计算买入滑点（消耗卖单）
    for (const [key, amount] of Object.entries(amounts)) {
      result.buy[key] = this.calculateSlippage(asks, amount);
    }

    // 计算卖出滑点（消耗买单）
    for (const [key, amount] of Object.entries(amounts)) {
      result.sell[key] = this.calculateSlippage(bids, amount);
    }

    return result;
  }

  /**
   * 计算不同价格偏离下的深度
   * BTC/ETH: ±0.03%, ±0.05%, ±0.1%
   * 其他代币: ±0.3%, ±0.5%, ±1%
   */
  calculateDepthAtPriceDeviations(bids, asks, midPrice, symbol) {
    // 判断是否为BTC或ETH
    const isHighLiquidityPair = symbol === 'BTCUSDT' || symbol === 'ETHUSDT';
    // BTC/ETH使用较小的偏离值，其他代币使用较大的偏离值
    const deviations = isHighLiquidityPair 
      ? [0.0003, 0.0005, 0.001]  // 0.03%, 0.05%, 0.1%
      : [0.003, 0.005, 0.01];     // 0.3%, 0.5%, 1%
    
    const result = {
      bid: {},  // 买盘深度（价格向下偏离）
      ask: {}   // 卖盘深度（价格向上偏离）
    };

    for (const deviation of deviations) {
      const key = `${(deviation * 100).toFixed(2)}%`;
      
      // 买盘深度：从中间价向下偏离
      const lowerPrice = midPrice * (1 - deviation);
      result.bid[key] = this.calculateDepthToPrice(bids, lowerPrice, 'bid');
      
      // 卖盘深度：从中间价向上偏离
      const upperPrice = midPrice * (1 + deviation);
      result.ask[key] = this.calculateDepthToPrice(asks, upperPrice, 'ask');
    }

    return result;
  }

  /**
   * 计算到达指定价格的深度（USDT）
   */
  calculateDepthToPrice(orders, targetPrice, side) {
    let totalDepth = 0;

    for (const [priceStr, quantityStr] of orders) {
      const price = parseFloat(priceStr);
      const quantity = parseFloat(quantityStr);

      if (side === 'bid') {
        // 买盘：计算价格 >= targetPrice 的订单
        if (price >= targetPrice) {
          totalDepth += price * quantity;
        } else {
          break; // 已经低于目标价格，停止
        }
      } else {
        // 卖盘：计算价格 <= targetPrice 的订单
        if (price <= targetPrice) {
          totalDepth += price * quantity;
        } else {
          break; // 已经高于目标价格，停止
        }
      }
    }

    return Math.round(totalDepth);
  }

  /**
   * 获取多个交易对的流动性数据
   * 包含错误处理和限流管理
   */
  async getLiquidityForPairs(symbols, binanceAPI) {
    const results = [];
    const errors = [];
    
    for (const item of symbols) {
      const symbol = typeof item === 'string' ? item : item.symbol;
      
      try {
        // 检查API状态
        const status = binanceAPI.getStatus();
        if (!status.canMakeRequest) {
          throw new Error(status.isBlocked ? 'API已被封禁' : '触发限流，暂停中');
        }
        
        // 获取现货深度
        const spotDepth = await binanceAPI.getSpotDepth(symbol);
        const spotMetrics = this.calculateLiquidityMetrics(spotDepth, symbol);
        
        // 添加延迟以避免触发限流（根据权重调整）
        await this.sleep(100);
        
        // 获取永续合约深度
        let futuresMetrics = null;
        try {
          const futuresDepth = await binanceAPI.getFuturesDepth(symbol);
          if (futuresDepth) {
            futuresMetrics = this.calculateLiquidityMetrics(futuresDepth, symbol);
          }
        } catch (futuresError) {
          // 永续合约获取失败不影响整体流程
          console.log(`⚠️ ${symbol} 永续合约数据获取失败`);
        }
        
        // 添加延迟
        await this.sleep(100);
        
        results.push({
          symbol,
          spot: spotMetrics,
          futures: futuresMetrics,
          spotVolume: typeof item === 'object' ? item.spotVolume : null,
          futuresVolume: typeof item === 'object' ? item.futuresVolume : null,
          priceChange: typeof item === 'object' ? item.priceChange : null
        });
        
        console.log(`✅ ${symbol} 流动性数据获取成功`);
        
      } catch (error) {
        console.error(`❌ ${symbol} 处理失败:`, error.message);
        errors.push({
          symbol,
          error: error.message
        });
        
        // 如果是限流或封禁错误，停止继续获取
        if (error.message.includes('限流') || error.message.includes('封禁')) {
          console.error('⛔ 检测到限流/封禁，停止后续请求');
          break;
        }
      }
    }
    
    return {
      success: results,
      errors,
      apiStatus: binanceAPI.getStatus()
    };
  }

  /**
   * 延迟函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 格式化流动性数据为易读格式
   */
  formatLiquidityData(data) {
    return {
      symbol: data.symbol,
      spot: {
        depth: `$${(data.spot.totalDepth / 1000).toFixed(0)}K`,
        spread: `${data.spot.spreadPercent}%`,
        score: data.spot.liquidityScore
      },
      futures: data.futures ? {
        depth: `$${(data.futures.totalDepth / 1000).toFixed(0)}K`,
        spread: `${data.futures.spreadPercent}%`,
        score: data.futures.liquidityScore
      } : null
    };
  }
}

module.exports = new LiquidityService();

