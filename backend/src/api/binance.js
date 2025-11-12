const axios = require('axios');
const https = require('https');

const BINANCE_API_BASE = 'https://api.binance.com';
const BINANCE_FUTURES_API_BASE = 'https://fapi.binance.com';

// 创建一个忽略SSL证书验证的agent（仅用于开发环境）
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

/**
 * Binance API 调用类
 * 包含限流处理、错误重试和IP封禁检测
 */
class BinanceAPI {
  constructor() {
    this.isBlocked = false; // IP是否被封禁（418错误）
    this.rateLimitPauseUntil = null; // 429错误暂停到何时
    this.requestQueue = [];
    this.requestWeights = {
      depth100: 5,
      depth500: 10,
      ticker24hr: 40
    };
    this.usedWeight = 0;
    this.weightResetTime = Date.now() + 60000;
  }

  /**
   * 检查是否可以发起请求
   */
  canMakeRequest() {
    if (this.isBlocked) {
      throw new Error('API已被封禁(418错误)，请稍后重试或更换IP');
    }

    if (this.rateLimitPauseUntil && Date.now() < this.rateLimitPauseUntil) {
      const waitSeconds = Math.ceil((this.rateLimitPauseUntil - Date.now()) / 1000);
      throw new Error(`触发限流(429错误)，需等待${waitSeconds}秒`);
    }

    return true;
  }

  /**
   * 处理限流错误
   */
  handleRateLimitError(error, retryAfter) {
    if (error.response) {
      const status = error.response.status;
      
      // 418 - IP被封禁
      if (status === 418) {
        this.isBlocked = true;
        console.error('❌ 检测到418错误 - IP已被封禁，停止所有请求');
        throw new Error('IP已被封禁(418)，请更换IP或联系Binance支持');
      }
      
      // 429 - 触发限流
      if (status === 429) {
        // 从响应头中获取Retry-After，如果没有则默认等待60秒
        const retryAfterSeconds = retryAfter || 
          parseInt(error.response.headers['retry-after']) || 
          60;
        
        this.rateLimitPauseUntil = Date.now() + (retryAfterSeconds * 1000);
        console.warn(`⚠️ 触发限流(429)，暂停${retryAfterSeconds}秒`);
        throw new Error(`触发限流，需等待${retryAfterSeconds}秒`);
      }
    }
  }

  /**
   * 更新请求权重
   */
  updateRequestWeight(weight) {
    // 如果超过1分钟，重置权重
    if (Date.now() > this.weightResetTime) {
      this.usedWeight = 0;
      this.weightResetTime = Date.now() + 60000;
    }
    
    this.usedWeight += weight;
    console.log(`📊 当前权重: ${this.usedWeight}/6000 (下次重置: ${new Date(this.weightResetTime).toLocaleTimeString()})`);
  }

  /**
   * 获取交易对的深度档位（BTC/ETH取500档，其他取100档）
   */
  getDepthLimit(symbol) {
    const highLiquidityPairs = ['BTCUSDT', 'ETHUSDT'];
    return highLiquidityPairs.includes(symbol) ? 500 : 100;
  }

  /**
   * 获取现货市场深度
   */
  async getSpotDepth(symbol) {
    this.canMakeRequest();
    
    const limit = this.getDepthLimit(symbol);
    const weight = limit === 500 ? this.requestWeights.depth500 : this.requestWeights.depth100;
    
    try {
      console.log(`📡 获取现货深度: ${symbol} (${limit}档, 权重:${weight})`);
      
      const response = await axios.get(`${BINANCE_API_BASE}/api/v3/depth`, {
        params: { symbol, limit },
        timeout: 10000,
        httpsAgent: httpsAgent
      });
      
      // 更新权重
      const usedWeight = response.headers['x-mbx-used-weight-1m'];
      if (usedWeight) {
        this.usedWeight = parseInt(usedWeight);
      } else {
        this.updateRequestWeight(weight);
      }
      
      return response.data;
    } catch (error) {
      this.handleRateLimitError(error);
      console.error(`❌ 获取现货深度失败 ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * 获取永续合约市场深度
   */
  async getFuturesDepth(symbol) {
    this.canMakeRequest();
    
    const limit = this.getDepthLimit(symbol);
    const weight = limit === 500 ? this.requestWeights.depth500 : this.requestWeights.depth100;
    
    try {
      console.log(`📡 获取永续深度: ${symbol} (${limit}档, 权重:${weight})`);
      
      const response = await axios.get(`${BINANCE_FUTURES_API_BASE}/fapi/v1/depth`, {
        params: { symbol, limit },
        timeout: 10000,
        httpsAgent: httpsAgent
      });
      
      // 更新权重
      const usedWeight = response.headers['x-mbx-used-weight-1m'];
      if (usedWeight) {
        this.usedWeight = parseInt(usedWeight);
      } else {
        this.updateRequestWeight(weight);
      }
      
      return response.data;
    } catch (error) {
      // 某些交易对可能没有永续合约，这是正常的
      if (error.response && error.response.status === 400) {
        console.log(`ℹ️ ${symbol} 没有永续合约`);
        return null;
      }
      
      this.handleRateLimitError(error);
      console.error(`❌ 获取永续深度失败 ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * 获取永续合约24小时交易量数据
   */
  async getFutures24hVolume() {
    this.canMakeRequest();
    
    try {
      console.log(`📡 获取永续合约24小时交易量 (权重:${this.requestWeights.ticker24hr})`);
      
      const response = await axios.get(`${BINANCE_FUTURES_API_BASE}/fapi/v1/ticker/24hr`, {
        timeout: 15000,
        httpsAgent: httpsAgent
      });
      
      // 更新权重
      this.updateRequestWeight(this.requestWeights.ticker24hr);
      
      // 创建交易对到交易量的映射
      const volumeMap = {};
      response.data.forEach(ticker => {
        if (ticker.symbol.endsWith('USDT')) {
          volumeMap[ticker.symbol] = parseFloat(ticker.quoteVolume);
        }
      });
      
      return volumeMap;
    } catch (error) {
      // 永续合约数据获取失败不影响整体流程
      console.warn('⚠️ 获取永续合约交易量失败:', error.message);
      return {};
    }
  }

  /**
   * 获取24小时交易量排名前N的交易对（包含现货和永续合约交易量）
   */
  async getTop24hVolume(limit = 10) {
    this.canMakeRequest();
    
    try {
      console.log(`📡 获取24小时交易量排名 (权重:${this.requestWeights.ticker24hr})`);
      
      // 获取现货交易量
      const spotResponse = await axios.get(`${BINANCE_API_BASE}/api/v3/ticker/24hr`, {
        timeout: 15000,
        httpsAgent: httpsAgent
      });
      
      // 更新权重
      this.updateRequestWeight(this.requestWeights.ticker24hr);
      
      // 获取永续合约交易量
      const futuresVolumeMap = await this.getFutures24hVolume();
      
      // 筛选USDT交易对并按现货交易量排序
      const sorted = spotResponse.data
        .filter(ticker => ticker.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, limit)
        .map(ticker => {
          const symbol = ticker.symbol;
          const spotVolume = parseFloat(ticker.quoteVolume);
          const futuresVolume = futuresVolumeMap[symbol] || null;
          
          return {
            symbol,
            spotVolume,
            futuresVolume,
            priceChange: parseFloat(ticker.priceChangePercent)
          };
        });
      
      console.log('✅ 热门交易对:', sorted.map(t => {
        const spot = `现货:$${(t.spotVolume/1e6).toFixed(1)}M`;
        const futures = t.futuresVolume ? `永续:$${(t.futuresVolume/1e6).toFixed(1)}M` : '永续:N/A';
        return `${t.symbol}(${spot}, ${futures})`;
      }).join(', '));
      
      return sorted;
    } catch (error) {
      this.handleRateLimitError(error);
      console.error('❌ 获取交易量数据失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取API状态
   */
  getStatus() {
    return {
      isBlocked: this.isBlocked,
      rateLimitPauseUntil: this.rateLimitPauseUntil,
      isPaused: this.rateLimitPauseUntil && Date.now() < this.rateLimitPauseUntil,
      usedWeight: this.usedWeight,
      weightResetTime: this.weightResetTime,
      canMakeRequest: !this.isBlocked && (!this.rateLimitPauseUntil || Date.now() >= this.rateLimitPauseUntil)
    };
  }

  /**
   * 重置封禁状态（需要手动调用，通常在更换IP后）
   */
  resetBlockStatus() {
    this.isBlocked = false;
    this.rateLimitPauseUntil = null;
    console.log('✅ API封禁状态已重置');
  }
}

module.exports = new BinanceAPI();

