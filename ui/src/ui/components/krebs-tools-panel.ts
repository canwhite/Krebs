import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { StorageManager, ApiKeyManager } from "../utils/storage.js";

interface Tool {
  name: string;
  description: string;
  category?: string;
  parameters?: Record<string, unknown>;
  requiresApiKey?: boolean;
  apiKeyName?: string;
}

/**
 * Tools Panel Component
 * Displays detailed information about all available tools
 */
@customElement("krebs-tools-panel")
export class KrebsToolsPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      overflow-y: auto;
    }

    .panel-container {
      padding: var(--spacing-lg);
      max-width: 1200px;
      margin: 0 auto;
    }

    .panel-header {
      margin-bottom: var(--spacing-xl);
    }

    .panel-title {
      font-size: var(--font-size-2xl);
      font-weight: 600;
      color: var(--color-text);
      margin-bottom: var(--spacing-sm);
    }

    .panel-description {
      font-size: var(--font-size-md);
      color: var(--color-text-secondary);
    }

    .category-section {
      margin-bottom: var(--spacing-xl);
    }

    .category-header {
      font-size: var(--font-size-lg);
      font-weight: 600;
      color: var(--color-text);
      margin-bottom: var(--spacing-md);
      padding-bottom: var(--spacing-sm);
      border-bottom: 2px solid var(--color-border);
      text-transform: capitalize;
    }

    .tools-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: var(--spacing-md);
    }

    .tool-card {
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--spacing-lg);
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .tool-card:hover {
      border-color: var(--color-primary);
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }

    .tool-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-md);
    }

    .tool-icon {
      font-size: var(--font-size-2xl);
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--color-bg);
      border-radius: var(--radius-md);
    }

    .tool-name {
      font-size: var(--font-size-lg);
      font-weight: 600;
      color: var(--color-text);
      flex: 1;
    }

    .tool-description {
      font-size: var(--font-size-md);
      color: var(--color-text-secondary);
      line-height: 1.6;
      margin-bottom: var(--spacing-md);
    }

    .tool-meta {
      display: flex;
      gap: var(--spacing-md);
      flex-wrap: wrap;
    }

    .tool-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 12px;
      background-color: var(--color-bg);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
    }

    .empty-state {
      text-align: center;
      padding: var(--spacing-2xl);
      color: var(--color-text-secondary);
    }

    .empty-state-icon {
      font-size: 64px;
      margin-bottom: var(--spacing-lg);
      opacity: 0.5;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 400px;
      color: var(--color-text-secondary);
      font-size: var(--font-size-lg);
    }

    .error {
      background-color: var(--color-error-bg);
      border: 1px solid var(--color-error);
      color: var(--color-error);
      padding: var(--spacing-lg);
      border-radius: var(--radius-lg);
      margin: var(--spacing-lg);
    }

    .api-key-section {
      margin-top: var(--spacing-md);
      padding: var(--spacing-md);
      background-color: var(--color-info-bg);
      border: 1px solid var(--color-info);
      border-radius: var(--radius-md);
    }

    .api-key-label {
      font-size: var(--font-size-sm);
      font-weight: 600;
      color: var(--color-text);
      margin-bottom: var(--spacing-xs);
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
    }

    .api-key-input-wrapper {
      display: flex;
      gap: var(--spacing-sm);
      align-items: center;
    }

    .api-key-input {
      flex: 1;
      padding: var(--spacing-sm) var(--spacing-md);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
      font-family: "Monaco", "Menlo", monospace;
      background-color: var(--color-bg);
      color: var(--color-text);
    }

    .api-key-input:focus {
      outline: none;
      border-color: var(--color-primary);
      box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb), 0.1);
    }

    .api-key-button {
      padding: var(--spacing-sm) var(--spacing-md);
      background-color: var(--color-primary);
      color: white;
      border: none;
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s ease;
    }

    .api-key-button:hover {
      background-color: var(--color-primary-hover);
    }

    .api-key-button:disabled {
      background-color: var(--color-text-secondary);
      cursor: not-allowed;
    }

    .api-key-status {
      font-size: var(--font-size-xs);
      margin-top: var(--spacing-xs);
    }

    .api-key-status.configured {
      color: var(--color-success);
    }

    .api-key-status.not-configured {
      color: var(--color-warning);
    }

    .api-key-message {
      font-size: var(--font-size-xs);
      margin-top: var(--spacing-xs);
    }

    .api-key-message.error {
      color: var(--color-error);
    }

    .api-key-message.success {
      color: var(--color-success);
    }
  `;

  @state()
  private tools: Tool[] = [];

  @state()
  private loading = true;

  @state()
  private error: string | null = null;

  @state()
  private apiKeyInputs: { [key: string]: string } = {};

  @state()
  private apiKeyErrors: { [key: string]: string } = {};

  @state()
  private apiKeySuccesses: { [key: string]: boolean } = {};

  connectedCallback(): void {
    super.connectedCallback();
    this.loadTools();
  }

  private async loadTools() {
    try {
      this.loading = true;
      const response = await fetch("/api/tools");
      if (!response.ok) throw new Error("Failed to load tools");

      const data = await response.json();
      this.tools = data.tools || [];

      // Initialize API key inputs with existing values
      this.apiKeyInputs = {};
      this.tools.forEach((tool) => {
        if (tool.requiresApiKey) {
          const existingKey = StorageManager.getToolApiKey(tool.name);
          this.apiKeyInputs[tool.name] = existingKey || "";
        }
      });
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Unknown error";
      console.error("Failed to load tools:", err);
    } finally {
      this.loading = false;
    }
  }

  private handleApiKeyChange(toolName: string, value: string) {
    this.apiKeyInputs = { ...this.apiKeyInputs, [toolName]: value };
    // Clear error for this tool
    if (this.apiKeyErrors[toolName]) {
      this.apiKeyErrors = { ...this.apiKeyErrors, [toolName]: "" };
    }
  }

  private async handleApiKeySave(toolName: string) {
    const apiKey = this.apiKeyInputs[toolName];

    // Validate
    const validation = ApiKeyManager.validateApiKeyFormat(toolName, apiKey);
    if (!validation.valid) {
      this.apiKeyErrors = {
        ...this.apiKeyErrors,
        [toolName]: validation.error || "Invalid API key",
      };
      return;
    }

    // Save to localStorage
    StorageManager.saveToolApiKey(toolName, apiKey);

    // Send to backend
    const keys: { [key: string]: string } = {};
    keys[toolName] = apiKey;
    const result = await ApiKeyManager.sendKeysToBackend();

    if (result.success) {
      this.apiKeySuccesses = { ...this.apiKeySuccesses, [toolName]: true };
      this.apiKeyErrors = { ...this.apiKeyErrors, [toolName]: "" };

      // Clear success message after 3 seconds
      setTimeout(() => {
        this.apiKeySuccesses = { ...this.apiKeySuccesses, [toolName]: false };
      }, 3000);
    } else {
      this.apiKeyErrors = {
        ...this.apiKeyErrors,
        [toolName]: result.error || "Failed to save",
      };
    }
  }

  private isApiKeyConfigured(toolName: string): boolean {
    return StorageManager.isToolApiKeyConfigured(toolName);
  }

  render() {
    if (this.loading) {
      return html`<div class="loading">加载中...</div>`;
    }

    if (this.error) {
      return html`<div class="error">加载失败: ${this.error}</div>`;
    }

    if (this.tools.length === 0) {
      return html`
        <div class="empty-state">
          <div class="empty-state-icon">🔧</div>
          <p>暂无工具</p>
        </div>
      `;
    }

    // Group tools by category
    const groupedTools = this.tools.reduce(
      (acc, tool) => {
        const category = tool.category || "other";
        if (!acc[category]) acc[category] = [];
        acc[category].push(tool);
        return acc;
      },
      {} as Record<string, Tool[]>,
    );

    return html`
      <div class="panel-container">
        <div class="panel-header">
          <h1 class="panel-title">工具箱</h1>
          <p class="panel-description">查看所有可用的AI工具及其功能说明</p>
        </div>

        ${Object.entries(groupedTools).map(
          ([category, tools]) => html`
            <div class="category-section">
              <h2 class="category-header">${category}</h2>
              <div class="tools-grid">
                ${tools.map(
                  (tool) => html`
                    <div class="tool-card">
                      <div class="tool-header">
                        <div class="tool-icon">🔧</div>
                        <div class="tool-name">${tool.name}</div>
                      </div>
                      <div class="tool-description">${tool.description}</div>
                      ${tool.parameters
                        ? html`
                            <div class="tool-meta">
                              <span class="tool-badge">
                                ${Object.keys(tool.parameters).length} 个参数
                              </span>
                            </div>
                          `
                        : ""}
                      ${tool.requiresApiKey
                        ? html`
                            <div class="api-key-section">
                              <div class="api-key-label">
                                🔑 API Key ${tool.apiKeyName ? `(${tool.apiKeyName})` : ""}
                                ${this.isApiKeyConfigured(tool.name)
                                  ? html`
                                      <span class="api-key-status configured"
                                        >✓ 已配置</span
                                      >
                                    `
                                  : html`
                                      <span
                                        class="api-key-status not-configured"
                                        >⚠️ 需要配置</span
                                      >
                                    `}
                              </div>
                              <div class="api-key-input-wrapper">
                                <input
                                  type="password"
                                  class="api-key-input"
                                  placeholder="输入您的 API Key..."
                                  .value=${this.apiKeyInputs[tool.name] || ""}
                                  @input=${(e: Event) => {
                                    const target = e.target as HTMLInputElement;
                                    this.handleApiKeyChange(
                                      tool.name,
                                      target.value,
                                    );
                                  }}
                                  @keydown=${(e: KeyboardEvent) => {
                                    if (e.key === "Enter") {
                                      this.handleApiKeySave(tool.name);
                                    }
                                  }}
                                />
                                <button
                                  class="api-key-button"
                                  ?disabled=${!this.apiKeyInputs[tool.name]}
                                  @click=${() =>
                                    this.handleApiKeySave(tool.name)}
                                >
                                  保存
                                </button>
                              </div>
                              ${this.apiKeyErrors[tool.name]
                                ? html`
                                    <div class="api-key-message error">
                                      ⚠️ ${this.apiKeyErrors[tool.name]}
                                    </div>
                                  `
                                : ""}
                              ${this.apiKeySuccesses[tool.name]
                                ? html`
                                    <div class="api-key-message success">
                                      ✓ API Key 保存成功！
                                    </div>
                                  `
                                : ""}
                            </div>
                          `
                        : ""}
                    </div>
                  `,
                )}
              </div>
            </div>
          `,
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "krebs-tools-panel": KrebsToolsPanel;
  }
}
