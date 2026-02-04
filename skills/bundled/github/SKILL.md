---
name: GitHub
description: "使用 `gh` 命令行工具与 GitHub 交互。支持 issues、PRs、CI runs 和高级查询。"
metadata: '{"krebs":{"emoji":"🐙","category":"Development","tags":["github","git","devops"],"homepage":"https://cli.github.com/"}}'
---

# GitHub Skill

使用 `gh` CLI 工具与 GitHub 进行交互。当不在 git 目录中时，始终指定 `--repo owner/repo`，或直接使用 URL。

## Pull Requests

检查 PR 的 CI 状态：
```bash
gh pr checks 55 --repo owner/repo
```

列出最近的 workflow 运行：
```bash
gh run list --repo owner/repo --limit 10
```

查看运行并查看哪些步骤失败了：
```bash
gh run view <run-id> --repo owner/repo
```

仅查看失败步骤的日志：
```bash
gh run view <run-id> --repo owner/repo --log-failed
```

## Issues

列出仓库的 issues：
```bash
gh issue list --repo owner/repo --limit 20
```

查看特定 issue：
```bash
gh issue view 123 --repo owner/repo
```

创建新 issue：
```bash
gh issue create --repo owner/repo --title "Title" --body "Description"
```

## API 高级查询

`gh api` 命令用于访问其他子命令不可用的数据。

获取特定字段的 PR：
```bash
gh api repos/owner/repo/pulls/55 --jq '.title, .state, .user.login'
```

## JSON 输出

大多数命令支持 `--json` 进行结构化输出。可以使用 `--jq` 进行过滤：

```bash
gh issue list --repo owner/repo --json number,title --jq '.[] | "\(.number): \(.title)"'
```
