# UI 服务 Dockerfile
# 多阶段构建：构建阶段 + nginx 运行

# ==========================================
# 阶段 1: 构建 UI
# ==========================================
FROM node:22-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./
COPY pnpm-lock.yaml ./

# 安装 pnpm
RUN npm install -g pnpm@latest

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建静态文件
RUN pnpm run build

# ==========================================
# 阶段 2: nginx 运行
# ==========================================
FROM nginx:alpine AS runtime

# 安装 curl 用于健康检查
RUN apk add --no-cache curl

# 从构建阶段复制静态文件
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
