/**
 * WebSocket Client Manager
 * Manages WebSocket connection and event handling for streaming chat
 */

interface WebSocketEventHandlers {
  onChunk?: (chunk: string) => void;
  onToolStart?: (toolCallId: string, toolName: string, args: Record<string, unknown>) => void;
  onToolStatus?: (toolCallId: string, status: 'pending' | 'running' | 'completed' | 'failed') => void;
  onToolResult?: (toolCallId: string, result: unknown) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
  onConnected?: (clientId: string) => void;
}

interface WebSocketMessage {
  type: string;
  data?: unknown;
}

interface ChatChunkEventData {
  agentId: string;
  sessionId: string;
  chunk: string;
}

interface ToolEventData {
  agentId: string;
  sessionId: string;
  toolCallId: string;
  toolName?: string;
  args?: Record<string, unknown>;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
}

export class KrebsWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private handlers: WebSocketEventHandlers = {};
  private isManualClose = false;
  private _connectionState: 'connecting' | 'connected' | 'disconnected' = 'disconnected';
  private connectionResolvers: Array<(connected: boolean) => void> = [];

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Connect to WebSocket server
   */
  connect(handlers: WebSocketEventHandlers): void {
    this.handlers = handlers;
    this.isManualClose = false;
    this._connectionState = 'connecting';

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected to', this.url);
        this.reconnectAttempts = 0;
        this._connectionState = 'connected';
        this.connectionResolvers.forEach(resolve => resolve(true));
        this.connectionResolvers = [];
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Connection closed');
        this._connectionState = 'disconnected';
        this.connectionResolvers.forEach(resolve => resolve(false));
        this.connectionResolvers = [];
        if (!this.isManualClose && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnect();
        }
      };
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error);
      this.reconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.isManualClose = true;
    this._connectionState = 'disconnected';
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send chat message with streaming
   */
  sendChatMessage(agentId: string, sessionId: string, message: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const request = {
      id: this.generateRequestId(),
      method: 'chat.send',
      params: {
        agentId,
        sessionId,
        message,
        stream: true,
      },
    };

    this.ws.send(JSON.stringify(request));
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state
   */
  getConnectionState(): 'connecting' | 'connected' | 'disconnected' {
    return this._connectionState;
  }

  /**
   * Wait for connection with timeout
   */
  waitForConnection(timeout = 5000): Promise<boolean> {
    if (this.isConnected()) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(false);
      }, timeout);

      this.connectionResolvers.push((connected) => {
        clearTimeout(timer);
        resolve(connected);
      });
    });
  }

  /**
   * Get connection state
   */
  getReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  private handleMessage(message: WebSocketMessage): void {
    // Handle connected event
    if (message.type === 'connected') {
      const data = message.data as { clientId?: string };
      if (data.clientId && this.handlers.onConnected) {
        this.handlers.onConnected(data.clientId);
      }
      return;
    }

    // Handle chat events
    switch (message.type) {
      case 'chat.chunk': {
        const data = message.data as ChatChunkEventData;
        if (this.handlers.onChunk) {
          this.handlers.onChunk(data.chunk);
        }
        break;
      }

      case 'tool.start': {
        const data = message.data as ToolEventData;
        if (this.handlers.onToolStart && data.toolName && data.args) {
          this.handlers.onToolStart(data.toolCallId, data.toolName, data.args);
        }
        break;
      }

      case 'tool.status': {
        const data = message.data as ToolEventData;
        if (this.handlers.onToolStatus && data.status) {
          this.handlers.onToolStatus(data.toolCallId, data.status);
        }
        break;
      }

      case 'tool.result': {
        const data = message.data as ToolEventData;
        if (this.handlers.onToolResult && data.result !== undefined) {
          this.handlers.onToolResult(data.toolCallId, data.result);
        }
        break;
      }

      case 'chat.complete': {
        if (this.handlers.onComplete) {
          this.handlers.onComplete();
        }
        break;
      }

      case 'chat.error': {
        const data = message.data as { error?: string };
        if (this.handlers.onError && data.error) {
          this.handlers.onError(data.error);
        }
        break;
      }

      default:
        console.log('[WebSocket] Unknown message type:', message.type);
    }
  }

  private reconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[WebSocket] Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect(this.handlers);
    }, delay);
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Create a WebSocket client instance
 */
export function createWebSocketClient(url: string): KrebsWebSocketClient {
  return new KrebsWebSocketClient(url);
}

/**
 * Default WebSocket URL based on current location
 */
export function getDefaultWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}`;
}
