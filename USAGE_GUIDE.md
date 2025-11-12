# 使用说明和最佳实践

## 🚀 启动流程

### 1. 第一次安装
```bash
# 克隆或下载项目后
cd Binance_liquidity

# 安装所有依赖
npm run install:all

# 或者分别安装
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. 启动服务

**推荐方式 - 使用启动脚本:**
```bash
# macOS/Linux
./start.sh

# Windows
start.bat
```

**手动启动:**
```bash
# 终端1 - 启动后端
cd backend
npm start        # 生产模式
# 或
npm run dev      # 开发模式（nodemon 自动重启）

# 终端2 - 启动前端
cd frontend
npm run dev      # Vite 开发服务器
```

### 3. 访问应用
- **前端界面**: http://localhost:5173
- **后端API**: http://localhost:3000
- **健康检查**: http://localhost:3000/health

## 📊 功能使用

### 主界面功能

1. **自动刷新**
   - 默认开启，60秒间隔
   - 可选：30秒、60秒、2分钟、5分钟
   - 建议：≥60秒以减少API调用

2. **手动刷新**
   - 点击"🔄 手动刷新"按钮
   - 如果触发限流会被禁用

3. **API状态监控**
   - 绿色 ✅：正常运行
   - 黄色 ⏸️：触发限流（429）
   - 红色 🚫：IP被封禁（418）

4. **权重监控**
   - 显示当前使用量 / 6000
   - 绿色：< 50%（安全）
   - 黄色：50-80%（警告）
   - 红色：> 80%（危险）

### 数据表格说明

#### 表格列说明
- **交易对**: 币种名称（如 BTCUSDT）+ 24小时交易量
- **市场**: 现货 / 永续
- **档位**: 使用的深度档位数（BTC/ETH为500，其他为100）
- **24h涨跌**: 24小时价格变化百分比
- **最佳买价/卖价**: 当前最优买卖价格
- **价差**: 买卖价差百分比（越小越好）
- **买盘/卖盘深度**: 指定档位内的总交易额（USDT）
- **总深度**: 买盘+卖盘总和
- **10K滑点**: 以$10,000交易时的价格偏离
- **不平衡**: 买卖盘深度差异（正值=买盘深，负值=卖盘深）
- **评分**: 综合流动性评分（0-100）

#### 颜色含义
- **绿色**: 正值、高评分、上涨
- **黄色**: 中等评分、价差
- **红色**: 负值、低评分、下跌
- **蓝色**: 总深度

## ⚠️ 限流处理

### 429 错误（触发限流）

**现象:**
- 状态栏显示黄色警告
- 显示等待倒计时
- 刷新按钮被禁用

**处理方式:**
1. 系统自动暂停所有请求
2. 根据 Retry-After header 等待
3. 倒计时结束后自动恢复
4. **用户无需操作**

**预防措施:**
- 增加刷新间隔（建议60秒以上）
- 使用缓存数据（30秒内）
- 监控权重使用情况

### 418 错误（IP被封禁）

**现象:**
- 状态栏显示红色警告
- 显示"IP已被封禁"
- 所有请求停止

**处理方式:**
1. 立即停止使用
2. 检查是否有其他程序在调用Binance API
3. 等待一段时间（通常几小时）
4. 或更换IP地址
5. 点击"重置"按钮重置系统状态

**联系Binance:**
如果长时间被封，可能需要联系Binance支持。

### 权重管理

**权重分配:**
- 获取24小时ticker: 40 权重
- 获取100档深度: 5 权重
- 获取500档深度: 10 权重

**每次完整刷新权重:**
- 获取热门交易对: 40
- 10个交易对（假设2个BTC/ETH + 8个其他）:
  - 现货: 2×10 + 8×5 = 60
  - 永续: 2×10 + 8×5 = 60
- **总计**: 约 160 权重

**建议:**
- 60秒刷新: 2,560 权重/分钟（安全 ✅）
- 30秒刷新: 5,120 权重/分钟（接近限制 ⚠️）
- 15秒刷新: 10,240 权重/分钟（会触发限流 ❌）

## 🔧 API 端点

### 获取流动性数据
```bash
curl http://localhost:3000/api/liquidity
```

**响应:**
```json
{
  "success": true,
  "cached": false,
  "timestamp": 1699999999999,
  "data": [...],
  "errors": [],
  "apiStatus": {
    "isBlocked": false,
    "isPaused": false,
    "usedWeight": 160,
    "canMakeRequest": true
  }
}
```

### 获取特定交易对深度
```bash
# 现货
curl http://localhost:3000/api/depth/BTCUSDT?type=spot

# 永续
curl http://localhost:3000/api/depth/BTCUSDT?type=futures
```

### 获取API状态
```bash
curl http://localhost:3000/api/status
```

### 重置API状态
```bash
curl -X POST http://localhost:3000/api/reset
```

### 清除缓存
```bash
curl -X POST http://localhost:3000/api/clear-cache
```

## 🐛 故障排查

### 问题1: 前端无法连接后端

**症状:** 前端显示网络错误

**解决:**
1. 检查后端是否运行: `curl http://localhost:3000/health`
2. 检查端口3000是否被占用: `lsof -i :3000` (macOS/Linux)
3. 查看后端日志: `backend.log`
4. 重启后端服务

### 问题2: 频繁触发429错误

**症状:** 经常看到限流警告

**解决:**
1. 增加刷新间隔到60秒或更长
2. 检查是否有其他程序在使用Binance API
3. 检查权重使用情况
4. 等待权重重置（每分钟）

### 问题3: 收到418错误

**症状:** IP被封禁

**解决:**
1. 停止所有API调用
2. 等待几小时
3. 更换IP（使用VPN或代理）
4. 点击"重置"按钮
5. 联系Binance支持

### 问题4: 数据不更新

**症状:** 表格数据长时间不变

**解决:**
1. 检查自动刷新是否开启
2. 检查API状态（是否被限流）
3. 手动点击刷新按钮
4. 清除缓存并刷新

### 问题5: 某些交易对没有永续数据

**症状:** 永续合约行为空

**解决:**
- 这是正常的，不是所有交易对都有永续合约
- 系统会自动跳过

## 💡 最佳实践

### 1. 刷新频率设置
- **实时监控**: 60秒（推荐）
- **日常使用**: 2-5分钟
- **避免**: < 30秒

### 2. 权重管理
- 监控权重使用情况
- 接近80%时暂停刷新
- 等待权重重置

### 3. 缓存使用
- 30秒内使用缓存数据
- 减少不必要的API调用
- 提高响应速度

### 4. 错误处理
- 遇到429：等待自动恢复
- 遇到418：立即停止，检查原因
- 定期检查API状态

### 5. 数据分析
- 关注流动性评分（高=好）
- 观察价差（低=好）
- 注意深度不平衡（市场情绪）
- 比较现货vs永续（套利机会）

## 📈 高级使用

### 自定义配置

**后端配置** (`backend/.env`):
```env
PORT=3000
NODE_ENV=development
MAX_REQUESTS_PER_MINUTE=1200
REQUEST_WEIGHT_LIMIT=6000
```

**修改监控币种数量:**
修改 `backend/src/api/binance.js`:
```javascript
// 改为前20名
async getTop24hVolume(limit = 20)
```

**修改深度档位:**
修改 `backend/src/api/binance.js`:
```javascript
getDepthLimit(symbol) {
  // 所有币种都使用500档
  return 500;
}
```

### 开发模式

**后端热重载:**
```bash
cd backend
npm run dev  # 使用 nodemon
```

**前端热更新:**
```bash
cd frontend
npm run dev  # Vite 自动刷新
```

## 🔐 安全建议

1. **不要频繁调用API**: 遵守限流规则
2. **监控权重使用**: 避免被封禁
3. **使用缓存**: 减少API调用
4. **定期检查状态**: 及时发现问题
5. **备份IP**: 准备备用网络

## 📞 获取帮助

如遇到问题:
1. 查看 README.md
2. 查看 backend.log
3. 查看浏览器控制台
4. 查看 Binance API 文档
5. 提交 Issue

## 🔗 相关资源

- [Binance API 文档](https://binance-docs.github.io/apidocs/spot/en/)
- [Binance 限流规则](https://binance-docs.github.io/apidocs/spot/en/#limits)
- [React 文档](https://react.dev/)
- [Express 文档](https://expressjs.com/)

