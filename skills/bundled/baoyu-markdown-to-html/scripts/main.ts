import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import {
  extractSummaryFromBody,
  extractTitleFromMarkdown,
  formatTimestamp,
  parseFrontmatter,
  renderMarkdownDocument,
  replaceMarkdownImagesWithPlaceholders,
  resolveContentImages,
  serializeFrontmatter,
  stripWrappingQuotes,
} from "baoyu-md";

interface ImageInfo {
  placeholder: string;
  localPath: string;
  originalPath: string;
}

interface ParsedResult {
  title: string;
  author: string;
  summary: string;
  htmlPath: string;
  backupPath?: string;
  contentImages: ImageInfo[];
}

export async function convertMarkdown(
  markdownPath: string,
  options?: { title?: string; theme?: string; keepTitle?: boolean; citeStatus?: boolean },
): Promise<ParsedResult> {
  const baseDir = path.dirname(markdownPath);
  const content = fs.readFileSync(markdownPath, "utf-8");
  const theme = options?.theme;
  const keepTitle = options?.keepTitle ?? false;
  const citeStatus = options?.citeStatus ?? false;

  const { frontmatter, body } = parseFrontmatter(content);

  let title = stripWrappingQuotes(options?.title ?? "")
    || stripWrappingQuotes(frontmatter.title ?? "")
    || extractTitleFromMarkdown(body);
  if (!title) {
    title = path.basename(markdownPath, path.extname(markdownPath));
  }

  const author = stripWrappingQuotes(frontmatter.author ?? "");
  let summary = stripWrappingQuotes(frontmatter.description ?? "")
    || stripWrappingQuotes(frontmatter.summary ?? "");
  if (!summary) {
    summary = extractSummaryFromBody(body, 120);
  }

  const { images, markdown: rewrittenBody } = replaceMarkdownImagesWithPlaceholders(
    body,
    "MDTOHTMLIMGPH_",
  );
  const rewrittenMarkdown = `${serializeFrontmatter(frontmatter)}${rewrittenBody}`;

  console.error(
    `[markdown-to-html] Rendering with theme: ${theme ?? "default"}, keepTitle: ${keepTitle}, citeStatus: ${citeStatus}`,
  );

  const { html } = await renderMarkdownDocument(rewrittenMarkdown, {
    citeStatus,
    defaultTitle: title,
    keepTitle,
    theme,
  });

  const finalHtmlPath = markdownPath.replace(/\.md$/i, ".html");
  let backupPath: string | undefined;

  if (fs.existsSync(finalHtmlPath)) {
    backupPath = `${finalHtmlPath}.bak-${formatTimestamp()}`;
    console.error(`[markdown-to-html] Backing up existing file to: ${backupPath}`);
    fs.renameSync(finalHtmlPath, backupPath);
  }

  fs.writeFileSync(finalHtmlPath, html, "utf-8");

  const hasRemoteImages = images.some((image) =>
    image.originalPath.startsWith("http://") || image.originalPath.startsWith("https://"),
  );
  const tempDir = hasRemoteImages
    ? fs.mkdtempSync(path.join(os.tmpdir(), "markdown-to-html-"))
    : baseDir;
  const contentImages = await resolveContentImages(images, baseDir, tempDir, "markdown-to-html");

  let finalContent = fs.readFileSync(finalHtmlPath, "utf-8");
  for (const image of contentImages) {
    const imgTag = `<img src="${image.originalPath}" data-local-path="${image.localPath}" style="display: block; width: 100%; margin: 1.5em auto;">`;
    finalContent = finalContent.replace(image.placeholder, imgTag);
  }
  fs.writeFileSync(finalHtmlPath, finalContent, "utf-8");

  console.error(`[markdown-to-html] HTML saved to: ${finalHtmlPath}`);

  return {
    title,
    author,
    summary,
    htmlPath: finalHtmlPath,
    backupPath,
    contentImages,
  };
}

function printUsage(): never {
  console.log(`Convert Markdown to styled HTML

Usage:
  npx -y bun main.ts <markdown_file> [options]

Options:
  --title <title>     Override title
  --theme <name>      Theme name (default, grace, simple). Default: default
  --cite              Convert ordinary external links to bottom citations. Default: off
  --keep-title        Keep the first heading in content. Default: false (removed)
  --help              Show this help

Output:
  HTML file saved to same directory as input markdown file.
  Example: article.md -> article.html

  If HTML file already exists, it will be backed up first:
  article.html -> article.html.bak-YYYYMMDDHHMMSS

Output JSON format:
{
  "title": "Article Title",
  "htmlPath": "/path/to/article.html",
  "backupPath": "/path/to/article.html.bak-20260128180000",
  "contentImages": [...]
}

Example:
  npx -y bun main.ts article.md
  npx -y bun main.ts article.md --theme grace
  npx -y bun main.ts article.md --cite
`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
  }

  let markdownPath: string | undefined;
  let title: string | undefined;
  let theme: string | undefined;
  let citeStatus = false;
  let keepTitle = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--title" && args[i + 1]) {
      title = args[++i];
    } else if (arg === "--theme" && args[i + 1]) {
      theme = args[++i];
    } else if (arg === "--cite") {
      citeStatus = true;
    } else if (arg === "--keep-title") {
      keepTitle = true;
    } else if (!arg.startsWith("-")) {
      markdownPath = arg;
    }
  }

  if (!markdownPath) {
    console.error("Error: Markdown file path is required");
    process.exit(1);
  }

  if (!fs.existsSync(markdownPath)) {
    console.error(`Error: File not found: ${markdownPath}`);
    process.exit(1);
  }

  const result = await convertMarkdown(markdownPath, { title, theme, keepTitle, citeStatus });
  console.log(JSON.stringify(result, null, 2));
}

await main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
