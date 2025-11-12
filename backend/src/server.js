require('dotenv').config();
const express = require('express');
const cors = require('cors');
const liquidityRoutes = require('./routes/liquidity');
const redisService = require('./services/redisService');
const messageBus = require('./services/messageBus');
const metricsCalculator = require('./services/metricsCalculator');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 请求日志
app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} ${req.method} ${req.path}`);
  next();
});

// 路由
app.use('/api', liquidityRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '路由不存在'
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    error: err.message || '服务器内部错误'
  });
});

// 初始化Redis连接
async function initializeServices() {
  console.log('🔌 正在连接Redis...');
  try {
    const redisConnected = await redisService.connect();
    
    if (!redisConnected) {
      console.warn('⚠️  Redis连接失败，将使用内存存储（数据不会持久化）');
    }
  } catch (error) {
    console.warn('⚠️  Redis初始化失败，将使用内存存储:', error.message);
  }

  // 设置消息总线监听器 - 当订单簿更新时自动计算指标
  messageBus.on('orderbook:update', async ({ symbol, type }) => {
    try {
      // 延迟计算，避免过于频繁
      await new Promise(resolve => setTimeout(resolve, 100));
      const metrics = await metricsCalculator.calculateAllMetrics(symbol, type);
      messageBus.publishMetricsUpdate(symbol, type, metrics);
    } catch (error) {
      console.error(`计算指标失败 ${symbol}:${type}:`, error.message);
    }
  });

  // 自动订阅热门交易对的订单簿
  console.log('📡 正在自动订阅热门交易对...');
  const websocketService = require('./services/websocketService');
  const binanceAPI = require('./api/binance');
  
  try {
    // 获取 Top 10 交易对
    const topPairs = await binanceAPI.getTop24hVolume(10);
    console.log(`🔍 发现 ${topPairs.length} 个热门交易对`);
    
    for (const pair of topPairs) {
      try {
        const symbol = typeof pair === 'string' ? pair : pair.symbol;
        
        // 订阅现货
        await websocketService.subscribeOrderBook(symbol, 'spot');
        console.log(`✅ 自动订阅: ${symbol} spot`);
        
        // 延迟避免限流
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 尝试订阅永续合约（如果存在）
        try {
          await websocketService.subscribeOrderBook(symbol, 'futures');
          console.log(`✅ 自动订阅: ${symbol} futures`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (futuresError) {
          console.log(`⚠️  ${symbol} 永续合约不可用，跳过`);
        }
      } catch (error) {
        console.error(`❌ 订阅失败 ${typeof pair === 'string' ? pair : pair.symbol}:`, error.message);
      }
    }
    
    console.log('✅ 自动订阅完成');
  } catch (error) {
    console.error('❌ 自动订阅失败:', error.message);
    console.warn('⚠️  将继续启动服务，但需要手动订阅交易对');
  }

  console.log('✅ 服务初始化完成');
}

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭服务...');
  try {
    const websocketService = require('./services/websocketService');
    websocketService.unsubscribeAll();
    await redisService.disconnect();
  } catch (error) {
    // 忽略关闭错误
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n正在关闭服务...');
  try {
    const websocketService = require('./services/websocketService');
    websocketService.unsubscribeAll();
    await redisService.disconnect();
  } catch (error) {
    // 忽略关闭错误
  }
  process.exit(0);
});

// 启动服务器
async function startServer() {
  await initializeServices();
  
  app.listen(PORT, () => {
    console.log('=================================');
    console.log('🚀 Binance流动性监控后端启动成功');
    console.log(`📡 服务器运行在: http://localhost:${PORT}`);
    console.log(`📊 API端点: http://localhost:${PORT}/api`);
    console.log('=================================');
    console.log('');
    console.log('可用端点:');
    console.log('  GET  /api/liquidity              - 获取流动性数据');
    console.log('  GET  /api/depth/:symbol           - 获取深度数据');
    console.log('  GET  /api/status                  - 获取API状态');
    console.log('  POST /api/reset                   - 重置API状态');
    console.log('  POST /api/clear-cache             - 清除缓存');
    console.log('  POST /api/orderbook/subscribe     - 订阅订单簿流');
    console.log('  POST /api/orderbook/unsubscribe   - 取消订阅订单簿流');
    console.log('  GET  /api/orderbook/:symbol       - 获取实时订单簿和指标');
    console.log('  GET  /api/orderbook/subscriptions - 获取所有活跃订阅');
    console.log('  GET  /health                      - 健康检查');
    console.log('');
    console.log('⚠️  限流策略:');
    console.log('  - BTC/ETH: 500档深度 (权重10)');
    console.log('  - 其他币: 100档深度 (权重5)');
    console.log('  - 429错误: 自动暂停并根据Retry-After等待');
    console.log('  - 418错误: 停止所有请求，需要重置或更换IP');
    console.log('');
    console.log('📊 订单簿管理:');
    console.log('  - REST API获取快照，WebSocket增量更新');
    console.log('  - Redis存储订单簿和指标数据');
    console.log('  - 自动计算深度、滑点、冲击成本、库存风险等指标');
    console.log('=================================');
  });
}

startServer().catch(error => {
  console.error('❌ 服务器启动失败:', error);
  process.exit(1);
});

module.exports = app;

