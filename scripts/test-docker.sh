#!/bin/bash
# Docker 构建和启动测试脚本

set -e

echo "========================================="
echo "Krebs Docker 测试脚本"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查 Docker 是否安装
check_docker() {
    echo -e "${YELLOW}检查 Docker 安装...${NC}"
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker 未安装！${NC}"
        echo "请先安装 Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi
    echo -e "${GREEN}✅ Docker 已安装${NC}"
    docker --version
    echo ""
}

# 检查 Docker Compose 是否安装
check_docker_compose() {
    echo -e "${YELLOW}检查 Docker Compose 安装...${NC}"
    if ! docker compose version &> /dev/null; then
        echo -e "${RED}❌ Docker Compose 未安装！${NC}"
        echo "请先安装 Docker Compose"
        exit 1
    fi
    echo -e "${GREEN}✅ Docker Compose 已安装${NC}"
    docker compose version
    echo ""
}

# 检查 .env 文件
check_env_file() {
    echo -e "${YELLOW}检查环境变量文件...${NC}"
    if [ ! -f .env ]; then
        echo -e "${YELLOW}⚠️  .env 文件不存在，从 .env.example 复制...${NC}"
        if [ -f .env.example ]; then
            cp .env.example .env
            echo -e "${GREEN}✅ 已创建 .env 文件${NC}"
            echo -e "${YELLOW}⚠️  请编辑 .env 文件，添加您的 API Key${NC}"
        else
            echo -e "${RED}❌ .env.example 文件不存在！${NC}"
            exit 1
        fi
    else
        echo -e "${GREEN}✅ .env 文件已存在${NC}"
    fi
    echo ""
}

# 检查端口占用
check_ports() {
    echo -e "${YELLOW}检查端口占用...${NC}"

    # 检查端口 3000
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  端口 3000 已被占用${NC}"
    else
        echo -e "${GREEN}✅ 端口 3000 可用${NC}"
    fi

    # 检查端口 3001
    if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  端口 3001 已被占用${NC}"
    else
        echo -e "${GREEN}✅ 端口 3001 可用${NC}"
    fi

    # 检查端口 8080
    if lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  端口 8080 已被占用${NC}"
    else
        echo -e "${GREEN}✅ 端口 8080 可用${NC}"
    fi
    echo ""
}

# 构建 Docker 镜像
build_images() {
    echo -e "${YELLOW}构建 Docker 镜像...${NC}"
    docker compose build
    echo -e "${GREEN}✅ 镜像构建完成${NC}"
    echo ""
}

# 启动服务
start_services() {
    echo -e "${YELLOW}启动服务...${NC}"
    docker compose up -d
    echo -e "${GREEN}✅ 服务已启动${NC}"
    echo ""
}

# 等待服务健康
wait_for_health() {
    echo -e "${YELLOW}等待服务健康检查...${NC}"

    # 等待 Gateway 健康检查
    echo -n "等待 Gateway 服务"
    for i in {1..30}; do
        if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
            echo -e " ${GREEN}✅${NC}"
            break
        fi
        echo -n "."
        sleep 2
    done

    # 等待 UI 服务
    echo -n "等待 UI 服务"
    for i in {1..30}; do
        if curl -sf http://localhost:8080 >/dev/null 2>&1; then
            echo -e " ${GREEN}✅${NC}"
            break
        fi
        echo -n "."
        sleep 2
    done
    echo ""
}

# 测试服务
test_services() {
    echo -e "${YELLOW}测试服务...${NC}"

    # 测试 Gateway 健康检查
    echo -n "测试 Gateway /health 端点... "
    if curl -sf http://localhost:3000/health | grep -q "ok"; then
        echo -e "${GREEN}✅ 通过${NC}"
    else
        echo -e "${RED}❌ 失败${NC}"
    fi

    # 测试 UI 服务
    echo -n "测试 UI 服务... "
    if curl -sf http://localhost:8080 >/dev/null; then
        echo -e "${GREEN}✅ 通过${NC}"
    else
        echo -e "${RED}❌ 失败${NC}"
    fi

    echo ""
}

# 显示服务状态
show_status() {
    echo -e "${YELLOW}服务状态：${NC}"
    docker compose ps
    echo ""
}

# 显示访问信息
show_access_info() {
    echo "========================================="
    echo -e "${GREEN}🎉 Krebs Docker 部署成功！${NC}"
    echo "========================================="
    echo ""
    echo "服务访问地址："
    echo "  📱 Web UI:       http://localhost:8080"
    echo "  🔌 API 端点:     http://localhost:3000/health"
    echo "  🌐 WebSocket:    ws://localhost:3001"
    echo ""
    echo "常用命令："
    echo "  查看日志:       docker compose logs -f"
    echo "  停止服务:       docker compose down"
    echo "  重启服务:       docker compose restart"
    echo ""
    echo "详细文档: docs/DOCKER.md"
    echo "========================================="
}

# 清理函数
cleanup() {
    echo ""
    echo -e "${YELLOW}清理测试环境...${NC}"
    docker compose down
    echo -e "${GREEN}✅ 清理完成${NC}"
}

# 主流程
main() {
    check_docker
    check_docker_compose
    check_env_file
    check_ports

    echo -e "${YELLOW}是否继续构建和启动服务？ (y/n)${NC}"
    read -r response

    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        build_images
        start_services
        wait_for_health
        test_services
        show_status
        show_access_info
    else
        echo -e "${YELLOW}已取消${NC}"
        exit 0
    fi
}

# 捕获 Ctrl+C
trap cleanup EXIT

# 运行主流程
main
