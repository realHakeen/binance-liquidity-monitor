/**
 * WebSocket配置文件
 * 用于管理Binance WebSocket连接参数和限制
 */

module.exports = {
  /**
   * WebSocket推送频率
   * 可选值: '100ms' | '1000ms'
   * 
   * 100ms: 高频率更新，适合高频交易场景，但会消耗更多带宽
   * 1000ms: 低频率更新，适合一般分析场景，节省带宽
   * 
   * ⚠️ Binance限制说明：
   * - 推送频率本身不受限制（这是服务器推送的频率）
   * - 但连接数和消息发送速率有限制
   */
  updateInterval: '100ms',

  /**
   * 重连延迟(毫秒)
   * 建议: 5000-10000ms
   * 
   * ⚠️ 不要设置太短，避免触发Binance的连接限制
   */
  reconnectDelay: 5000,

  /**
   * 最大重连延迟(毫秒)
   * 当多次重连失败时，可以使用指数退避策略
   */
  maxReconnectDelay: 60000,

  /**
   * PING间隔(毫秒)
   * 建议: 20000-30000ms
   * 
   * Binance要求:
   * - 服务器每20秒发送PING
   * - 客户端需在60秒内响应
   * - 我们主动发送PING以保持连接活跃
   */
  pingInterval: 30000,

  /**
   * 每分钟最大连接数
   * Binance限制: 每个IP每5分钟最多300次连接
   * 
   * 我们设置为50次/分钟 = 250次/5分钟，留有安全余量
   */
  maxConnectionsPerMinute: 50,

  /**
   * 每秒最大消息数
   * Binance限制: 每秒最多5条消息
   * 
   * 注意: 这包括PING/PONG和订阅/取消订阅消息
   * 数据推送不计入此限制
   */
  maxMessagesPerSecond: 5,

  /**
   * WebSocket URL配置
   */
  urls: {
    spot: 'wss://stream.binance.com:9443/ws',
    futures: 'wss://fstream.binance.com/ws'
  },

  /**
   * 连接超时(毫秒)
   */
  connectionTimeout: 10000,

  /**
   * 是否启用调试日志
   */
  debug: false
};

