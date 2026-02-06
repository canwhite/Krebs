import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { StorageManager, ApiKeyManager } from "../utils/storage.js";

interface Tool {
  name: string;
  description: string;
  category?: string;
  requiresApiKey?: boolean;
  apiKeyName?: string;
}

/**
 * Tools List Component
 * Displays available tools in the sidebar
 */
@customElement("krebs-tools-list")
export class KrebsToolsList extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .tools-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .tool-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .tool-item:hover {
      background-color: var(--color-surface-hover);
    }

    .tool-icon {
      font-size: var(--font-size-lg);
    }

    .tool-info {
      flex: 1;
      min-width: 0;
    }

    .tool-name {
      font-weight: 600;
      font-size: var(--font-size-sm);
      margin-bottom: 2px;
    }

    .tool-description {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .empty-state {
      padding: var(--spacing-md);
      text-align: center;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--spacing-lg);
      color: var(--color-text-secondary);
    }

    .category-header {
      font-size: var(--font-size-xs);
      font-weight: 600;
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: var(--spacing-sm) var(--spacing-md);
      margin-top: var(--spacing-sm);
    }

    .api-key-indicator {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: auto;
    }

    .api-key-indicator.configured {
      background-color: var(--color-success-bg);
      color: var(--color-success);
    }

    .api-key-indicator.not-configured {
      background-color: var(--color-warning-bg);
      color: var(--color-warning);
    }

    .api-key-section {
      margin-top: var(--spacing-xs);
      padding: var(--spacing-xs);
      background-color: var(--color-surface);
      border-radius: var(--radius-sm);
    }

    .api-key-input {
      width: 100%;
      padding: var(--spacing-xs);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      font-family: "Monaco", "Menlo", monospace;
      margin-bottom: var(--spacing-xs);
    }

    .api-key-button {
      width: 100%;
      padding: var(--spacing-xs);
      background-color: var(--color-primary);
      color: white;
      border: none;
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      font-weight: 600;
      cursor: pointer;
    }

    .api-key-button:hover {
      background-color: var(--color-primary-hover);
    }

    .api-key-message {
      font-size: 10px;
      margin-top: var(--spacing-xs);
    }

    .api-key-message.success {
      color: var(--color-success);
    }

    .api-key-message.error {
      color: var(--color-error);
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
  private apiKeyMessages: {
    [key: string]: { type: "success" | "error"; text: string };
  } = {};

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

      // Initialize API key inputs
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

  private handleApiKeyInputChange(toolName: string, value: string) {
    this.apiKeyInputs = { ...this.apiKeyInputs, [toolName]: value };
  }

  private async handleApiKeySave(toolName: string) {
    const apiKey = this.apiKeyInputs[toolName];

    // Validate
    const validation = ApiKeyManager.validateApiKeyFormat(toolName, apiKey);
    if (!validation.valid) {
      this.apiKeyMessages = {
        ...this.apiKeyMessages,
        [toolName]: {
          type: "error",
          text: validation.error || "Invalid API key",
        },
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
      this.apiKeyMessages = {
        ...this.apiKeyMessages,
        [toolName]: { type: "success", text: "✓ Saved!" },
      };

      // Clear message after 2 seconds
      setTimeout(() => {
        this.apiKeyMessages = {
          ...this.apiKeyMessages,
          [toolName]: { type: "success", text: "" },
        };
      }, 2000);
    } else {
      this.apiKeyMessages = {
        ...this.apiKeyMessages,
        [toolName]: { type: "error", text: result.error || "Failed to save" },
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
      return html`<div class="empty-state">加载失败: ${this.error}</div>`;
    }

    if (this.tools.length === 0) {
      return html`<div class="empty-state">暂无工具</div>`;
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
      <div class="tools-list">
        ${Object.entries(groupedTools).map(
          ([category, tools]) => html`
            <div class="category-header">${category}</div>
            ${tools.map(
              (tool) => html`
                <div>
                  <div class="tool-item" title="${tool.description}">
                    <span class="tool-icon">🔧</span>
                    <div class="tool-info">
                      <div class="tool-name">${tool.name}</div>
                      <div class="tool-description">${tool.description}</div>
                    </div>
                    ${tool.requiresApiKey
                      ? html`
                          <span
                            class="api-key-indicator ${this.isApiKeyConfigured(
                              tool.name,
                            )
                              ? "configured"
                              : "not-configured"}"
                          >
                            ${this.isApiKeyConfigured(tool.name) ? "🔑" : "⚠️"}
                          </span>
                        `
                      : ""}
                  </div>

                  ${tool.requiresApiKey
                    ? html`
                        <div class="api-key-section">
                          <input
                            type="password"
                            class="api-key-input"
                            placeholder="Enter API Key..."
                            .value=${this.apiKeyInputs[tool.name] || ""}
                            @input=${(e: Event) => {
                              const target = e.target as HTMLInputElement;
                              this.handleApiKeyInputChange(
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
                            @click=${() => this.handleApiKeySave(tool.name)}
                          >
                            Save Key
                          </button>
                          ${this.apiKeyMessages[tool.name]?.text
                            ? html`
                                <div
                                  class="api-key-message ${this.apiKeyMessages[
                                    tool.name
                                  ].type}"
                                >
                                  ${this.apiKeyMessages[tool.name].text}
                                </div>
                              `
                            : ""}
                        </div>
                      `
                    : ""}
                </div>
              `,
            )}
          `,
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "krebs-tools-list": KrebsToolsList;
  }
}
