require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const liquidityRoutes = require('./routes/liquidity');
const redisService = require('./services/redisService');
const messageBus = require('./services/messageBus');
const metricsCalculator = require('./services/metricsCalculator');
const orderBookManager = require('./services/orderBookManager');

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
    // 使用固定交易对列表（替换原来的动态获取）
    const topPairs = [
      'BTCUSDT',
      'ETHUSDT',
      'SOLUSDT',
      'XRPUSDT',
      'BNBUSDT',
      'SUIUSDT',
      'DOGEUSDT',
      'UNIUSDT',
      'DOTUSDT',
      'ASTERUSDT'
    ];
    
    console.log(`🔍 使用固定交易对列表 (${topPairs.length}个)`);
    
    // 1️⃣ 订阅现货（使用独立连接）
    console.log('📡 订阅 Spot 订单簿（独立连接）...');
    for (const pair of topPairs) {
      try {
        const symbol = typeof pair === 'string' ? pair : pair.symbol;
        
        const spotSuccess = await websocketService.subscribeOrderBook(symbol, 'spot');
        if (spotSuccess) {
          console.log(`✅ 自动订阅成功: ${symbol} spot`);
        } else {
          console.log(`⚠️ 自动订阅失败: ${symbol} spot (已进入重试队列)`);
        }
        
        // 延迟避免限流
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ 订阅失败 ${typeof pair === 'string' ? pair : pair.symbol}:`, error.message);
      }
    }
    
    // 2️⃣ 使用组合流订阅所有 Futures（1个连接）
    console.log('');
    console.log('📡 使用组合流订阅 Futures 订单簿（单连接）...');
    console.log('⚠️  注意：使用组合流避免速率限制（每秒最多5条消息）');
    
    try {
      const futuresSymbols = topPairs.map(p => typeof p === 'string' ? p : p.symbol);
      const futuresSuccess = await websocketService.subscribeFuturesCombined(futuresSymbols);
      
      if (futuresSuccess) {
        console.log(`✅ Futures 组合流订阅成功 (${futuresSymbols.length} 个交易对)`);
      } else {
        console.log(`⚠️ Futures 组合流订阅失败 (已进入重试队列)`);
      }
    } catch (futuresError) {
      console.error(`❌ Futures 组合流订阅异常:`, futuresError.message);
    }
    
    console.log('');
    console.log('✅ 自动订阅完成');
    
    // 输出订阅摘要
    setTimeout(() => {
      const connections = websocketService.getActiveConnections();
      const failedSubs = websocketService.getFailedSubscriptions();
      const spotConnections = connections.filter(k => k.endsWith(':spot'));
      const futuresConnections = connections.filter(k => k.includes('futures'));
      
      console.log('\n' + '='.repeat(60));
      console.log('📊 订阅摘要');
      console.log('='.repeat(60));
      console.log(`💠 SPOT 订阅: ${spotConnections.length} 个`);
      if (spotConnections.length > 0) {
        spotConnections.forEach(key => {
          const symbol = key.split(':')[0];
          console.log(`   ✓ ${symbol}`);
        });
      }
      console.log('');
      console.log(`🔥 FUTURES 订阅: ${futuresConnections.length > 0 ? '组合流 (已启用)' : '未启用'}`);
      if (futuresConnections.length > 0) {
        const allOrderBooks = orderBookManager.getAllOrderBooks();
        const futuresCount = Object.keys(allOrderBooks)
          .filter(key => key.includes(':futures')).length;
        console.log(`   ✓ 通过组合流订阅 ${futuresCount} 个交易对`);
      }
      console.log('');
      
      if (failedSubs.length > 0) {
        console.log(`⚠️  失败/重连中: ${failedSubs.length} 个`);
        failedSubs.forEach(sub => {
          const marketType = sub.type === 'futures' ? '🔥' : '💠';
          console.log(`   ${marketType} ${sub.key} - ${sub.reason} (重试: ${sub.retryCount})`);
        });
        console.log('');
        console.log('💡 提示: 失败的订阅会自动重试，无需手动干预');
      } else {
        console.log('✅ 所有订阅均正常运行');
      }
      
      console.log('='.repeat(60) + '\n');
    }, 2000);
    
  } catch (error) {
    console.error('❌ 自动订阅失败:', error.message);
    console.warn('⚠️  将继续启动服务，但需要手动订阅交易对');
  }

  // ========================================
  // ⭐ 健康检查定时器（每15秒）
  // ========================================
  // 功能：
  // 1. 遍历失败队列（failedSubs），重试订阅
  // 2. 检测断流（超过60秒无更新），重新订阅
  // 3. 检测"从未活跃"的订阅（订阅后60秒仍未收到消息）
  // 4. 防止僵尸数据
  // ========================================
  setInterval(async () => {
    const websocketService = require('./services/websocketService');
    
    // 🆕 心跳日志
    const now = new Date().toLocaleTimeString();
    console.log(`💓 [HEALTH-CHECK] 开始检查 (${now})`);
    
    try {
      // ===== 1. 处理失败队列 =====
      const failedSubs = websocketService.getFailedSubscriptions();
      
      for (const failedSub of failedSubs) {
        const { symbol, type, retryCount, lastRetry, reason } = failedSub;
        const key = `${symbol}:${type}`;
        
        // 检查是否满足重试条件（距离上次重试至少5秒）
        const timeSinceLastRetry = (Date.now() - lastRetry) / 1000;
        if (timeSinceLastRetry < 5) {
          continue; // 还不到重试时间
        }
        
        console.log(`🔄 [HEALTH-CHECK] 重试订阅: ${key} | 重试次数=${retryCount} | 原因=${reason}`);
        
        try {
          // 🆕 检查是否是 futures 组合流
          if (symbol === 'combined' && type === 'futures') {
            // 重新订阅组合流
            const futuresSymbols = [
              'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT',
              'SUIUSDT', 'DOGEUSDT', 'UNIUSDT', 'DOTUSDT', 'ASTERUSDT'
            ];
            const success = await websocketService.subscribeFuturesCombined(futuresSymbols);
            if (success) {
              console.log(`✅ [HEALTH-CHECK] Futures 组合流重试成功`);
            } else {
              console.log(`⚠️ [HEALTH-CHECK] Futures 组合流重试失败`);
            }
          } else {
            // 单独订阅
            const success = await websocketService.subscribeOrderBook(symbol, type);
            if (success) {
              console.log(`✅ [HEALTH-CHECK] 重试成功: ${key}`);
            } else {
              console.log(`⚠️ [HEALTH-CHECK] 重试仍失败: ${key} | 将在下次健康检查时继续重试`);
            }
          }
        } catch (error) {
          console.error(`❌ [HEALTH-CHECK] 重试异常: ${key} | ${error.message}`);
        }
        
        // 每次健康检查只处理一个失败订阅，避免短时间内大量请求
        break;
      }
      
      // ===== 2. 检测断流和"从未活跃"的订阅 =====
      const subscriptionStatuses = websocketService.getSubscriptionStatus();
      
      for (const status of subscriptionStatuses) {
        const { key, isAlive, ageSeconds, subscriptionAgeSeconds } = status;
        const [symbol, type] = key.split(':');
        
        // 🆕 情况1：订阅后长时间未活跃（从未收到消息）
        if (!isAlive && subscriptionAgeSeconds > 60) {
          console.warn(`🔧 [HEALTH-CHECK] 检测到订阅从未活跃: ${key} | 订阅时长=${subscriptionAgeSeconds}秒 | 重新订阅...`);
          
          try {
            // 先取消旧订阅
            websocketService.unsubscribeOrderBook(symbol, type);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 重新订阅
            const success = await websocketService.subscribeOrderBook(symbol, type);
            if (success) {
              console.log(`✅ [HEALTH-CHECK] 修复成功: ${key}`);
            } else {
              console.log(`⚠️ [HEALTH-CHECK] 修复失败: ${key} (已进入重试队列)`);
            }
          } catch (error) {
            console.error(`❌ [HEALTH-CHECK] 修复异常: ${key} | ${error.message}`);
          }
          
          // 每次健康检查只处理一个问题
          break;
        }
        
        // 情况2：曾经活跃但现在断流
        if (isAlive && ageSeconds > 60) {
          console.warn(`🔧 [HEALTH-CHECK] 检测到断流: ${key} | 年龄=${ageSeconds}秒 | 重新订阅...`);
          
          try {
            // 先取消旧订阅
            websocketService.unsubscribeOrderBook(symbol, type);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 重新订阅
            const success = await websocketService.subscribeOrderBook(symbol, type);
            if (success) {
              console.log(`✅ [HEALTH-CHECK] 断流修复成功: ${key}`);
            } else {
              console.log(`⚠️ [HEALTH-CHECK] 断流修复失败: ${key} (已进入重试队列)`);
            }
          } catch (error) {
            console.error(`❌ [HEALTH-CHECK] 断流修复异常: ${key} | ${error.message}`);
          }
          
          // 每次健康检查只处理一个断流问题
          break;
        }
      }
      
      // ===== 3. 检测 needsResync 标记 =====
      const allOrderBooks = orderBookManager.getAllOrderBooks();
      for (const [key, status] of Object.entries(allOrderBooks)) {
        const [symbol, type] = key.split(':');
        
        if (status.needsResync) {
          console.warn(`🔧 [HEALTH-CHECK] 修复 needsResync: ${key}`);
          
          try {
            await websocketService.triggerResync(symbol, type, 'health-check auto-fix');
          } catch (error) {
            console.error(`❌ [HEALTH-CHECK] 修复失败: ${key} | ${error.message}`);
          }
          
          // 每次健康检查只处理一个 resync 问题
          break;
        }
      }
      
    } catch (error) {
      // 健康检查失败不影响主服务，但要记录
      console.error('❌ [HEALTH-CHECK] 执行失败:', error.message);
      console.error(error.stack);
    }
    
    console.log(`💓 [HEALTH-CHECK] 检查完成\n`);
  }, 15000); // 每15秒执行一次

  console.log('✅ 服务初始化完成');
  console.log('🏥 健康检查已启动（每15秒检查订阅状态和断流）');
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
  
  // 创建 HTTP 服务器
  const server = http.createServer(app);
  
  // 创建 WebSocket 服务器
  const wss = new WebSocket.Server({ noServer: true });
  
  // WebSocket 客户端连接管理
  const clients = new Map(); // key: "symbol:market" -> Set of WebSocket clients
  
  // 处理 WebSocket 升级请求
  server.on('upgrade', (request, socket, head) => {
    const pathname = url.parse(request.url).pathname;
    
    if (pathname === '/ws/depth') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });
  
  // WebSocket 连接处理
  wss.on('connection', (ws, request) => {
    const params = new URLSearchParams(url.parse(request.url).query);
    const symbol = params.get('symbol');
    const market = params.get('market') || 'spot';
    
    if (!symbol) {
      ws.close(1008, 'Missing symbol parameter');
      return;
    }
    
    const key = `${symbol}:${market}`;
    
    // 添加客户端到订阅列表
    if (!clients.has(key)) {
      clients.set(key, new Set());
    }
    clients.get(key).add(ws);
    
    console.log(`📡 WebSocket 客户端连接: ${key}`);
    
    // 发送初始数据
    sendDepthData(ws, symbol, market);
    
    // 处理断开连接
    ws.on('close', () => {
      const clientSet = clients.get(key);
      if (clientSet) {
        clientSet.delete(ws);
        if (clientSet.size === 0) {
          clients.delete(key);
        }
      }
      console.log(`📡 WebSocket 客户端断开: ${key}`);
    });
    
    ws.on('error', (error) => {
      console.error(`❌ WebSocket 错误 ${key}:`, error.message);
    });
  });
  
  // 监听订单簿更新事件，推送给订阅的客户端
  messageBus.on('orderbook:update', ({ symbol, type }) => {
    const key = `${symbol}:${type}`;
    const clientSet = clients.get(key);
    
    if (clientSet && clientSet.size > 0) {
      // 只在有客户端订阅时才计算和推送
      clientSet.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          sendDepthData(ws, symbol, type);
        }
      });
    }
  });
  
  // 计算并发送深度数据
  function sendDepthData(ws, symbol, market) {
    try {
      const orderBook = orderBookManager.getOrderBook(symbol, market);
      
      if (!orderBook || !orderBook.bids.length || !orderBook.asks.length) {
        return;
      }
      
      const bestBid = orderBook.bids[0][0];
      const bestAsk = orderBook.asks[0][0];
      const midPrice = (bestBid + bestAsk) / 2;
      
      // 计算累计深度（取前20档）
      let bidCum = 0;
      let askCum = 0;
      const levels = Math.min(20, orderBook.bids.length, orderBook.asks.length);
      
      for (let i = 0; i < levels; i++) {
        if (orderBook.bids[i]) {
          bidCum += orderBook.bids[i][0] * orderBook.bids[i][1]; // price * quantity
        }
        if (orderBook.asks[i]) {
          askCum += orderBook.asks[i][0] * orderBook.asks[i][1]; // price * quantity
        }
      }
      
      const depthPoint = {
        t: Date.now(),
        price: midPrice,
        bidCum: bidCum,
        askCum: askCum,
        askCumNeg: -askCum,
        mid: midPrice
      };
      
      ws.send(JSON.stringify(depthPoint));
    } catch (error) {
      console.error(`❌ 发送深度数据失败 ${symbol}:${market}:`, error.message);
    }
  }
  
  server.listen(PORT, () => {
    console.log('=================================');
    console.log('🚀 Binance流动性监控后端启动成功');
    console.log(`📡 服务器运行在: http://localhost:${PORT}`);
    console.log(`📊 API端点: http://localhost:${PORT}/api`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws/depth`);
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
    console.log('  WS   /ws/depth?symbol=X&market=Y  - 实时深度数据流');
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
    console.log('');
    console.log('🏥 健康检查机制:');
    console.log('  - 每15秒检查订阅状态');
    console.log('  - 失败订阅进入重试队列（无限重试）');
    console.log('  - 断流检测（超过60秒无更新自动重新订阅）');
    console.log('  - 僵尸数据防护（超过120秒的数据不会保存到Redis）');
    console.log('=================================');
  });
}

startServer().catch(error => {
  console.error('❌ 服务器启动失败:', error);
  process.exit(1);
});

module.exports = app;
