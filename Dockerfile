# Gateway 服务 Dockerfile
# 多阶段构建：构建阶段 + 运行阶段

# ==========================================
# 阶段 1: 构建依赖
# ==========================================
FROM node:22-alpine AS builder

# 设置工作目录,like cd /app
WORKDIR /app

# 复制 package 文件
COPY package*.json ./
COPY pnpm-lock.yaml ./

# 安装 pnpm
RUN npm install -g pnpm@latest

# 安装依赖
RUN pnpm install --frozen-lockfile

# ==========================================
# 阶段 2: 构建 TypeScript
# ==========================================
FROM builder AS build

# 复制源代码
COPY . .

# 构建 TypeScript
RUN pnpm run build

# ==========================================
# 阶段 3: 运行时镜像
# ==========================================
FROM node:22-alpine AS runtime

# 安装 dumb-init 用于信号处理
RUN apk add --no-cache dumb-init

# 创建非 root 用户
RUN addgroup -g 1001 -S krebs && \
    adduser -S -u 1001 -G krebs krebs

# 设置工作目录
WORKDIR /app

# 从构建阶段复制 node_modules 和 dist
COPY --from=build --chown=krebs:krebs /app/node_modules ./node_modules
COPY --from=build --chown=krebs:krebs /app/dist ./dist
COPY --from=build --chown=krebs:krebs /app/package*.json ./

# 创建数据目录
RUN mkdir -p /app/data /app/data/memory && \
    chown -R krebs:krebs /app/data

# 切换到非 root 用户
USER krebs

# 暴露端口
# 3000: HTTP API
# 3001: WebSocket
EXPOSE 3000 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# 使用 dumb-init 启动
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
