#!/bin/bash

echo "🚀 krebs CN 安装脚本"
echo ""

# 检查 Node.js 版本
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    echo "❌ 需要 Node.js >= 22.0.0"
    echo "   当前版本: $(node -v)"
    exit 1
fi

echo "✅ Node.js 版本检查通过: $(node -v)"
echo ""

# 安装依赖
echo "📦 安装依赖..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败"
    exit 1
fi

echo ""
echo "✅ 安装完成！"
echo ""
echo "📝 下一步："
echo "   1. 复制 .env.example 到 .env"
echo "   2. 配置 API Key (ANTHROPIC_API_KEY 或 OPENAI_API_KEY)"
echo "   3. 运行: npm run dev"
echo ""
