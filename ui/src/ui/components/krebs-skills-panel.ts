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

    .upload-section {
      background-color: var(--color-surface);
      border: 2px dashed var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--spacing-xl);
      text-align: center;
      margin-bottom: var(--spacing-xl);
      transition: all 0.3s ease;
    }

    .upload-section:hover {
      border-color: var(--color-primary);
      background-color: var(--color-surface-hover);
    }

    .upload-section.dragging {
      border-color: var(--color-primary);
      background-color: var(--color-primary-bg);
    }

    .upload-icon {
      font-size: 48px;
      margin-bottom: var(--spacing-md);
    }

    .upload-title {
      font-size: var(--font-size-lg);
      font-weight: 600;
      color: var(--color-text);
      margin-bottom: var(--spacing-sm);
    }

    .upload-description {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      margin-bottom: var(--spacing-lg);
    }

    .upload-button {
      padding: var(--spacing-md) var(--spacing-xl);
      background-color: var(--color-primary);
      color: white;
      border: none;
      border-radius: var(--radius-md);
      font-size: var(--font-size-md);
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .upload-button:hover {
      background-color: var(--color-primary-hover);
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }

    .upload-button:disabled {
      background-color: var(--color-border);
      cursor: not-allowed;
      transform: none;
    }

    .upload-input {
      display: none;
    }

    .upload-status {
      margin-top: var(--spacing-md);
      padding: var(--spacing-md);
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
    }

    .upload-status.uploading {
      background-color: var(--color-info-bg);
      color: var(--color-info);
    }

    .upload-status.success {
      background-color: var(--color-success-bg);
      color: var(--color-success);
    }

    .upload-status.error {
      background-color: var(--color-error-bg);
      color: var(--color-error);
    }
  `;

  @state()
  private skills: Skill[] = [];

  @state()
  private loading = true;

  @state()
  private error: string | null = null;

  @state()
  private uploadStatus: string | null = null;

  @state()
  private uploadStatusType: 'uploading' | 'success' | 'error' | null = null;

  @state()
  private isDragging = false;

  private fileInput: HTMLInputElement | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.loadSkills();
  }

  updated(): void {
    // Find file input after render
    if (!this.fileInput) {
      this.fileInput = this.shadowRoot?.querySelector('.upload-input') as HTMLInputElement;
    }
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

  private handleDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  private handleDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  private async handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.isDragging = false;

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    await this.uploadFile(file);
  }

  private async handleFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    await this.uploadFile(file);

    // Reset input
    input.value = '';
  }

  private triggerFileSelect(): void {
    // Try to find the input element
    if (!this.fileInput) {
      this.fileInput = this.shadowRoot?.querySelector('.upload-input') as HTMLInputElement;
    }

    if (this.fileInput) {
      this.fileInput.click();
    } else {
      console.error('File input not found');
    }
  }

  private async uploadFile(file: File): Promise<void> {
    // 验证文件类型
    if (!file.name.endsWith('.zip') && !file.name.endsWith('.tar.gz') && !file.name.endsWith('.tgz')) {
      this.uploadStatus = 'Please upload a .zip or .tar.gz file';
      this.uploadStatusType = 'error';
      setTimeout(() => {
        this.uploadStatus = null;
        this.uploadStatusType = null;
      }, 3000);
      return;
    }

    // 验证文件大小 (50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      this.uploadStatus = 'File size must be less than 50MB';
      this.uploadStatusType = 'error';
      setTimeout(() => {
        this.uploadStatus = null;
        this.uploadStatusType = null;
      }, 3000);
      return;
    }

    try {
      this.uploadStatus = 'Uploading skill...';
      this.uploadStatusType = 'uploading';

      const formData = new FormData();
      formData.append('skill', file);

      const response = await fetch('/api/skills/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.details || 'Upload failed');
      }

      // Success!
      this.uploadStatus = `✅ ${result.message}`;
      this.uploadStatusType = 'success';

      // Reload skills after a short delay
      setTimeout(() => {
        this.uploadStatus = null;
        this.uploadStatusType = null;
        this.loadSkills(); // This will refresh the page
      }, 2000);
    } catch (err) {
      console.error('Upload failed:', err);
      this.uploadStatus = `❌ Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
      this.uploadStatusType = 'error';
      setTimeout(() => {
        this.uploadStatus = null;
        this.uploadStatusType = null;
      }, 5000);
    }
  }

  render() {
    if (this.loading) {
      return html`<div class="loading">加载中...</div>`;
    }

    if (this.error) {
      return html`<div class="error">加载失败: ${this.error}</div>`;
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

        <!-- Upload Section -->
        <div
          class="upload-section ${this.isDragging ? 'dragging' : ''}"
          @dragover=${this.handleDragOver}
          @dragleave=${this.handleDragLeave}
          @drop=${this.handleDrop}
        >
          <div class="upload-icon">📦</div>
          <div class="upload-title">上传技能包</div>
          <div class="upload-description">
            拖拽文件到此处或点击下方按钮上传 (.zip 或 .tar.gz)
          </div>
          <input
            type="file"
            class="upload-input"
            accept=".zip,.tar.gz,.tgz"
            @change=${this.handleFileSelect}
          />
          <button
            class="upload-button"
            @click=${() => this.triggerFileSelect()}
            ?disabled=${this.uploadStatusType === 'uploading'}
          >
            ${this.uploadStatusType === 'uploading' ? '上传中...' : '选择文件'}
          </button>
          ${this.uploadStatus && this.uploadStatusType ? html`
            <div class="upload-status ${this.uploadStatusType}">
              ${this.uploadStatus}
            </div>
          ` : ''}
        </div>

        ${this.skills.length === 0 ? html`
          <div class="empty-state">
            <div class="empty-state-icon">⚡</div>
            <p>暂无技能</p>
          </div>
        ` : ''}

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
