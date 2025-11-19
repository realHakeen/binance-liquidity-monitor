const WebSocket = require('ws');
const orderBookManager = require('./orderBookManager');
const binanceAPI = require('../api/binance');
const messageBus = require('./messageBus');
const wsConfig = require('../config/websocket.config');

/**
 * WebSocketService - 管理订单簿WebSocket订阅
 * 
 * 核心特性：
 * 1. 订阅必须有成功监听机制（收到第一条更新才算成功）
 * 2. 失败订阅进入重试队列（无限重试）
 * 3. 断流检测（超过60秒无更新自动重新订阅）
 * 4. 防止静默失败
 * 5. Futures 组合流支持（单连接多交易对）
 */
class WebSocketService {
  constructor() {
    this.connections = new Map(); // key -> WebSocket
    this.reconnectTimers = new Map();
    this.pingTimers = new Map(); // PING定时器
    this.connectionAttempts = []; // 连接尝试记录（用于限流检查）
    this.resyncInProgress = new Map(); // 防止并发重新同步: key -> boolean
    
    // 失败重试队列
    // key: `${symbol}:${type}` 或 'combined:futures'
    // value: { symbol, type, retryCount, lastRetry, firstFailTime, reason }
    this.failedSubs = new Map();
    
    // 订阅状态跟踪（用于确认是否成功）
    // key: `${symbol}:${type}`
    // value: { isAlive: boolean, lastUpdate: timestamp, subscriptionTime: timestamp }
    this.subscriptionStatus = new Map();
    
    // 使用外部配置
    this.config = { ...wsConfig };
    
    // 启动失败订阅自动重试定时器
    this.startAutoRetry();
  }

  /**
   * 检查连接限流
   */
  checkConnectionRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // 清理过期的连接记录
    this.connectionAttempts = this.connectionAttempts.filter(time => time > oneMinuteAgo);
    
    // 检查是否超过限制
    if (this.connectionAttempts.length >= this.config.maxConnectionsPerMinute) {
      const oldestAttempt = this.connectionAttempts[0];
      const waitTime = Math.ceil((oldestAttempt + 60000 - now) / 1000);
      throw new Error(`连接限流：每分钟最多${this.config.maxConnectionsPerMinute}次连接，请等待${waitTime}秒`);
    }
    
    // 记录本次连接尝试
    this.connectionAttempts.push(now);
  }

  /**
   * 订阅订单簿深度流（按照 Binance 官方推荐流程）
   * 
   * @returns {Promise<boolean>} 返回是否成功订阅（true: 成功, false: 失败）
   * 
   * 成功标准：
   * - WebSocket连接成功
   * - REST快照获取成功
   * - 订单簿初始化成功
   * 
   * 注意：此方法返回true不代表订阅永久有效，可能后续断流
   *      真正的"订阅存活"由 subscriptionStatus.isAlive 标记
   */
  async subscribeOrderBook(symbol, type = 'spot') {
    const key = `${symbol}:${type}`;
    
    // 检查连接限流
    try {
      this.checkConnectionRateLimit();
    } catch (error) {
      console.warn(`⚠️ ${error.message}`);
      this.addToFailedQueue(symbol, type, error.message);
      return false;
    }
    
    // 如果已经连接，先关闭
    if (this.connections.has(key)) {
      this.unsubscribeOrderBook(symbol, type);
    }

    // 创建缓冲区来存储 WebSocket 连接后、快照获取前的更新
    const updateBuffer = [];
    let wsReady = false;
    let snapshotReady = false;
    let isProcessingBuffer = false;

    try {
      // 1. 先连接 WebSocket（在获取快照之前）
      // ⚠️ 重要：Binance 深度流格式规则
      // - Spot: btcusdt@depth (默认1000ms) 或 btcusdt@depth@100ms
      // - Futures: btcusdt@depth (默认1000ms) 或 btcusdt@depth@100ms 或 btcusdt@depth@500ms
      // - 注意：没有 @1000ms 这种写法！1000ms 的话直接用 @depth
      
      const interval = this.config.updateInterval;
      let streamName;
      
      if (interval === '1000ms') {
        // 1000ms 使用默认格式（不加后缀）
        streamName = `${symbol.toLowerCase()}@depth`;
      } else if (interval === '100ms') {
        streamName = `${symbol.toLowerCase()}@depth@100ms`;
      } else if (interval === '500ms' && type === 'futures') {
        streamName = `${symbol.toLowerCase()}@depth@500ms`;
      } else {
        // 其他情况使用默认
        console.warn(`⚠️ 不支持的更新间隔 ${interval}，使用默认 @depth`);
        streamName = `${symbol.toLowerCase()}@depth`;
      }

      const wsUrl = type === 'futures'
        ? `wss://fstream.binance.com/ws/${streamName}`
        : `wss://stream.binance.com:9443/ws/${streamName}`;

      console.log(`🔌 [1/4] 连接 WebSocket: ${wsUrl}`);

      const wsOptions = {
        rejectUnauthorized: false
      };

      const ws = new WebSocket(wsUrl, wsOptions);

      // 设置连接超时（10秒内必须open）
      const connectionTimeout = setTimeout(() => {
        if (!wsReady) {
          console.error(`❌ WebSocket 连接超时: ${key}`);
          ws.close();
        }
      }, 10000);

      ws.on('open', async () => {
        clearTimeout(connectionTimeout);
        console.log(`✅ [2/4] WebSocket 连接成功: ${key}，开始缓存更新...`);
        wsReady = true;
        
        // 启动 PING 定时器
        this.startPingTimer(key, ws);

        try {
          // 2. 获取 REST 快照
          console.log(`📸 [3/4] 获取 ${symbol} ${type} 订单簿快照...`);
          let snapshot;
          
          if (type === 'futures') {
            snapshot = await binanceAPI.getFuturesDepth(symbol);
          } else {
            snapshot = await binanceAPI.getSpotDepth(symbol);
          }
          
          if (!snapshot) {
            throw new Error('无法获取快照');
          }

          // 3. 初始化本地订单簿
          await orderBookManager.initializeOrderBook(symbol, type, snapshot);
          snapshotReady = true;

          console.log(
            `✅ [4/4] 快照已获取，lastUpdateId=${snapshot.lastUpdateId}，` +
            `处理缓存的 ${updateBuffer.length} 个更新...`
          );

          // 4. 处理缓存的更新
          isProcessingBuffer = true;
          let appliedCount = 0;
          let droppedCount = 0;

          for (const bufferedUpdate of updateBuffer) {
            const { U: firstUpdateId, u: lastUpdateId } = bufferedUpdate;
            
            // 丢弃已经包含在快照中的更新
            if (lastUpdateId <= snapshot.lastUpdateId) {
              droppedCount++;
              continue;
            }

            // 应用有效的更新
            const success = orderBookManager.applyUpdate(symbol, type, bufferedUpdate);
            if (success) {
              appliedCount++;
              // 触发指标计算
              messageBus.publishOrderBookUpdate(symbol, type);
            }
          }

          console.log(
            `✅ [完成] ${key} 初始化完成 | ` +
            `丢弃=${droppedCount}, 应用=${appliedCount}, 总缓存=${updateBuffer.length}`
          );

          // 清空缓冲区
          updateBuffer.length = 0;
          isProcessingBuffer = false;

          // 初始化订阅状态（注意：此时还未收到第一条实时更新，isAlive=false）
          this.subscriptionStatus.set(key, {
            isAlive: false, // 等待第一条实时更新
            lastUpdate: Date.now(),
            subscriptionTime: Date.now() // 记录订阅时间
          });

        } catch (error) {
          console.error(`❌ 获取快照或初始化失败: ${error.message}`);
          messageBus.publishError(symbol, type, error);
          ws.close();
          this.addToFailedQueue(symbol, type, `快照失败: ${error.message}`);
          throw error;
        }
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          // 处理 PING 消息
          if (message.e === 'ping') {
            ws.pong();
            console.log(`🏓 响应 PING: ${key}`);
            return;
          }
          
          // 如果快照还没准备好，缓存更新
          if (!snapshotReady || isProcessingBuffer) {
            updateBuffer.push(message);
            return;
          }

          // 快照准备好后，直接处理更新
          this.handleOrderBookUpdate(symbol, type, message);
          
        } catch (error) {
          console.error(`❌ 解析 WebSocket 消息失败: ${error.message}`);
        }
      });

      ws.on('pong', () => {
        console.log(`🏓 收到 PONG 响应: ${key}`);
      });

      ws.on('error', (error) => {
        console.error(`❌ WebSocket 错误 ${key}:`, error.message);
        messageBus.publishError(symbol, type, error);
        this.addToFailedQueue(symbol, type, `WebSocket错误: ${error.message}`);
      });

      ws.on('close', () => {
        console.log(`⚠️ WebSocket 断开: ${key}`);
        this.connections.delete(key);
        
        // 标记订阅状态为不活跃
        const status = this.subscriptionStatus.get(key);
        if (status) {
          status.isAlive = false;
        }
        
        // 清除 PING 定时器
        this.clearPingTimer(key);
        
        // 清除之前的重连定时器
        const existingTimer = this.reconnectTimers.get(key);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        
        // 进入失败队列，由健康检查统一重连
        this.addToFailedQueue(symbol, type, 'WebSocket断开');
      });

      this.connections.set(key, ws);
      
      // 等待初始化完成（最多等待30秒）
      await this.waitForInitialization(key, 30000);
      
      // 检查是否真的成功了
      const orderBook = orderBookManager.getOrderBook(symbol, type);
      if (!orderBook) {
        throw new Error('订单簿初始化失败');
      }
      
      // 成功订阅：输出醒目提示
      const marketType = type === 'futures' ? '🔥 FUTURES' : '💠 SPOT';
      console.log(`\n${'='.repeat(60)}`);
      console.log(`✅ [订阅成功] ${marketType} | ${symbol}`);
      console.log(`   ├─ 交易对: ${key}`);
      console.log(`   ├─ Bids数量: ${orderBook.bids.length}`);
      console.log(`   ├─ Asks数量: ${orderBook.asks.length}`);
      console.log(`   └─ 最后更新ID: ${orderBook.lastUpdateId}`);
      console.log(`${'='.repeat(60)}\n`);
      return true;
      
    } catch (error) {
      const marketType = type === 'futures' ? '🔥 FUTURES' : '💠 SPOT';
      console.log(`\n${'='.repeat(60)}`);
      console.log(`❌ [订阅失败] ${marketType} | ${symbol}`);
      console.log(`   ├─ 交易对: ${key}`);
      console.log(`   ├─ 错误信息: ${error.message}`);
      console.log(`   └─ 状态: 已加入重试队列`);
      console.log(`${'='.repeat(60)}\n`);
      this.addToFailedQueue(symbol, type, error.message);
      return false;
    }
  }

  /**
   * 等待订单簿初始化完成
   */
  async waitForInitialization(key, timeout) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const [symbol, type] = key.split(':');
      const orderBook = orderBookManager.getOrderBook(symbol, type);
      if (orderBook && orderBook.bids.length > 0 && orderBook.asks.length > 0) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('初始化超时');
  }

  /**
   * 添加到失败队列
   * 
   * @param {string} symbol - 交易对名称，或 'combined' 表示组合流
   * @param {string} type - 市场类型，'spot' 或 'futures'
   * @param {string} reason - 失败原因
   */
  addToFailedQueue(symbol, type, reason) {
    const key = `${symbol}:${type}`;
    const existing = this.failedSubs.get(key);
    
    if (existing) {
      // 已在队列中，增加重试次数
      existing.retryCount++;
      existing.lastRetry = Date.now();
      existing.reason = reason;
      console.log(`⚠️ [RETRY-QUEUE] 更新失败记录: ${key} | 重试次数=${existing.retryCount} | 原因=${reason}`);
    } else {
      // 新加入队列
      this.failedSubs.set(key, {
        symbol,
        type,
        retryCount: 0,
        lastRetry: Date.now(),
        firstFailTime: Date.now(),
        reason
      });
      console.log(`🔴 [RETRY-QUEUE] 加入失败队列: ${key} | 原因=${reason}`);
    }
  }

  /**
   * 从失败队列移除（订阅成功后调用）
   * 
   * @param {string} symbol - 交易对名称
   * @param {string} type - 市场类型
   */
  removeFromFailedQueue(symbol, type) {
    const key = `${symbol}:${type}`;
    if (this.failedSubs.has(key)) {
      const failInfo = this.failedSubs.get(key);
      const duration = ((Date.now() - failInfo.firstFailTime) / 1000).toFixed(1);
      console.log(`✅ [RETRY-QUEUE] 移除失败队列: ${key} | 失败时长=${duration}秒 | 重试次数=${failInfo.retryCount}`);
      this.failedSubs.delete(key);
    }
  }

  /**
   * 启动失败订阅自动重试定时器
   * 
   * 策略：
   * - 每10秒检查一次失败队列
   * - 每次只重试一个订阅（避免雪崩）
   * - 两次重试间隔至少5秒
   * - 区分普通订阅和组合流
   */
  startAutoRetry() {
    // 每10秒检查一次失败队列
    setInterval(async () => {
      if (this.failedSubs.size === 0) return;
      
      const now = Date.now();
      for (const [key, failInfo] of this.failedSubs.entries()) {
        const { symbol, type, lastRetry } = failInfo;
        
        // 限流：距离上次重试至少5秒
        if (now - lastRetry < 5000) continue;
        
        try {
          const marketType = type === 'futures' ? '🔥 FUTURES' : '💠 SPOT';
          console.log(`\n${'='.repeat(60)}`);
          console.log(`🔄 [自动重连] ${marketType} | ${symbol}`);
          console.log(`   ├─ 交易对: ${key}`);
          console.log(`   ├─ 重试次数: ${failInfo.retryCount + 1}`);
          console.log(`   ├─ 失败原因: ${failInfo.reason}`);
          console.log(`   └─ 状态: 正在尝试重新连接...`);
          console.log(`${'='.repeat(60)}\n`);
          
          // 更新 lastRetry 时间
          failInfo.lastRetry = now;
          
          // 重试订阅
          if (symbol === 'combined' && type === 'futures') {
            // Futures组合流特殊处理
            // 注意：这里使用固定的 symbol 列表，你可以根据实际需求调整
            const futuresSymbols = [
              'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT',
              'SUIUSDT', 'DOGEUSDT', 'UNIUSDT', 'DOTUSDT', 'ASTERUSDT'
            ];
            await this.subscribeFuturesCombined(futuresSymbols);
          } else {
            await this.subscribeOrderBook(symbol, type);
          }
        } catch (error) {
          console.log(`\n${'='.repeat(60)}`);
          console.log(`❌ [重连失败] ${type === 'futures' ? '🔥 FUTURES' : '💠 SPOT'} | ${symbol}`);
          console.log(`   ├─ 交易对: ${key}`);
          console.log(`   ├─ 错误信息: ${error.message}`);
          console.log(`   └─ 状态: 将在5秒后再次尝试`);
          console.log(`${'='.repeat(60)}\n`);
        }
        
        // 每轮只重试一个，避免过载
        break;
      }
    }, 10000);
  }

  /**
   * 启动PING定时器
   */
  startPingTimer(key, ws) {
    // 清除旧的定时器
    this.clearPingTimer(key);
    
    // 定期发送PING
    const timer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
        console.log(`🏓 发送PING: ${key}`);
      }
    }, this.config.pingInterval);
    
    this.pingTimers.set(key, timer);
  }

  /**
   * 清除PING定时器
   */
  clearPingTimer(key) {
    const timer = this.pingTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.pingTimers.delete(key);
    }
  }

  /**
   * 处理订单簿更新（带自动重新同步监督）
   * 
   * ⭐ 关键：收到第一条有效更新后，标记订阅为"活跃"，并从失败队列移除
   */
  async handleOrderBookUpdate(symbol, type, update) {
    const key = `${symbol}:${type}`;
    
    // 应用增量更新
    const success = orderBookManager.applyUpdate(symbol, type, update);
    
    if (success) {
      // ⭐ 更新成功：标记为活跃，并从失败队列移除
      let status = this.subscriptionStatus.get(key);
      if (!status) {
        status = { isAlive: false, lastUpdate: 0, subscriptionTime: Date.now() };
        this.subscriptionStatus.set(key, status);
      }
      
      // 如果这是第一条有效更新（从 false 变为 true）
      if (!status.isAlive) {
        console.log(`🎉 [ALIVE] ${key} 收到第一条有效更新，订阅确认成功`);
        status.isAlive = true;
        this.removeFromFailedQueue(symbol, type); // 从失败队列移除
      }
      
      // 更新最后更新时间
      status.lastUpdate = Date.now();
      
      // 触发指标计算（通过消息总线）
      messageBus.publishOrderBookUpdate(symbol, type);
      return;
    }
    
    // ==========================================
    // 更新失败：检查是否需要重新同步
    // ==========================================
    
    // 检查1：通过 needsResync 方法检查
    const needsResync = orderBookManager.needsResync(symbol, type);
    
    // 检查2：通过 getOrderBook 检查（如果needsResync=true，会返回null）
    const orderBook = orderBookManager.getOrderBook(symbol, type);
    
    if (needsResync || !orderBook) {
      console.warn(
        `⚠️ [WebSocket] 检测到订单簿需要重新同步: ${key} | ` +
        `原因: ${needsResync ? 'needsResync=true' : '订单簿不存在'}`
      );
      
      // 触发自动重新同步（非阻塞）
      this.triggerResync(symbol, type, 'gap detected or missing orderbook')
        .catch(err => {
          console.error(`❌ [WebSocket] 自动重新同步失败: ${key} | ${err.message}`);
        });
    }
  }

  /**
   * 触发订单簿重新同步
   */
  async triggerResync(symbol, type, reason) {
    const key = `${symbol}:${type}`;
    
    // 检查是否已经在重新同步中
    if (this.resyncInProgress.get(key)) {
      console.log(`⏳ [RESYNC] 已在进行中，跳过: ${key}`);
      return;
    }
    
    // 设置锁
    this.resyncInProgress.set(key, true);
    
    try {
      console.log(
        `🔄 [RESYNC] 开始重新同步: symbol=${symbol}, type=${type}, reason="${reason}"`
      );
      
      // 步骤1：清除旧的订单簿
      orderBookManager.clearOrderBook(symbol, type);
      
      // 步骤2：从Binance REST API获取最新快照
      let snapshot;
      if (type === 'futures') {
        snapshot = await binanceAPI.getFuturesDepth(symbol);
      } else {
        snapshot = await binanceAPI.getSpotDepth(symbol);
      }
      
      if (!snapshot) {
        throw new Error('无法获取REST快照');
      }
      
      // 步骤3：重新初始化订单簿
      await orderBookManager.initializeOrderBook(symbol, type, snapshot);
      
      console.log(
        `✅ [RESYNC] 重新同步完成: ${key} | ` +
        `lastUpdateId=${snapshot.lastUpdateId}, ` +
        `bids=${snapshot.bids.length}, asks=${snapshot.asks.length}`
      );
      
      // 步骤4：触发一次指标计算（让前端更新）
      messageBus.publishOrderBookUpdate(symbol, type);
      
    } catch (error) {
      console.error(
        `❌ [RESYNC] 重新同步失败: ${key} | ${error.message}`
      );
      messageBus.publishError(symbol, type, error);
      
      // 失败后进入重试队列
      this.addToFailedQueue(symbol, type, `重新同步失败: ${error.message}`);
      throw error;
      
    } finally {
      // 无论成功或失败，都要释放锁
      this.resyncInProgress.delete(key);
    }
  }

  /**
   * 🆕 为 Futures 创建组合流连接（推荐方式）
   * 
   * 优势：
   * - 只占用 1 个 WebSocket 连接
   * - 避免速率限制（每秒最多 5 条消息）
   * - 更高效、更稳定
   * 
   * ⚠️ 关键修复：
   * - connections 用 'futures:combined' 作为 key
   * - 订单簿依旧按 `${symbol}:futures` 维护
   * - 不再调用 waitForInitialization('futures:combined')，因为这个 key 不对应任何订单簿
   * - 直接根据 initializedSymbols.size > 0 返回成功/失败
   * 
   * @param {Array<string>} symbols - 交易对数组，如 ['BTCUSDT', 'ETHUSDT']
   * @returns {Promise<boolean>} 是否成功订阅
   */
  async subscribeFuturesCombined(symbols) {
    const key = 'futures:combined';
    
    if (this.connections.has(key)) {
      console.log('⚠️ Futures 组合流已存在，先关闭旧连接');
      const ws = this.connections.get(key);
      if (ws) ws.close();
      this.connections.delete(key);
      this.clearPingTimer(key);
    }
    
    // 检查连接限流
    try {
      this.checkConnectionRateLimit();
    } catch (error) {
      console.warn(`⚠️ [COMBINED] ${error.message}`);
      this.addToFailedQueue('combined', 'futures', error.message);
      return false;
    }
    
    // 构建组合流 URL
    // 格式：btcusdt@depth/ethusdt@depth/... (1000ms 默认)
    // 或：btcusdt@depth@100ms/ethusdt@depth@100ms/...
    // 或：btcusdt@depth@500ms/ethusdt@depth@500ms/...
    const interval = this.config.updateInterval;
    let streamSuffix;
    
    if (interval === '1000ms') {
      streamSuffix = '@depth'; // 默认 1000ms，不加后缀
    } else if (interval === '100ms') {
      streamSuffix = '@depth@100ms';
    } else if (interval === '500ms') {
      streamSuffix = '@depth@500ms';
    } else {
      console.warn(`⚠️ [COMBINED] 不支持的更新间隔 ${interval}，使用默认 @depth`);
      streamSuffix = '@depth';
    }
    
    const streams = symbols.map(s => `${s.toLowerCase()}${streamSuffix}`);
    const wsUrl = `wss://fstream.binance.com/stream?streams=${streams.join('/')}`;
    
    console.log(`🔌 [COMBINED] 连接 Futures 组合流: ${symbols.length} 个交易对`);
    console.log(`📡 [COMBINED] 流列表: ${symbols.join(', ')}`);
    console.log(`🌐 [COMBINED] URL: ${wsUrl}`);
    
    const ws = new WebSocket(wsUrl, { rejectUnauthorized: false });
    
    // 用于跟踪哪些 symbol 已经初始化
    const initializedSymbols = new Set();
    
    ws.on('open', async () => {
      console.log(`✅ [COMBINED] Futures 组合流连接成功`);
      
      // 启动 PING 定时器
      this.startPingTimer(key, ws);
      
      // 为每个 symbol 获取 REST 快照并初始化订单簿
      for (const symbol of symbols) {
        try {
          console.log(`📸 [COMBINED] 获取 ${symbol} futures 快照...`);
          const snapshot = await binanceAPI.getFuturesDepth(symbol);
          
          if (snapshot) {
            await orderBookManager.initializeOrderBook(symbol, 'futures', snapshot);
            initializedSymbols.add(symbol);
            console.log(`✅ [COMBINED] ${symbol} futures 初始化完成 (lastUpdateId=${snapshot.lastUpdateId})`);
            
            // 为每个 symbol 初始化订阅状态
            // ⚠️ 注意：key 是 `${symbol}:futures`，不是 'futures:combined'
            const subKey = `${symbol}:futures`;
            this.subscriptionStatus.set(subKey, {
              isAlive: false, // 等待第一条更新
              lastUpdate: Date.now(),
              subscriptionTime: Date.now()
            });
          } else {
            console.error(`❌ [COMBINED] ${symbol} futures 快照为空`);
          }
          
          // 延迟500ms避免 REST API 限流
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`❌ [COMBINED] ${symbol} futures 初始化失败:`, error.message);
        }
      }
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔥 [FUTURES 组合流] 初始化完成`);
      console.log(`   ├─ 成功订阅: ${initializedSymbols.size}/${symbols.length} 个交易对`);
      console.log(`   ├─ 交易对列表: ${Array.from(initializedSymbols).join(', ')}`);
      console.log(`   └─ 连接状态: 实时接收数据中`);
      console.log(`${'='.repeat(60)}\n`);
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // 处理 PING 消息
        if (message.e === 'ping') {
          ws.pong();
          console.log(`🏓 [COMBINED] 响应 PING`);
          return;
        }
        
        // 组合流消息格式：{ stream: "btcusdt@depth", data: {...} }
        // 或：{ stream: "btcusdt@depth@100ms", data: {...} }
        // 或：{ stream: "btcusdt@depth@500ms", data: {...} }
        if (message.stream && message.data) {
          // 从 stream 名称提取 symbol
          // 格式：btcusdt@depth -> BTCUSDT
          // 或：btcusdt@depth@100ms -> BTCUSDT
          // 或：btcusdt@depth@500ms -> BTCUSDT
          const streamParts = message.stream.split('@');
          const symbol = streamParts[0].toUpperCase();
          
          // 只处理已初始化的 symbol
          if (initializedSymbols.has(symbol)) {
            // 处理订单簿更新（data 字段包含实际的深度数据）
            this.handleOrderBookUpdate(symbol, 'futures', message.data);
          }
        } else {
          // 单流消息格式（不应该出现在组合流中，但保留兼容）
          console.warn(`⚠️ [COMBINED] 收到非组合流格式消息，忽略`);
        }
        
      } catch (error) {
        console.error(`❌ [COMBINED] 解析消息失败:`, error.message);
      }
    });
    
    ws.on('pong', () => {
      console.log(`🏓 [COMBINED] 收到 PONG 响应`);
    });
    
    ws.on('error', (error) => {
      console.error(`❌ [COMBINED] WebSocket 错误:`, error.message);
      // 标记所有 symbols 的订阅状态为不活跃
      for (const symbol of symbols) {
        const subKey = `${symbol}:futures`;
        const status = this.subscriptionStatus.get(subKey);
        if (status) {
          status.isAlive = false;
        }
      }
      // 进入失败队列
      this.addToFailedQueue('combined', 'futures', `WebSocket错误: ${error.message}`);
    });
    
    ws.on('close', () => {
      console.log(`⚠️ [COMBINED] Futures 组合流断开`);
      this.connections.delete(key);
      this.clearPingTimer(key);
      
      // 所有 symbols 标记为不活跃
      for (const symbol of symbols) {
        const subKey = `${symbol}:futures`;
        const status = this.subscriptionStatus.get(subKey);
        if (status) {
          status.isAlive = false;
        }
      }
      
      // 进入失败队列，等待自动重试
      this.addToFailedQueue('combined', 'futures', 'WebSocket断开');
    });
    
    this.connections.set(key, ws);
    
    // ⚠️ 关键修复：不再调用 waitForInitialization('futures:combined', 30000)
    // 因为 'futures:combined' 这个 key 不对应任何订单簿
    // 直接根据 initializedSymbols.size > 0 返回成功/失败
    
    // 等待 WebSocket 连接并完成初始化（最多30秒）
    const startTime = Date.now();
    const timeout = 30000;
    while (Date.now() - startTime < timeout) {
      if (initializedSymbols.size > 0) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`✅ [订阅成功] 🔥 FUTURES 组合流`);
        console.log(`   ├─ 订阅方式: 组合流 (单一WebSocket连接)`);
        console.log(`   ├─ 成功数量: ${initializedSymbols.size}/${symbols.length} 个交易对`);
        console.log(`   ├─ 连接效率: 节省 ${symbols.length - 1} 个WebSocket连接`);
        console.log(`   └─ 状态: 实时数据流已建立`);
        console.log(`${'='.repeat(60)}\n`);
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 超时处理
    if (initializedSymbols.size === 0) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`❌ [订阅失败] 🔥 FUTURES 组合流`);
      console.log(`   ├─ 错误信息: 初始化超时，没有交易对成功`);
      console.log(`   └─ 状态: 已加入重试队列`);
      console.log(`${'='.repeat(60)}\n`);
      this.addToFailedQueue('combined', 'futures', '初始化超时，没有交易对成功');
      return false;
    }
    
    // 部分成功
    console.log(`\n${'='.repeat(60)}`);
    console.log(`⚠️ [部分成功] 🔥 FUTURES 组合流`);
    console.log(`   ├─ 成功数量: ${initializedSymbols.size}/${symbols.length} 个交易对`);
    console.log(`   └─ 状态: 部分交易对初始化失败`);
    console.log(`${'='.repeat(60)}\n`);
    return true;
  }

  /**
   * 取消订阅
   */
  unsubscribeOrderBook(symbol, type) {
    const key = `${symbol}:${type}`;
    const ws = this.connections.get(key);
    
    if (ws) {
      ws.close();
      this.connections.delete(key);
      console.log(`🔌 已取消订阅: ${key}`);
    }

    // 清除PING定时器
    this.clearPingTimer(key);

    // 清除重连定时器
    const timer = this.reconnectTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(key);
    }
    
    // 清除订阅状态
    this.subscriptionStatus.delete(key);
    
    // 从失败队列移除
    this.failedSubs.delete(key);
  }

  /**
   * 获取所有活跃连接
   */
  getActiveConnections() {
    return Array.from(this.connections.keys());
  }

  /**
   * 取消所有订阅
   */
  unsubscribeAll() {
    // 先处理组合流
    if (this.connections.has('futures:combined')) {
      const ws = this.connections.get('futures:combined');
      if (ws) ws.close();
      this.connections.delete('futures:combined');
      this.clearPingTimer('futures:combined');
    }
    
    // 再处理单流
    for (const key of this.connections.keys()) {
      const [symbol, type] = key.split(':');
      this.unsubscribeOrderBook(symbol, type);
    }
  }

  /**
   * 获取失败队列（用于健康检查）
   */
  getFailedSubscriptions() {
    return Array.from(this.failedSubs.entries()).map(([key, info]) => ({
      key,
      ...info
    }));
  }

  /**
   * 获取订阅状态（用于健康检查）
   * 
   * 返回格式：
   * {
   *   key: string,
   *   isAlive: boolean,
   *   lastUpdate: number,
   *   subscriptionTime: number,
   *   ageSeconds: number,
   *   subscriptionAgeSeconds: number
   * }
   */
  getSubscriptionStatus() {
    const now = Date.now();
    return Array.from(this.subscriptionStatus.entries()).map(([key, status]) => ({
      key,
      ...status,
      ageSeconds: Math.floor((now - status.lastUpdate) / 1000),
      subscriptionAgeSeconds: Math.floor((now - (status.subscriptionTime || status.lastUpdate)) / 1000)
    }));
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentConnections = this.connectionAttempts.filter(time => time > oneMinuteAgo).length;
    
    return {
      activeConnections: this.connections.size,
      recentConnectionAttempts: recentConnections,
      connectionLimit: this.config.maxConnectionsPerMinute,
      resyncsInProgress: this.resyncInProgress.size,
      resyncingSymbols: Array.from(this.resyncInProgress.keys()),
      failedSubscriptions: this.failedSubs.size,
      failedList: this.getFailedSubscriptions(),
      config: this.config
    };
  }

  /**
   * 更新配置（允许动态调整）
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('📝 WebSocket配置已更新:', this.config);
  }
}

module.exports = new WebSocketService();
