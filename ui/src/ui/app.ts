import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

/**
 * Main Application Component
 * Provides the overall layout for Krebs AI Agent UI
 */
@customElement('krebs-app')
export class KrebsApp extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background-color: var(--color-bg); 
      color: var(--color-text);
    }

    header {
      background-color: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      padding: var(--spacing-md) var(--spacing-lg);
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: var(--shadow-sm);
    }

    .logo {
      font-size: var(--font-size-xl);
      font-weight: 600;
      color: var(--color-primary);
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .logo-icon {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, var(--color-primary), var(--color-info));
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
    }

    .header-actions {
      display: flex;
      gap: var(--spacing-md);
      align-items: center;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--color-success);
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }

    main {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .sidebar {
      width: 280px;
      background-color: var(--color-surface);
      border-right: 1px solid var(--color-border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-header {
      padding: var(--spacing-md);
      border-bottom: 1px solid var(--color-border);
      font-weight: 600;
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .sidebar-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--spacing-sm);
    }

    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    @media (max-width: 768px) {
      .sidebar {
        display: none;
      }
    }
  `;

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

  render() {
    return html`
      <header>
        <div class="logo">
          <div class="logo-icon">K</div>
          <span>Krebs AI</span>
        </div>
        <div class="header-actions">
          <div class="status-indicator">
            <div class="status-dot"></div>
            <span>${this.connected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </header>

      <main>
        <aside class="sidebar">
          <div class="sidebar-header">Tools</div>
          <div class="sidebar-content">
            <krebs-tools-list></krebs-tools-list>
          </div>

          <div class="sidebar-header">Skills</div>
          <div class="sidebar-content">
            <krebs-skills-list></krebs-skills-list>
          </div>
        </aside>

        <div class="content">
          <krebs-chat></krebs-chat>
        </div>
      </main>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'krebs-app': KrebsApp;
  }
}
