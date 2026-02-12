import { LitElement, html, css } from 'lit';
import { property, state, customElement } from 'lit/decorators.js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Markdown Component with Copy Buttons
 * Renders markdown content and provides copy functionality
 */
@customElement('krebs-markdown')
export class KrebsMarkdown extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: relative;
    }

    .markdown-wrapper {
      position: relative;
    }

    .markdown-content {
      padding-bottom: 8px;
    }

    .copy-buttons {
      position: absolute;
      bottom: -40px;
      right: 0;
      display: flex;
      gap: 4px;
      opacity: 0.3;
      transition: opacity 0.2s ease, bottom 0.2s ease;
      z-index: 10;
    }

    .markdown-wrapper:hover .copy-buttons {
      opacity: 1;
      bottom: 8px;
    }

    .copy-btn {
      padding: 4px 8px;
      font-size: 12px;
      background-color: rgba(255, 255, 255, 0.6);
      backdrop-filter: blur(4px);
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 4px;
      cursor: pointer;
      color: var(--color-text);
      opacity: 0.7;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .copy-btn:hover {
      background-color: var(--color-primary);
      color: white;
      border-color: var(--color-primary);
      opacity: 1;
    }

    .copy-btn.copied {
      background-color: #10b981;
      color: white;
      border-color: #10b981;
    }

    .copy-btn svg {
      width: 14px;
      height: 14px;
    }

    .markdown-content {
      word-wrap: break-word;
      line-height: 1.6;
      min-height: 20px;
    }

    /* Markdown Styles */
    .markdown-content h1,
    .markdown-content h2,
    .markdown-content h3,
    .markdown-content h4,
    .markdown-content h5,
    .markdown-content h6 {
      margin-top: 1em;
      margin-bottom: 0.5em;
      font-weight: 600;
      line-height: 1.25;
    }

    .markdown-content h1 {
      font-size: 1.5em;
    }

    .markdown-content h2 {
      font-size: 1.3em;
    }

    .markdown-content h3 {
      font-size: 1.15em;
    }

    .markdown-content p {
      margin: 0.5em 0;
    }

    .markdown-content ul,
    .markdown-content ol {
      margin: 0.5em 0;
      padding-left: 2em;
    }

    .markdown-content li {
      margin: 0.25em 0;
    }

    .markdown-content code {
      background-color: rgba(0, 0, 0, 0.06);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      font-size: 0.9em;
    }

    .markdown-content pre {
      background-color: #f6f8fa;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      padding: 16px;
      overflow-x: auto;
      margin: 1em 0;
      position: relative;
    }

    .markdown-content pre code {
      background-color: transparent;
      padding: 0;
      font-size: 0.9em;
      line-height: 1.5;
    }

    .markdown-content blockquote {
      border-left: 4px solid var(--color-primary);
      padding-left: 1em;
      margin: 1em 0;
      color: var(--color-text-secondary);
      font-style: italic;
    }

    .markdown-content a {
      color: var(--color-primary);
      text-decoration: none;
    }

    .markdown-content a:hover {
      text-decoration: underline;
    }

    .markdown-content table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }

    .markdown-content table th,
    .markdown-content table td {
      border: 1px solid var(--color-border);
      padding: 8px 12px;
      text-align: left;
    }

    .markdown-content table th {
      background-color: #f6f8fa;
      font-weight: 600;
    }

    .markdown-content img {
      max-width: 100%;
      border-radius: 6px;
      margin: 1em 0;
    }

    .markdown-content hr {
      border: none;
      border-top: 2px solid var(--color-border);
      margin: 2em 0;
    }

    /* Dark code block theme */
    .markdown-content pre {
      background-color: #1e1e1e;
      color: #d4d4d4;
    }

    .markdown-content pre code {
      color: inherit;
    }

    /* User message styles - light theme for markdown */
    :host([is-user="true"]) .markdown-content {
      color: #ffffff;
    }

    :host([is-user="true"]) .markdown-content a {
      color: rgba(255, 255, 255, 0.9);
    }

    :host([is-user="true"]) .markdown-content code {
      background-color: rgba(255, 255, 255, 0.2);
      color: #ffffff;
    }

    :host([is-user="true"]) .markdown-content pre {
      background-color: rgba(0, 0, 0, 0.3);
      border-color: rgba(255, 255, 255, 0.2);
      color: #ffffff;
    }

    :host([is-user="true"]) .markdown-content pre code {
      color: inherit;
    }

    :host([is-user="true"]) .markdown-content blockquote {
      color: rgba(255, 255, 255, 0.8);
      border-left-color: rgba(255, 255, 255, 0.5);
    }

    :host([is-user="true"]) .markdown-content strong,
    :host([is-user="true"]) .markdown-content b {
      color: #ffffff;
    }

    :host([is-user="true"]) .copy-btn {
      background-color: rgba(255, 255, 255, 0.6);
      border-color: rgba(255, 255, 255, 0.3);
      color: #0066cc;
      opacity: 0.7;
      backdrop-filter: blur(4px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    :host([is-user="true"]) .copy-btn:hover {
      background-color: #ffffff;
      color: #0066cc;
      border-color: #ffffff;
      opacity: 1;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .copy-buttons {
        position: absolute;
        opacity: 0;
        bottom: 8px;
        right: 8px;
      }

      .markdown-wrapper:hover .copy-buttons {
        opacity: 1;
      }

      .markdown-content h1 {
        font-size: 1.3em;
      }

      .markdown-content h2 {
        font-size: 1.15em;
      }

      .markdown-content pre {
        padding: 12px;
        font-size: 0.85em;
      }
    }
  `;

  @property({ type: String })
  content = '';

  @property({ type: Boolean, reflect: true })
  isUser = false;

  private copyTextState: 'idle' | 'copied' = 'idle';

  private copyMarkdownState: 'idle' | 'copied' = 'idle';

  private copyTextTimer?: number;
  private copyMarkdownTimer?: number;

  render() {
    const renderedHtml = this.renderMarkdown();

    return html`
      <div class="markdown-wrapper">
        <div class="markdown-content" .innerHTML=${renderedHtml}></div>
        <div class="copy-buttons">
          <button
            class="copy-btn ${this.copyTextState === 'copied' ? 'copied' : ''}"
            @click=${() => this.copyText()}
            title="复制纯文本"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>${this.copyTextState === 'copied' ? '已复制' : '复制文本'}</span>
          </button>
          <button
            class="copy-btn ${this.copyMarkdownState === 'copied' ? 'copied' : ''}"
            @click=${() => this.copyMarkdown()}
            title="复制 Markdown 源码"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <span>${this.copyMarkdownState === 'copied' ? '已复制' : '复制 MD'}</span>
          </button>
        </div>
      </div>
    `;
  }

  private renderMarkdown(): string {
    // Render markdown synchronously
    const rendered = marked(this.content, {
      breaks: true, // Convert \n to <br>
      gfm: true, // GitHub Flavored Markdown
      async: false // Force synchronous rendering
    }) as string;

    // Sanitize HTML to prevent XSS
    return DOMPurify.sanitize(rendered);
  }

  private async copyText() {
    try {
      // Strip markdown syntax to get plain text
      const plainText = this.stripMarkdown(this.content);
      await navigator.clipboard.writeText(plainText);

      this.copyTextState = 'copied';
      this.resetCopyTextState();
    } catch (error) {
      console.error('Failed to copy text:', error);
      // Fallback for older browsers
      this.fallbackCopy(this.stripMarkdown(this.content));
      this.copyTextState = 'copied';
      this.resetCopyTextState();
    }
  }

  private async copyMarkdown() {
    try {
      await navigator.clipboard.writeText(this.content);

      this.copyMarkdownState = 'copied';
      this.resetCopyMarkdownState();
    } catch (error) {
      console.error('Failed to copy markdown:', error);
      // Fallback for older browsers
      this.fallbackCopy(this.content);
      this.copyMarkdownState = 'copied';
      this.resetCopyMarkdownState();
    }
  }

  private stripMarkdown(markdown: string): string {
    return markdown
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, (match) => {
        return match.replace(/```\w*\n?/g, '').replace(/```/g, '');
      })
      // Remove inline code
      .replace(/`([^`]+)`/g, '$1')
      // Remove headers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove strikethrough
      .replace(/~~([^~]+)~~/g, '$1')
      // Remove links but keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove images
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // Remove blockquotes
      .replace(/^>\s+/gm, '')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Clean up extra whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private fallbackCopy(text: string) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }

  private resetCopyTextState() {
    if (this.copyTextTimer) {
      clearTimeout(this.copyTextTimer);
    }
    this.copyTextTimer = window.setTimeout(() => {
      this.copyTextState = 'idle';
    }, 2000);
  }

  private resetCopyMarkdownState() {
    if (this.copyMarkdownTimer) {
      clearTimeout(this.copyMarkdownTimer);
    }
    this.copyMarkdownTimer = window.setTimeout(() => {
      this.copyMarkdownState = 'idle';
    }, 2000);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'krebs-markdown': KrebsMarkdown;
  }
}
