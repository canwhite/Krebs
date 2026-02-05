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
 * Skills List Component
 * Displays available skills in the sidebar
 */
@customElement('krebs-skills-list')
export class KrebsSkillsList extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .skills-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .skill-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-md);
      transition: background-color 0.2s;
    }

    .skill-item:hover {
      background-color: var(--color-surface-hover);
    }

    .skill-icon {
      font-size: var(--font-size-lg);
    }

    .skill-icon.enabled {
      opacity: 1;
    }

    .skill-icon.disabled {
      opacity: 0.4;
    }

    .skill-info {
      flex: 1;
      min-width: 0;
    }

    .skill-name {
      font-weight: 600;
      font-size: var(--font-size-sm);
      margin-bottom: 2px;
    }

    .skill-name.disabled {
      color: var(--color-text-secondary);
    }

    .skill-description {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .skill-toggle {
      width: 36px;
      height: 20px;
      background-color: var(--color-border);
      border-radius: 10px;
      position: relative;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .skill-toggle.enabled {
      background-color: var(--color-success);
    }

    .skill-toggle::after {
      content: '';
      position: absolute;
      width: 16px;
      height: 16px;
      background-color: white;
      border-radius: 50%;
      top: 2px;
      left: 2px;
      transition: transform 0.2s;
      box-shadow: var(--shadow-sm);
    }

    .skill-toggle.enabled::after {
      transform: translateX(16px);
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
      return html`<div class="empty-state">加载失败: ${this.error}</div>`;
    }

    if (this.skills.length === 0) {
      return html`<div class="empty-state">暂无技能</div>`;
    }

    // Group skills by category
    const groupedSkills = this.skills.reduce((acc, skill) => {
      const category = skill.category || 'other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(skill);
      return acc;
    }, {} as Record<string, Skill[]>);

    return html`
      <div class="skills-list">
        ${Object.entries(groupedSkills).map(
          ([category, skills]) => html`
            <div class="category-header">${category}</div>
            ${skills.map(
              (skill) => html`
                <div class="skill-item">
                  <span class="skill-icon ${skill.enabled ? 'enabled' : 'disabled'}">
                    ⚡
                  </span>
                  <div class="skill-info">
                    <div class="skill-name ${skill.enabled ? '' : 'disabled'}">
                      ${skill.name}
                    </div>
                    <div class="skill-description">${skill.description}</div>
                  </div>
                  <div
                    class="skill-toggle ${skill.enabled ? 'enabled' : ''}"
                    @click=${() => this.toggleSkill(skill.id, !skill.enabled)}
                  ></div>
                </div>
              `
            )}
          `
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'krebs-skills-list': KrebsSkillsList;
  }
}
