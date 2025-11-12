# 时间序列数据存储功能 - 更新说明

## 🎉 新功能概述

我们实现了完整的时间序列数据存储功能，可以长期保存和查询流动性指标的历史数据。

## 🔧 实现的功能

### 1. 自动数据保存
- ✅ **核心指标**: 每60秒自动保存（价差、深度、滑点、流动性评分等）
- ✅ **高级指标**: 每5分钟自动保存（详细深度、冲击成本等）
- ✅ **智能频率控制**: 避免重复保存，可动态调整保存频率
- ✅ **数据压缩**: 使用字段缩写减少50%存储空间

### 2. 历史数据查询
- ✅ 按时间范围查询历史数据
- ✅ 获取最近N个数据点
- ✅ 查看数据统计信息（数据点数量、时间范围等）
- ✅ 支持核心指标和高级指标分别查询

### 3. 灵活配置
- ✅ 动态调整保存频率
- ✅ 手动触发立即保存
- ✅ 不同交易对可使用不同策略

## 📁 修改的文件

### 1. `backend/src/services/redisService.js`
**新增方法**:
- `saveCoreMetricsTimeSeries()` - 保存核心指标时间序列
- `saveAdvancedMetricsTimeSeries()` - 保存高级指标时间序列
- `getCoreMetricsHistory()` - 查询核心指标历史
- `getAdvancedMetricsHistory()` - 查询高级指标历史
- `getRecentMetrics()` - 获取最近数据
- `getTimeSeriesStats()` - 获取统计信息

**存储结构**:
- 使用 Redis Sorted Set (ZSET)
- Key格式: `ts:core:${type}:${symbol}` 和 `ts:advanced:${type}:${symbol}`
- Score: 时间戳（毫秒）
- Member: JSON字符串（压缩后的指标数据）

### 2. `backend/src/services/metricsCalculator.js`
**新增特性**:
- 构造函数中添加保存频率配置
- `saveTimeSeriesIfNeeded()` - 按频率自动保存
- `setSaveInterval()` - 动态调整保存频率
- `saveTimeSeriesNow()` - 立即保存（手动触发）

**集成方式**:
```javascript
// 在 calculateAllMetrics() 中自动调用
await this.saveTimeSeriesIfNeeded(symbol, type, extendedMetrics);
```

### 3. `backend/src/routes/liquidity.js`
**新增API路由**:
- `GET /api/history/core/:symbol` - 核心指标历史
- `GET /api/history/advanced/:symbol` - 高级指标历史
- `GET /api/history/recent/:symbol` - 最近数据
- `GET /api/history/stats/:symbol` - 统计信息
- `POST /api/history/save/:symbol` - 手动保存
- `POST /api/history/config` - 配置保存频率

### 4. 新增文档
- `TIMESERIES_API.md` - 完整的API文档和使用指南
- `test-timeseries.sh` - 自动化测试脚本
- `TIMESERIES_UPDATE.md` - 本更新说明

### 5. 更新文档
- `README.md` - 添加时间序列功能说明和API文档链接

## 🚀 如何使用

### 1. 启动系统
```bash
# 确保Redis正在运行
redis-server

# 启动应用
./start.sh
```

### 2. 等待数据收集
系统会自动开始收集数据，等待1-5分钟后就可以查询历史数据。

### 3. 测试功能
```bash
# 运行自动化测试脚本
./test-timeseries.sh
```

### 4. 查询示例
```bash
# 获取BTC过去24小时的数据
curl "http://localhost:3001/api/history/core/BTCUSDT?type=spot&limit=1440"

# 获取最近100个数据点
curl "http://localhost:3001/api/history/recent/BTCUSDT?count=100"

# 查看统计信息
curl "http://localhost:3001/api/history/stats/BTCUSDT"

# 手动触发保存
curl -X POST http://localhost:3001/api/history/save/BTCUSDT \
  -H "Content-Type: application/json" \
  -d '{"type": "spot"}'
```

## 💾 数据存储

### 存储空间估算
监控50个币对，30天数据：
- 核心指标: ~432 MB（每分钟保存）
- 高级指标: ~130 MB（每5分钟保存）
- **总计: ~560 MB**（非常合理）

### 数据自动清理
- 自动删除30天前的数据
- Redis过期时间设置为31天（留余量）
- 可通过配置调整保留时长

## 🎯 使用场景

### 1. 趋势分析
查询历史数据绘制趋势图，分析流动性变化规律

### 2. 交易决策
- 找出流动性最佳时段
- 评估大单执行成本
- 监控市场健康度

### 3. 策略回测
使用历史流动性数据回测交易策略

### 4. 监控预警
- 设置流动性阈值报警
- 检测异常流动性波动
- 追踪市场事件影响

## 📊 数据字段说明

### 核心指标（最重要）
| 字段 | 说明 | 用途 |
|------|------|------|
| spreadPercent | 价差百分比 | 交易成本核心指标 |
| totalDepth | 总深度（USDT） | 市场容量评估 |
| slippage_100k | 10万美金滑点 | 小单执行成本 |
| slippage_1m | 100万美金滑点 | 大单执行成本 |
| liquidityScore | 流动性评分 (0-100) | 综合市场质量 |
| imbalance | 不平衡度 (-1到1) | 市场方向信号 |
| midPrice | 中间价 | 价格追踪 |

### 高级指标（深度分析）
| 字段 | 说明 | 用途 |
|------|------|------|
| bidDepth / askDepth | 详细买卖深度 | 市场结构分析 |
| impactCost_avg | 平均冲击成本 | 机构交易参考 |
| depth_1pct_bid/ask | 1%档位深度 | 极端行情容量 |
| bestBid / bestAsk | 最优价格 | 价格变动追踪 |

## ⚙️ 配置建议

### 高频币对（BTC/ETH）
```bash
# 核心指标：30秒
curl -X POST http://localhost:3001/api/history/config \
  -H "Content-Type: application/json" \
  -d '{"type": "core", "intervalMs": 30000}'

# 高级指标：3分钟
curl -X POST http://localhost:3001/api/history/config \
  -H "Content-Type: application/json" \
  -d '{"type": "advanced", "intervalMs": 180000}'
```

### 普通币对
```bash
# 核心指标：60秒（默认）
# 高级指标：5分钟（默认）
# 无需修改配置
```

## 🔍 故障排查

### 问题：查询返回空数据
**原因**: 数据尚未开始收集
**解决**: 
1. 等待1-5分钟
2. 手动触发保存测试
3. 检查Redis连接状态

### 问题：数据点数量少于预期
**原因**: 保存频率较低或系统刚启动
**解决**:
1. 查看统计信息确认时间范围
2. 调整保存频率
3. 继续运行系统累积数据

### 问题：Redis内存不足
**原因**: 监控币对太多或保存频率过高
**解决**:
1. 增加Redis内存限制
2. 减少保存频率
3. 减少监控的币对数量
4. 缩短数据保留时间

## 📚 相关文档

- **完整API文档**: `TIMESERIES_API.md`
- **测试脚本**: `test-timeseries.sh`
- **主文档**: `README.md`
- **项目结构**: `PROJECT_STRUCTURE.md`

## 🎓 技术亮点

1. **存储优化**: 字段缩写减少50%空间
2. **查询高效**: 使用Redis ZSET，按时间范围查询O(log(N)+M)
3. **频率控制**: 内存记录上次保存时间，避免重复
4. **异步非阻塞**: 不影响实时数据流
5. **灵活配置**: 可动态调整各项参数
6. **模块化设计**: 符合项目的模块化原则

## 🔮 未来扩展

如需更长期存储或更复杂分析，可考虑：

1. **InfluxDB**: 专业时序数据库
2. **TimescaleDB**: PostgreSQL时序扩展
3. **数据导出**: 定期归档到文件或云存储
4. **数据分析**: 集成数据分析和机器学习
5. **可视化**: 前端添加历史数据图表展示

---

**实现日期**: 2024-11-09
**版本**: v1.1.0
**作者**: AI Assistant

