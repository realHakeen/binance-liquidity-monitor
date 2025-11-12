import axios from 'axios';

const API_BASE = '/api';

export interface SlippageAnalysis {
  buy: {
    '100k': number;
    '300k': number;
    '500k': number;
    '1m': number;
    '5m': number;
  };
  sell: {
    '100k': number;
    '300k': number;
    '500k': number;
    '1m': number;
    '5m': number;
  };
}

export interface DepthAnalysis {
  bid: {
    '0.03%': number;
    '0.05%': number;
    '0.10%': number;
  };
  ask: {
    '0.03%': number;
    '0.05%': number;
    '0.10%': number;
  };
}

export interface ImpactCost {
  buy: number;
  sell: number;
  average: number;
  tradeSize: number;
}

export interface InventoryRisk {
  imbalance: number;
  riskScore: number;
  bidDepth: number;
  askDepth: number;
  totalDepth: number;
}

export interface FundingRate {
  rate: number;
  nextFundingTime: number;
  timestamp: number;
}

export interface DepthAtLevels {
  [key: string]: number; // e.g., "-0.1%": 2000000
}

export interface LiquidityMetrics {
  bidDepth: number;
  askDepth: number;
  totalDepth: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadPercent: number;
  midPrice: number;
  slippage10k: number;
  liquidityScore: number;
  imbalance: number;
  levels: number;
  timestamp: number;
  // 新增字段
  slippageAnalysis: SlippageAnalysis;
  depthAnalysis: DepthAnalysis;
  // 扩展指标
  impactCost?: ImpactCost;
  inventoryRisk?: InventoryRisk;
  fundingRate?: FundingRate | null;
  depthAtLevels?: DepthAtLevels;
}

export interface LiquidityData {
  symbol: string;
  spot: LiquidityMetrics;
  futures: LiquidityMetrics | null;
  spotVolume: number | null;
  futuresVolume: number | null;
  priceChange: number | null;
}

export interface ApiStatus {
  isBlocked: boolean;
  rateLimitPauseUntil: number | null;
  isPaused: boolean;
  usedWeight: number;
  weightResetTime: number;
  canMakeRequest: boolean;
}

export interface LiquidityResponse {
  success: boolean;
  cached?: boolean;
  timestamp: number;
  data: LiquidityData[];
  errors?: Array<{ symbol: string; error: string }>;
  apiStatus: ApiStatus;
  error?: string;
  retryAfter?: number;
  dataSource?: string;
  subscriptions?: number;
  message?: string;
}

export interface StatusResponse {
  success: boolean;
  status: ApiStatus & {
    cacheAge: number | null;
    hasCachedData: boolean;
  };
}

class LiquidityAPI {
  /**
   * 获取流动性数据
   */
  async getLiquidityData(): Promise<LiquidityResponse> {
    try {
      const response = await axios.get<LiquidityResponse>(`${API_BASE}/liquidity`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return error.response.data;
      }
      throw new Error('网络请求失败');
    }
  }

  /**
   * 获取特定交易对的深度数据
   */
  async getDepth(symbol: string, type: 'spot' | 'futures' = 'spot') {
    try {
      const response = await axios.get(`${API_BASE}/depth/${symbol}`, {
        params: { type }
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return error.response.data;
      }
      throw new Error('获取深度数据失败');
    }
  }

  /**
   * 获取API状态
   */
  async getStatus(): Promise<StatusResponse> {
    try {
      const response = await axios.get<StatusResponse>(`${API_BASE}/status`);
      return response.data;
    } catch (error) {
      throw new Error('获取状态失败');
    }
  }

  /**
   * 重置API状态
   */
  async resetStatus() {
    try {
      const response = await axios.post(`${API_BASE}/reset`);
      return response.data;
    } catch (error) {
      throw new Error('重置失败');
    }
  }

  /**
   * 清除缓存
   */
  async clearCache() {
    try {
      const response = await axios.post(`${API_BASE}/clear-cache`);
      return response.data;
    } catch (error) {
      throw new Error('清除缓存失败');
    }
  }

  /**
   * 订阅订单簿流
   */
  async subscribeOrderBook(symbol: string, type: 'spot' | 'futures' = 'spot') {
    try {
      const response = await axios.post(`${API_BASE}/orderbook/subscribe`, {
        symbol,
        type
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data.error || '订阅失败');
      }
      throw new Error('订阅订单簿失败');
    }
  }

  /**
   * 取消订阅订单簿流
   */
  async unsubscribeOrderBook(symbol: string, type: 'spot' | 'futures' = 'spot') {
    try {
      const response = await axios.post(`${API_BASE}/orderbook/unsubscribe`, {
        symbol,
        type
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data.error || '取消订阅失败');
      }
      throw new Error('取消订阅失败');
    }
  }

  /**
   * 获取实时订单簿和指标
   */
  async getOrderBook(symbol: string, type: 'spot' | 'futures' = 'spot', levels: number = 20) {
    try {
      const response = await axios.get(`${API_BASE}/orderbook/${symbol}`, {
        params: { type, levels }
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return error.response.data;
      }
      throw new Error('获取订单簿失败');
    }
  }

  /**
   * 获取所有活跃订阅
   */
  async getSubscriptions() {
    try {
      const response = await axios.get(`${API_BASE}/orderbook/subscriptions`);
      return response.data;
    } catch (error) {
      throw new Error('获取订阅列表失败');
    }
  }

  /**
   * 获取高级指标历史数据（包含深度数据）
   */
  async getAdvancedHistory(
    symbol: string, 
    type: 'spot' | 'futures' = 'spot',
    options?: {
      startTime?: number;
      endTime?: number;
      limit?: number;
    }
  ) {
    try {
      const response = await axios.get(`${API_BASE}/history/advanced/${symbol}`, {
        params: { type, ...options }
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return error.response.data;
      }
      throw new Error('获取历史数据失败');
    }
  }

  /**
   * 获取核心指标历史数据
   */
  async getCoreHistory(
    symbol: string,
    type: 'spot' | 'futures' = 'spot',
    options?: {
      startTime?: number;
      endTime?: number;
      limit?: number;
    }
  ) {
    try {
      const response = await axios.get(`${API_BASE}/history/core/${symbol}`, {
        params: { type, ...options }
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return error.response.data;
      }
      throw new Error('获取核心历史数据失败');
    }
  }

  /**
   * 获取最近历史数据
   */
  async getRecentHistory(
    symbol: string,
    type: 'spot' | 'futures' = 'spot',
    options?: {
      count?: number;
      includeAdvanced?: boolean;
    }
  ) {
    try {
      const response = await axios.get(`${API_BASE}/history/recent/${symbol}`, {
        params: { 
          type, 
          count: options?.count || 100,
          includeAdvanced: options?.includeAdvanced ? 'true' : 'false'
        }
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return error.response.data;
      }
      throw new Error('获取最近历史数据失败');
    }
  }

  /**
   * 获取历史统计信息
   */
  async getHistoryStats(
    symbol: string,
    type: 'spot' | 'futures' = 'spot'
  ) {
    try {
      const response = await axios.get(`${API_BASE}/history/stats/${symbol}`, {
        params: { type }
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return error.response.data;
      }
      throw new Error('获取历史统计失败');
    }
  }
}

export const liquidityAPI = new LiquidityAPI();

