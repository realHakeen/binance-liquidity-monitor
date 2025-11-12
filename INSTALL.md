# 安装和部署指南

## 📋 系统要求

### 必需
- **Node.js**: >= 16.x
- **npm**: >= 7.x (通常随Node.js安装)
- **操作系统**: macOS, Linux, 或 Windows

### 检查版本
```bash
node --version   # 应显示 v16.x 或更高
npm --version    # 应显示 7.x 或更高
```

### 安装Node.js
如果尚未安装，请访问 [nodejs.org](https://nodejs.org) 下载并安装。

## 🚀 安装步骤

### 1. 获取代码

**方式A: Git克隆**
```bash
git clone <your-repo-url>
cd Binance_liquidity
```

**方式B: 下载压缩包**
1. 下载项目ZIP文件
2. 解压到目标目录
3. 打开终端，进入项目目录

### 2. 安装依赖

**推荐方式 - 一键安装:**
```bash
npm run install:all
```

**或者分别安装:**

```bash
# 后端依赖
cd backend
npm install
cd ..

# 前端依赖
cd frontend
npm install
cd ..
```

安装过程可能需要几分钟，请耐心等待。

### 3. 配置（可选）

后端默认配置已经可用，如需自定义：

```bash
cd backend
cp .env.example .env
# 编辑 .env 文件
```

## 🎮 运行项目

### 方式1: 一键启动（推荐）

**macOS/Linux:**
```bash
./start.sh
```

**Windows:**
```bash
start.bat
```

或双击 `start.bat` 文件

### 方式2: 手动启动

**终端1 - 启动后端:**
```bash
cd backend
npm start
# 或开发模式: npm run dev
```

后端将运行在 http://localhost:3000

**终端2 - 启动前端:**
```bash
cd frontend
npm run dev
```

前端将运行在 http://localhost:5173

### 3. 访问应用

打开浏览器访问: http://localhost:5173

## 🧪 测试安装

运行测试脚本验证后端API:

```bash
./test-api.sh
```

或手动测试:

```bash
# 测试健康检查
curl http://localhost:3000/health

# 测试API状态
curl http://localhost:3000/api/status

# 测试流动性数据（会调用Binance API）
curl http://localhost:3000/api/liquidity
```

## 📦 构建生产版本

### 前端构建

```bash
cd frontend
npm run build
```

构建产物在 `frontend/dist/` 目录

### 部署生产版本

1. **后端部署:**
   - 设置 `NODE_ENV=production`
   - 使用 PM2 或类似工具管理进程
   - 配置反向代理（Nginx等）

2. **前端部署:**
   - 将 `frontend/dist/` 目录部署到静态服务器
   - 配置API代理到后端地址

## 🔧 常见安装问题

### 问题1: npm install 失败

**解决方案:**
```bash
# 清除npm缓存
npm cache clean --force

# 删除node_modules和package-lock.json
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

### 问题2: 端口被占用

**症状:** Error: listen EADDRINUSE: address already in use

**解决方案:**

**macOS/Linux:**
```bash
# 查找占用端口的进程
lsof -i :3000
lsof -i :5173

# 杀死进程
kill -9 <PID>
```

**Windows:**
```cmd
# 查找占用端口的进程
netstat -ano | findstr :3000
netstat -ano | findstr :5173

# 杀死进程
taskkill /PID <PID> /F
```

**或者修改端口:**
- 后端: 修改 `backend/.env` 中的 `PORT`
- 前端: 修改 `frontend/vite.config.ts` 中的 `server.port`

### 问题3: CORS错误

**症状:** Access-Control-Allow-Origin 错误

**解决方案:**
- 确保后端已启动
- 检查 `frontend/vite.config.ts` 中的代理配置
- 确保后端 `server.js` 中启用了CORS

### 问题4: 模块未找到

**症状:** Cannot find module 'xxx'

**解决方案:**
```bash
# 确保在正确目录
cd backend  # 或 cd frontend

# 重新安装依赖
npm install
```

### 问题5: Node版本过低

**症状:** error Unsupported engine

**解决方案:**
1. 升级Node.js到16.x或更高版本
2. 或使用nvm管理多个Node版本

```bash
# 安装nvm (macOS/Linux)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 安装Node 18
nvm install 18
nvm use 18
```

## 🐳 Docker部署（高级）

如需使用Docker，可以创建以下文件:

**Dockerfile (后端):**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ .
EXPOSE 3000
CMD ["npm", "start"]
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
  
  frontend:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./frontend/dist:/usr/share/nginx/html
    depends_on:
      - backend
```

## 📝 环境变量

### 后端 (.env)

```env
# 服务器端口
PORT=3000

# 运行环境
NODE_ENV=development

# API限流配置
MAX_REQUESTS_PER_MINUTE=1200
REQUEST_WEIGHT_LIMIT=6000
```

### 前端

前端配置主要在 `vite.config.ts`:

```typescript
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
```

## 🔒 安全建议

### 开发环境
- 仅在本地网络运行
- 不要公开暴露端口

### 生产环境
- 使用HTTPS
- 配置防火墙
- 设置请求限制
- 使用环境变量管理配置
- 定期更新依赖
- 监控API使用情况

## 📊 性能优化

### 后端
- 使用PM2管理进程
- 启用集群模式
- 添加Redis缓存
- 配置日志轮转

### 前端
- 启用Gzip压缩
- 使用CDN
- 配置浏览器缓存
- 代码分割

## 🆘 获取帮助

如果遇到问题:

1. 查看错误日志
   - 后端: `backend.log`
   - 浏览器控制台

2. 查看文档
   - README.md
   - USAGE_GUIDE.md
   - SUMMARY.md

3. 检查系统要求

4. 提交Issue（包含错误信息和系统信息）

## 📞 支持

- GitHub Issues: <your-repo-url>/issues
- 文档: 查看项目根目录下的Markdown文件
- Binance API: https://binance-docs.github.io/apidocs/

---

安装成功后，请查看 **QUICKSTART.md** 开始使用！
