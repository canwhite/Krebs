//TOOD，如果tools中有需要key的工具，就将key在item中预留出来等待我填写

llm provider写个抽象类，将和tool call耦合的部分写到那里
DONE:技能描述中可以包含任何命令行工具的使用说明。未来的版本将支持自动安装依赖。

# invoke api


//web search
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
     
//normal use
curl -X POST http://localhost:3000/api/chat \
    -H "Content-Type: application/json" \
    -d '{"id":"test","method":"chat.send","params":{"agentId":"default","sessionId":"test","message":"你都有哪些能力呢？"}}'


   curl -X POST http://localhost:3000/api/chat \
     -H "Content-Type: application/json" \
     -d '{
       "id": "test-001",
       "method": "chat.send",
       "params": {
         "agentId": "default",
         "message": "你好，请简单介绍一下自己",
         "sessionId": "test-verification-new"
       }
     }'
