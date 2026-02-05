import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

interface Skill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category?: string;
}

/**
 * Skills Panel Component
 * Displays detailed information about all available skills
 */
@customElement('krebs-skills-panel')
export class KrebsSkillsPanel extends LitElement {
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

    .skills-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: var(--spacing-md);
    }

    .skill-card {
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--spacing-lg);
      transition: all 0.2s ease;
      position: relative;
    }

    .skill-card.enabled {
      border-color: var(--color-success);
    }

    .skill-card:hover {
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }

    .skill-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-md);
    }

    .skill-icon {
      font-size: var(--font-size-2xl);
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--color-bg);
      border-radius: var(--radius-md);
    }

    .skill-icon.enabled {
      background-color: var(--color-success-bg);
    }

    .skill-name {
      font-size: var(--font-size-lg);
      font-weight: 600;
      color: var(--color-text);
      flex: 1;
    }

    .skill-status {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background-color: var(--color-border);
    }

    .skill-status.enabled {
      background-color: var(--color-success);
      box-shadow: 0 0 8px var(--color-success);
    }

    .skill-description {
      font-size: var(--font-size-md);
      color: var(--color-text-secondary);
      line-height: 1.6;
      margin-bottom: var(--spacing-md);
    }

    .skill-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--spacing-sm);
    }

    .toggle-button {
      padding: var(--spacing-sm) var(--spacing-lg);
      border-radius: var(--radius-md);
      border: 2px solid;
      font-weight: 600;
      font-size: var(--font-size-sm);
      cursor: pointer;
      transition: all 0.2s ease;
      background-color: transparent;
    }

    .toggle-button.enabled {
      border-color: var(--color-success);
      color: var(--color-success);
    }

    .toggle-button.enabled:hover {
      background-color: var(--color-success-bg);
    }

    .toggle-button.disabled {
      border-color: var(--color-border);
      color: var(--color-text-secondary);
    }

    .toggle-button.disabled:hover {
      border-color: var(--color-success);
      color: var(--color-success);
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
  `;

  @state()
  private skills: Skill[] = [];

  @state()
  private loading = true;

  @state()
  private error: string | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.loadSkills();
  }

  private async loadSkills() {
    try {
      this.loading = true;
      const response = await fetch('/api/skills');
      if (!response.ok) throw new Error('Failed to load skills');

      const data = await response.json();
      this.skills = data.skills || [];
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to load skills:', err);
    } finally {
      this.loading = false;
    }
  }

  private async toggleSkill(skillId: string, enabled: boolean) {
    try {
      const response = await fetch(`/api/skills/${skillId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      });

      if (!response.ok) throw new Error('Failed to toggle skill');

      // Update local state
      this.skills = this.skills.map((skill) =>
        skill.id === skillId ? { ...skill, enabled } : skill
      );
    } catch (err) {
      console.error('Failed to toggle skill:', err);
    }
  }

  render() {
    if (this.loading) {
      return html`<div class="loading">加载中...</div>`;
    }

    if (this.error) {
      return html`<div class="error">加载失败: ${this.error}</div>`;
    }

    if (this.skills.length === 0) {
      return html`
        <div class="empty-state">
          <div class="empty-state-icon">⚡</div>
          <p>暂无技能</p>
        </div>
      `;
    }

    // Group skills by category
    const groupedSkills = this.skills.reduce((acc, skill) => {
      const category = skill.category || 'other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(skill);
      return acc;
    }, {} as Record<string, Skill[]>);

    return html`
      <div class="panel-container">
        <div class="panel-header">
          <h1 class="panel-title">技能库</h1>
          <p class="panel-description">
            管理和配置AI助手的各种技能模块
          </p>
        </div>

        ${Object.entries(groupedSkills).map(
          ([category, skills]) => html`
            <div class="category-section">
              <h2 class="category-header">${category}</h2>
              <div class="skills-grid">
                ${skills.map(
                  (skill) => html`
                    <div class="skill-card ${skill.enabled ? 'enabled' : ''}">
                      <div class="skill-header">
                        <div class="skill-icon ${skill.enabled ? 'enabled' : ''}">
                          ⚡
                        </div>
                        <div class="skill-name">${skill.name}</div>
                        <div
                          class="skill-status ${skill.enabled ? 'enabled' : ''}"
                          title="${skill.enabled ? '已启用' : '已禁用'}"
                        ></div>
                      </div>
                      <div class="skill-description">
                        ${skill.description}
                      </div>
                      <div class="skill-actions">
                        <button
                          class="toggle-button ${skill.enabled ? 'enabled' : 'disabled'}"
                          @click=${() => this.toggleSkill(skill.id, !skill.enabled)}
                        >
                          ${skill.enabled ? '已启用' : '已禁用'}
                        </button>
                      </div>
                    </div>
                  `
                )}
              </div>
            </div>
          `
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'krebs-skills-panel': KrebsSkillsPanel;
  }
}
