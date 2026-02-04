---
name: Filesystem
description: "文件系统操作技能。支持读取、写入、搜索文件和目录。"
metadata: '{"krebs":{"emoji":"📁","category":"System","tags":["filesystem","files","io"]}}'
---

# Filesystem Skill

文件系统操作技能，用于读取、写入、搜索和管理文件。

## 读取文件

读取单个文件内容：
```bash
cat path/to/file.txt
```

读取文件的前 N 行：
```bash
head -n 50 path/to/file.txt
```

读取文件的后 N 行：
```bash
tail -n 50 path/to/file.txt
```

## 写入文件

创建新文件或覆盖现有文件：
```bash
cat > path/to/file.txt << 'EOF'
Content here
EOF
```

追加内容到文件：
```bash
echo "New content" >> path/to/file.txt
```

## 搜索文件

按名称搜索文件：
```bash
find . -name "*.ts" -type f
```

按内容搜索文件：
```bash
grep -r "function" path/to/directory
```

组合搜索（查找包含特定内容的 TypeScript 文件）：
```bash
find . -name "*.ts" -type f | xargs grep "import"
```

## 目录操作

列出目录内容（包括隐藏文件）：
```bash
ls -la path/to/directory
```

递归列出目录树：
```bash
find path/to/directory -print | sed -e 's;[^/]*/;|____;g;s;____|; |g'
```

创建目录：
```bash
mkdir -p path/to/nested/directory
```

## 文件信息

查看文件详细信息：
```bash
ls -lh path/to/file.txt
```

查看文件统计（行数、词数等）：
```bash
wc -l path/to/file.txt  # 行数
wc -w path/to/file.txt  # 词数
wc -c path/to/file.txt  # 字节数
```

查找文件类型：
```bash
file path/to/file.txt
```
