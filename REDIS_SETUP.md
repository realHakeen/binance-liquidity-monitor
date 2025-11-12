# ⚠️ Redis 设置指南

## 问题诊断

您的系统缺少 **Redis**，这就是为什么深度监控界面显示"没有历史数据"的原因。

## 🔧 解决方案

### macOS 安装 Redis

#### 方法 1：使用 Homebrew（推荐）

```bash
# 安装 Homebrew（如果还没有）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 Redis
brew install redis

# 启动 Redis 服务
brew services start redis

# 验证 Redis 是否运行
redis-cli ping
# 应该返回: PONG
```

#### 方法 2：使用 Docker（备选）

```bash
# 拉取 Redis 镜像
docker pull redis:latest

# 启动 Redis 容器
docker run -d --name redis -p 6379:6379 redis:latest

# 验证
docker exec -it redis redis-cli ping
# 应该返回: PONG
```

#### 方法 3：从源码编译

```bash
# 下载 Redis
curl -O http://download.redis.io/redis-stable.tar.gz
tar xzf redis-stable.tar.gz
cd redis-stable

# 编译
make

# 安装
sudo make install

# 启动 Redis
redis-server &
```

### Linux 安装 Redis

#### Ubuntu/Debian:
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

#### CentOS/RHEL:
```bash
sudo yum install redis
sudo systemctl start redis
sudo systemctl enable redis
```

### Windows 安装 Redis

1. 下载 Redis for Windows: https://github.com/microsoftarchive/redis/releases
2. 运行安装程序
3. 启动 Redis 服务

## ✅ 验证安装

运行以下命令验证 Redis 是否正常工作：

```bash
# 测试连接
redis-cli ping

# 检查 Redis 信息
redis-cli INFO server | head -10
```

## 🚀 重启系统

安装并启动 Redis 后：

1. **重启后端服务**（Redis 会自动连接）
   ```bash
   cd backend
   npm start
   ```

2. **初始化历史数据**
   ```bash
   # 从项目根目录运行
   ./init-depth-data.sh
   ```

3. **刷新前端页面**
   - 打开 http://localhost:5173
   - 点击 "📈 深度变化" 标签
   - 现在应该能看到数据了！

## 📊 检查数据

运行检查脚本查看数据状态：

```bash
./check-depth-data.sh
```

## 🔍 故障排除

### Redis 无法启动

1. **检查端口占用**：
   ```bash
   lsof -i :6379
   ```

2. **使用自定义端口**：
   ```bash
   redis-server --port 6380
   ```
   
   然后修改 `backend/src/services/redisService.js`：
   ```javascript
   this.client = redis.createClient({
     socket: { host: 'localhost', port: 6380 }
   });
   ```

### 连接被拒绝

1. **检查 Redis 配置**：
   ```bash
   redis-cli CONFIG GET bind
   redis-cli CONFIG GET protected-mode
   ```

2. **允许外部连接**（如果需要）：
   ```bash
   redis-cli CONFIG SET protected-mode no
   ```

### 权限问题

```bash
# 给脚本添加执行权限
chmod +x check-depth-data.sh
chmod +x init-depth-data.sh
```

## 📝 配置说明

系统默认 Redis 配置：
- **主机**: localhost
- **端口**: 6379
- **密码**: 无

如需修改，编辑 `backend/src/services/redisService.js` 文件。

## 🎯 预期结果

Redis 正常运行后，系统会：
- ✅ 自动保存核心指标（每30秒）
- ✅ 自动保存高级指标（每5分钟）
- ✅ 在深度监控界面显示历史图表
- ✅ 支持多个时间范围查看

## 💡 提示

- Redis 数据会持久化到磁盘
- 重启 Redis 不会丢失数据
- 可以使用 `redis-cli` 手动查看数据：
  ```bash
  redis-cli KEYS "ts:*"
  redis-cli ZRANGE ts:core:spot:BTCUSDT 0 5
  ```

---

**需要帮助？**
- Redis 官方文档: https://redis.io/docs/
- 项目 Issues: 提交到项目仓库

