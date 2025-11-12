const express = require('express');
const router = express.Router();
const binanceAPI = require('../api/binance');
const liquidityService = require('../services/liquidityService');
const websocketService = require('../services/websocketService');
const orderBookManager = require('../services/orderBookManager');
const metricsCalculator = require('../services/metricsCalculator');
const redisService = require('../services/redisService');

// 缓存最新数据
let cachedData = {
  data: null,
  timestamp: null,
  errors: []
};

/**
 * 获取流动性数据（优先使用WebSocket订单簿数据）
 */
router.get('/liquidity', async (req, res) => {
  try {
    console.log('🚀 开始获取流动性数据...');
    
    // 获取所有已订阅的订单簿
    const allOrderBooks = orderBookManager.getAllOrderBooks();
    const subscriptions = Object.keys(allOrderBooks);
    
    console.log(`📊 发现 ${subscriptions.length} 个活跃订单簿`);
    
    if (subscriptions.length === 0) {
      // 如果没有订阅，提示用户等待自动订阅
      return res.json({
        success: true,
        data: [],
        message: '系统正在初始化订单簿订阅，请稍候...',
        subscriptions: 0,
        timestamp: Date.now()
      });
    }
    
    // 获取交易量数据
    let volumeData = {};
    let priceChangeData = {};
    try {
      const topPairs = await binanceAPI.getTop24hVolume(20);
      topPairs.forEach(pair => {
        volumeData[pair.symbol] = {
          spotVolume: pair.spotVolume,
          futuresVolume: pair.futuresVolume
        };
        priceChangeData[pair.symbol] = pair.priceChange;
      });
    } catch (error) {
      console.error('⚠️ 获取交易量数据失败:', error.message);
      // 即使获取失败也继续处理，只是交易量字段为null
    }
    
    // 从订单簿数据生成流动性指标
    const liquidityData = [];
    const errors = [];
    
    // 按交易对分组（现货+合约）
    const symbolMap = new Map();
    
    for (const key of subscriptions) {
      const [symbol, type] = key.split(':');
      
      if (!symbolMap.has(symbol)) {
        symbolMap.set(symbol, { 
          symbol, 
          spot: null, 
          futures: null,
          spotVolume: volumeData[symbol]?.spotVolume || null,
          futuresVolume: volumeData[symbol]?.futuresVolume || null,
          priceChange: priceChangeData[symbol] || null
        });
      }
      
      try {
        const orderBook = orderBookManager.getOrderBook(symbol, type);
        if (orderBook && orderBook.bids.length > 0 && orderBook.asks.length > 0) {
          const metrics = liquidityService.calculateLiquidityMetrics(orderBook, symbol);
          
          // 计算数据年龄（秒）
          const age = Math.floor((Date.now() - orderBook.timestamp) / 1000);
          
          if (type === 'spot') {
            symbolMap.get(symbol).spot = { ...metrics, age };
          } else {
            symbolMap.get(symbol).futures = { ...metrics, age };
          }
        }
      } catch (error) {
        console.error(`❌ 计算指标失败 ${key}:`, error.message);
        errors.push({ symbol: key, error: error.message });
      }
    }
    
    // 转换为数组格式
    for (const [symbol, data] of symbolMap.entries()) {
      if (data.spot || data.futures) {
        liquidityData.push(data);
      }
    }
    
    // 按现货总深度排序
    liquidityData.sort((a, b) => {
      const depthA = a.spot?.totalDepth || 0;
      const depthB = b.spot?.totalDepth || 0;
      return depthB - depthA;
    });
    
    res.json({
      success: true,
      data: liquidityData,
      dataSource: 'websocket',
      subscriptions: subscriptions.length,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: Date.now(),
      apiStatus: binanceAPI.getStatus()
    });
    
    console.log(`✅ 成功返回 ${liquidityData.length} 个交易对的流动性数据（WebSocket源）`);
    
  } catch (error) {
    console.error('❌ 获取流动性数据失败:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      apiStatus: binanceAPI.getStatus()
    });
  }
});

/**
 * 获取特定交易对的详细深度数据
 */
router.get('/depth/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { type = 'spot' } = req.query;
    
    // 检查API状态
    const apiStatus = binanceAPI.getStatus();
    if (!apiStatus.canMakeRequest) {
      return res.status(503).json({
        success: false,
        error: apiStatus.isBlocked ? 'API已被封禁' : '触发限流',
        apiStatus
      });
    }
    
    const depth = type === 'futures'
      ? await binanceAPI.getFuturesDepth(symbol.toUpperCase())
      : await binanceAPI.getSpotDepth(symbol.toUpperCase());
    
    if (!depth) {
      return res.status(404).json({
        success: false,
        error: '该交易对不存在或没有永续合约'
      });
    }
    
    res.json({
      success: true,
      data: depth,
      apiStatus: binanceAPI.getStatus()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      apiStatus: binanceAPI.getStatus()
    });
  }
});

/**
 * 获取特定交易对的详细流动性分析
 */
router.get('/analysis/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { type = 'spot' } = req.query;
    
    // 检查API状态
    const apiStatus = binanceAPI.getStatus();
    if (!apiStatus.canMakeRequest) {
      return res.status(503).json({
        success: false,
        error: apiStatus.isBlocked ? 'API已被封禁' : '触发限流',
        apiStatus
      });
    }
    
    const upperSymbol = symbol.toUpperCase();
    
    // 获取深度数据
    const depth = type === 'futures'
      ? await binanceAPI.getFuturesDepth(upperSymbol)
      : await binanceAPI.getSpotDepth(upperSymbol);
    
    if (!depth) {
      return res.status(404).json({
        success: false,
        error: '该交易对不存在或没有永续合约'
      });
    }
    
    // 计算详细的流动性指标
    const metrics = liquidityService.calculateLiquidityMetrics(depth, upperSymbol);
    
    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        type,
        metrics,
        // 格式化输出
        summary: {
          spread: `${metrics.spreadPercent}%`,
          totalDepth: `$${(metrics.totalDepth / 1000).toFixed(0)}K`,
          score: metrics.liquidityScore,
          imbalance: `${(metrics.imbalance * 100).toFixed(1)}%`
        }
      },
      apiStatus: binanceAPI.getStatus()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      apiStatus: binanceAPI.getStatus()
    });
  }
});

/**
 * 获取API状态
 */
router.get('/status', (req, res) => {
  const status = binanceAPI.getStatus();
  
  res.json({
    success: true,
    status: {
      ...status,
      cacheAge: cachedData.timestamp ? Math.floor((Date.now() - cachedData.timestamp) / 1000) : null,
      hasCachedData: !!cachedData.data
    }
  });
});

/**
 * 重置API封禁状态（需要手动调用）
 */
router.post('/reset', (req, res) => {
  binanceAPI.resetBlockStatus();
  res.json({
    success: true,
    message: 'API状态已重置',
    status: binanceAPI.getStatus()
  });
});

/**
 * 清除缓存
 */
router.post('/clear-cache', (req, res) => {
  cachedData = {
    data: null,
    timestamp: null,
    errors: []
  };
  res.json({
    success: true,
    message: '缓存已清除'
  });
});

/**
 * 订阅订单簿流
 */
router.post('/orderbook/subscribe', async (req, res) => {
  try {
    const { symbol, type = 'spot' } = req.body;
    
    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: '缺少symbol参数'
      });
    }

    const upperSymbol = symbol.toUpperCase();
    await websocketService.subscribeOrderBook(upperSymbol, type);
    
    res.json({
      success: true,
      message: `已订阅 ${upperSymbol} ${type} 订单簿流`,
      symbol: upperSymbol,
      type
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 取消订阅订单簿流
 */
router.post('/orderbook/unsubscribe', (req, res) => {
  try {
    const { symbol, type = 'spot' } = req.body;
    
    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: '缺少symbol参数'
      });
    }

    const upperSymbol = symbol.toUpperCase();
    websocketService.unsubscribeOrderBook(upperSymbol, type);
    
    res.json({
      success: true,
      message: `已取消订阅 ${upperSymbol} ${type} 订单簿流`,
      symbol: upperSymbol,
      type
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取所有活跃的订单簿订阅
 */
router.get('/orderbook/subscriptions', (req, res) => {
  try {
    const connections = websocketService.getActiveConnections();
    const orderBooks = orderBookManager.getAllOrderBooks();
    
    res.json({
      success: true,
      data: {
        connections,
        orderBooks,
        count: connections.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取实时订单簿和指标
 */
router.get('/orderbook/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { type = 'spot', levels = 20 } = req.query;
    
    const upperSymbol = symbol.toUpperCase();
    const orderBook = orderBookManager.getOrderBook(upperSymbol, type);
    
    if (!orderBook) {
      return res.status(404).json({
        success: false,
        error: '订单簿不存在，请先订阅',
        hint: `使用 POST /api/orderbook/subscribe 订阅 { "symbol": "${upperSymbol}", "type": "${type}" }`
      });
    }

    // 计算指标
    const metrics = await metricsCalculator.calculateAllMetrics(upperSymbol, type);

    // 限制返回的档位数
    const maxLevels = parseInt(levels) || 20;
    const bids = orderBook.bids.slice(0, maxLevels);
    const asks = orderBook.asks.slice(0, maxLevels);

    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        type,
        orderBook: {
          bids,
          asks,
          lastUpdateId: orderBook.lastUpdateId,
          timestamp: orderBook.timestamp,
          age: Math.floor((Date.now() - orderBook.timestamp) / 1000) // 秒
        },
        metrics
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取WebSocket服务状态
 */
router.get('/websocket/status', (req, res) => {
  try {
    const wsStatus = websocketService.getStatus();
    const connections = websocketService.getActiveConnections();
    
    // 计算连接使用率
    const usagePercent = (wsStatus.recentConnectionAttempts / wsStatus.connectionLimit * 100).toFixed(2);
    
    res.json({
      success: true,
      data: {
        ...wsStatus,
        connectionList: connections,
        usagePercent: parseFloat(usagePercent),
        warning: usagePercent > 80 ? '连接使用率过高，接近限制' : null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 更新WebSocket配置
 */
router.post('/websocket/config', (req, res) => {
  try {
    const { updateInterval, reconnectDelay, pingInterval, maxConnectionsPerMinute } = req.body;
    
    const newConfig = {};
    if (updateInterval) newConfig.updateInterval = updateInterval;
    if (reconnectDelay) newConfig.reconnectDelay = reconnectDelay;
    if (pingInterval) newConfig.pingInterval = pingInterval;
    if (maxConnectionsPerMinute) newConfig.maxConnectionsPerMinute = maxConnectionsPerMinute;
    
    websocketService.updateConfig(newConfig);
    
    res.json({
      success: true,
      message: 'WebSocket配置已更新',
      config: websocketService.getStatus().config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== 时间序列数据API ====================

/**
 * 获取核心指标历史数据
 * GET /api/history/core/:symbol?type=spot&startTime=xxx&endTime=xxx&limit=1000
 */
router.get('/history/core/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { 
      type = 'spot', 
      startTime = null, 
      endTime = null, 
      limit = 1000 
    } = req.query;
    
    const upperSymbol = symbol.toUpperCase();
    
    const history = await redisService.getCoreMetricsHistory(
      upperSymbol, 
      type,
      startTime ? parseInt(startTime) : null,
      endTime ? parseInt(endTime) : null,
      parseInt(limit)
    );
    
    if (!history) {
      return res.status(404).json({
        success: false,
        error: '没有找到历史数据，可能Redis未连接或数据尚未开始收集'
      });
    }
    
    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        type,
        dataPoints: history.length,
        metrics: history,
        query: {
          startTime: startTime ? parseInt(startTime) : null,
          endTime: endTime ? parseInt(endTime) : null,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取高级指标历史数据
 * GET /api/history/advanced/:symbol?type=spot&startTime=xxx&endTime=xxx&limit=1000
 */
router.get('/history/advanced/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { 
      type = 'spot', 
      startTime = null, 
      endTime = null, 
      limit = 1000 
    } = req.query;
    
    const upperSymbol = symbol.toUpperCase();
    
    const history = await redisService.getAdvancedMetricsHistory(
      upperSymbol, 
      type,
      startTime ? parseInt(startTime) : null,
      endTime ? parseInt(endTime) : null,
      parseInt(limit)
    );
    
    if (!history) {
      return res.status(404).json({
        success: false,
        error: '没有找到历史数据'
      });
    }
    
    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        type,
        dataPoints: history.length,
        metrics: history,
        query: {
          startTime: startTime ? parseInt(startTime) : null,
          endTime: endTime ? parseInt(endTime) : null,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取最近N个数据点
 * GET /api/history/recent/:symbol?type=spot&count=100&includeAdvanced=true
 */
router.get('/history/recent/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { 
      type = 'spot', 
      count = 100,
      includeAdvanced = 'false'
    } = req.query;
    
    const upperSymbol = symbol.toUpperCase();
    const shouldIncludeAdvanced = includeAdvanced === 'true';
    
    const data = await redisService.getRecentMetrics(
      upperSymbol, 
      type,
      parseInt(count),
      shouldIncludeAdvanced
    );
    
    if (!data) {
      return res.status(404).json({
        success: false,
        error: '没有找到历史数据'
      });
    }
    
    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        type,
        coreDataPoints: data.core.length,
        advancedDataPoints: data.advanced?.length || 0,
        core: data.core,
        advanced: data.advanced || null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取时间序列统计信息
 * GET /api/history/stats/:symbol?type=spot
 */
router.get('/history/stats/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { type = 'spot' } = req.query;
    
    const upperSymbol = symbol.toUpperCase();
    
    const stats = await redisService.getTimeSeriesStats(upperSymbol, type);
    
    if (!stats) {
      return res.status(404).json({
        success: false,
        error: '没有找到统计信息'
      });
    }
    
    // 格式化时间范围
    if (stats.timeRange) {
      stats.timeRange.durationHours = (stats.timeRange.duration / 3600000).toFixed(2);
      stats.timeRange.startDate = new Date(stats.timeRange.start).toISOString();
      stats.timeRange.endDate = new Date(stats.timeRange.end).toISOString();
    }
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 立即保存当前指标到时间序列（手动触发）
 * POST /api/history/save/:symbol
 */
router.post('/history/save/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { type = 'spot' } = req.body;
    
    const upperSymbol = symbol.toUpperCase();
    
    // 获取当前指标
    const metrics = await metricsCalculator.calculateAllMetrics(upperSymbol, type);
    
    // 立即保存到时间序列
    const saved = await metricsCalculator.saveTimeSeriesNow(upperSymbol, type, metrics);
    
    if (!saved) {
      return res.status(500).json({
        success: false,
        error: '保存失败，可能Redis未连接'
      });
    }
    
    res.json({
      success: true,
      message: `已立即保存 ${upperSymbol} ${type} 的时间序列数据`,
      metrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 配置时间序列保存频率
 * POST /api/history/config
 * Body: { "type": "core|advanced", "intervalMs": 60000 }
 */
router.post('/history/config', (req, res) => {
  try {
    const { type, intervalMs } = req.body;
    
    if (!type || !intervalMs) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: type 和 intervalMs'
      });
    }
    
    if (type !== 'core' && type !== 'advanced') {
      return res.status(400).json({
        success: false,
        error: 'type 必须是 "core" 或 "advanced"'
      });
    }
    
    metricsCalculator.setSaveInterval(type, parseInt(intervalMs));
    
    res.json({
      success: true,
      message: `已更新 ${type} 指标保存频率为 ${intervalMs}ms`,
      config: {
        core: metricsCalculator.saveInterval.core,
        advanced: metricsCalculator.saveInterval.advanced
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

