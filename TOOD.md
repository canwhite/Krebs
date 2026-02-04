llm provider写个抽象类，将和tool call耦合的部分写到那里
技能描述中可以包含任何命令行工具的使用说明。未来的版本将支持自动安装依赖。

 curl -X POST http://localhost:3000/api/chat \
     -H "Content-Type: application/json" \
     -d '{
       "id": "test-006",
       "method": "chat.send",
       "params": {
         "agentId": "default",
         "message": "请使用bash工具执行curl命令，通过https://duckduckgo.com/html/?q=AI+news搜索AI新闻",
         "sessionId": "test-006"
       }
     }'
