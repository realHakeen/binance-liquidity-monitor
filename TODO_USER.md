# ✅ 用户待办事项 - 深度监控修复

## 🎯 你需要做的 3 件事

### ✅ 第 1 步：安装 Redis（最重要！）

```bash
# macOS 用户
brew install redis

# 启动 Redis
brew services start redis

# 验证是否成功
redis-cli ping
```

**预期输出**: `PONG`

如果看到 `PONG`，说明 Redis 安装成功！

---

### ✅ 第 2 步：初始化历史数据

```bash
# 在项目根目录运行
cd /Users/hakeen.yang/Desktop/gadget/Binance_liquidity

# 运行初始化脚本
./init-depth-data.sh
```

**这个脚本会**:
- ✅ 为所有 19 个订阅的交易对保存数据
- ✅ 每隔 5 秒保存一次
- ✅ 总共保存 10 次
- ⏱️ 约需 **50 秒**完成

**预期输出**:
```
第 1/10 次保存...
  ✅ BTCUSDT (现货) 保存成功
  ✅ ETHUSDT (现货) 保存成功
  ...
✅ 初始化完成！
```

---

### ✅ 第 3 步：刷新浏览器

1. 打开浏览器访问: http://localhost:5173
2. 点击顶部的 **📈 深度变化** 标签
3. 从左侧列表选择交易对（如 BTCUSDT）
4. 🎉 现在应该能看到漂亮的深度变化图表了！

---

## 🔍 验证是否成功

运行诊断脚本：

```bash
./diagnose.sh
```

**成功的标志** - 应该看到：
```
✅ Redis 正在运行
✅ 后端服务正在运行
✅ 前端服务正在运行
✅ 有 19 个活跃订阅
✅ 找到历史数据
```

---

## 📊 界面使用

### 左侧面板
- 显示所有订阅的交易对
- 点击选择要查看的交易对
- 输入框可以添加新的订阅

### 右侧图表区
**时间范围选择**:
- 15分钟 (超短期)
- 1小时 (短期)
- 6小时 (中期)
- 24小时 (长期)

**图表类型**:
- 📊 深度 - 买卖盘总量（堆叠面积图）
- 📈 价差 - 价格差异百分比（线图）
- ⚖️ 不平衡 - 买卖盘压力对比（线图）

---

## ❓ 如果还是看不到数据

### 检查清单

1. **Redis 是否运行**?
   ```bash
   redis-cli ping
   ```
   应该返回 `PONG`

2. **后端是否运行**?
   ```bash
   curl http://localhost:3000/api/status
   ```
   应该返回 JSON 数据

3. **前端是否运行**?
   ```bash
   curl http://localhost:5173
   ```
   应该返回 HTML

4. **是否有订阅**?
   ```bash
   curl http://localhost:3000/api/orderbook/subscriptions
   ```
   应该显示订阅列表

5. **是否有历史数据**?
   ```bash
   curl 'http://localhost:3000/api/history/stats/BTCUSDT?type=spot'
   ```
   应该返回统计信息

### 手动触发保存（备选方案）

如果初始化脚本失败，可以手动触发：

```bash
# 为 BTCUSDT 保存数据
curl -X POST -H "Content-Type: application/json" \
  -d '{"type":"spot"}' \
  http://localhost:3000/api/history/save/BTCUSDT
```

多运行几次这个命令（间隔5秒），快速积累数据。

---

## 🚀 后续自动化

完成上述步骤后，系统会**自动**：

- ✅ 每 **30 秒**保存核心指标
- ✅ 每 **5 分钟**保存高级指标（包含深度）
- ✅ 保留最近 **1000 条**记录
- ✅ 数据持久化到 Redis（重启不丢失）
- ✅ 前端每 **10 秒**自动刷新图表

**你不需要再做任何事情！** 🎉

---

## 📚 更多帮助

| 问题 | 查看文档 |
|------|----------|
| Redis 安装问题 | [REDIS_SETUP.md](REDIS_SETUP.md) |
| 快速修复步骤 | [QUICK_FIX.md](QUICK_FIX.md) |
| 使用教程 | [DEPTH_MONITOR_GUIDE.md](DEPTH_MONITOR_GUIDE.md) |
| 技术细节 | [DEPTH_FIX_SUMMARY.md](DEPTH_FIX_SUMMARY.md) |

---

## 🎓 完成后你会看到

### 深度图表 (📊 深度)
- **绿色区域**: 买盘深度
- **红色区域**: 卖盘深度
- **Y轴**: 深度金额 (USDT)
- **X轴**: 时间

### 价差图表 (📈 价差)
- **黄色线**: 买卖价差百分比
- 价差越小，流动性越好

### 不平衡图表 (⚖️ 不平衡)
- **紫色线**: 买卖盘压力对比
- **正值**: 买盘更强（看涨）
- **负值**: 卖盘更强（看跌）

---

## ⏰ 预计完成时间

- 安装 Redis: **2-5 分钟**
- 初始化数据: **1 分钟**
- 验证结果: **30 秒**

**总计**: 约 **5-10 分钟**

---

## 🎉 完成后的奖励

你将获得：
- ✅ 实时深度变化可视化
- ✅ 多时间范围分析
- ✅ 三种图表类型
- ✅ 19+ 个交易对监控
- ✅ 自动数据收集
- ✅ 流畅的用户体验

---

**准备好了吗？开始吧！** 🚀

从第 1 步开始：
```bash
brew install redis
brew services start redis
redis-cli ping
```

**祝你好运！** 🍀

