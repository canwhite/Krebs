/**
 * WebSocket 测试脚本 - 测试工具调用
 */
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
  console.log('[Test] WebSocket connected');

  // 发送聊天请求
  const request = {
    id: 'test_001',
    method: 'chat.send',
    params: {
      agentId: 'default',
      sessionId: 'test_session_' + Date.now(),
      message: '帮我搜索最新的AI信息，然后总结最有趣的前三条',
      stream: true,
    },
  };

  console.log('[Test] Sending request:', JSON.stringify(request, null, 2));
  ws.send(JSON.stringify(request));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());

  switch (message.type) {
    case 'connected':
      console.log('[Test] ✅ Connected:', message.data.clientId);
      break;

    case 'chat.chunk':
      process.stdout.write(message.data.chunk);
      break;

    case 'tool.start':
      console.log('\n[Test] 🔧 Tool START:', message.data.toolName);
      console.log('[Test]    Args:', JSON.stringify(message.data.args, null, 2));
      break;

    case 'tool.status':
      console.log('[Test] 📊 Tool Status:', message.data.status);
      break;

    case 'tool.result':
      console.log('[Test] ✅ Tool Result received');
      const result = message.data.result;
      if (typeof result === 'string') {
        console.log('[Test]    Result preview:', result.substring(0, 200) + '...');
      } else {
        console.log('[Test]    Result:', JSON.stringify(result).substring(0, 200) + '...');
      }
      break;

    case 'chat.complete':
      console.log('\n[Test] ✅ Chat complete');
      ws.close();
      break;

    case 'chat.error':
      console.error('[Test] ❌ Error:', message.data.error);
      ws.close();
      break;

    default:
      console.log('[Test] Unknown event:', message.type, message.data);
  }
});

ws.on('error', (error) => {
  console.error('[Test] ❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('\n[Test] WebSocket closed');
  process.exit(0);
});

// 超时保护
setTimeout(() => {
  console.error('[Test] ❌ Timeout after 60 seconds');
  ws.close();
  process.exit(1);
}, 60000);
