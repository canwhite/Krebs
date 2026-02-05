import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

// Import all components to ensure custom elements are registered
import './chat/krebs-chat.js';
import './components/krebs-sidebar-nav.js';
import './components/krebs-tools-panel.js';
import './components/krebs-skills-panel.js';
import './components/krebs-tool-card.js';
import type { TabType } from './components/krebs-sidebar-nav.js';

/**
 * Main Application Component
 * Provides the overall layout for Krebs AI Agent UI
 */
@customElement('krebs-app')
export class KrebsApp extends LitElement {
  static styles = css`
    :host {
      display: flex;
      height: 100vh;
      background-color: var(--color-bg);
      color: var(--color-text);
      overflow: hidden;
    }

    .app-container {
      display: flex;
      width: 100%;
      height: 100%;
    }

    .sidebar {
      width: 260px;
      background-color: var(--color-surface);
      border-right: 1px solid var(--color-border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex-shrink: 0;
    }

    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
      background-color: var(--color-bg);
    }

    .content-panel {
      flex: 1;
      overflow: hidden;
      display: none;
    }

    .content-panel.active {
      display: flex;
      flex-direction: column;
    }

    @media (max-width: 768px) {
      .sidebar {
        width: 80px;
      }
    }
  `;

  @state()
  private activeTab: TabType = 'chat';

  @state()
  private connected = false;

  constructor() {
    super();
    this.checkConnection();
  }

  private async checkConnection() {
    try {
      const response = await fetch('/api/health');
      this.connected = response.ok;
    } catch {
      this.connected = false;
    }
    this.requestUpdate();
  }

  private handleTabChange(e: CustomEvent<TabType>) {
    this.activeTab = e.detail;
  }

  render() {
    return html`
      <div class="app-container">
        <aside class="sidebar">
          <krebs-sidebar-nav
            @tab-change=${this.handleTabChange}
          ></krebs-sidebar-nav>
        </aside>

        <div class="content">
          <div class="content-panel ${this.activeTab === 'chat' ? 'active' : ''}">
            <krebs-chat></krebs-chat>
          </div>

          <div class="content-panel ${this.activeTab === 'tools' ? 'active' : ''}">
            <krebs-tools-panel></krebs-tools-panel>
          </div>

          <div class="content-panel ${this.activeTab === 'skills' ? 'active' : ''}">
            <krebs-skills-panel></krebs-skills-panel>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'krebs-app': KrebsApp;
  }
}
