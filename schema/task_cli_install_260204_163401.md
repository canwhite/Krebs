# Task: 扩展Skills安装功能 - CLI、新类型、错误处理

**任务ID**: task_cli_install_260204_163401
**创建时间**: 2026-02-04
**状态**: 进行中
**目标**: 扩展Skills依赖安装功能，添加CLI命令、更多安装类型和完善的错误处理

## 最终目标
1. 实现krebs skills install CLI命令
2. 扩展支持python、ruby等更多安装类型
3. 完善错误提示和重试机制

## 拆解步骤

### 1. CLI命令实现 ✅
- [x] 1.1 创建 `src/cli/commands/skills.ts` 文件
  - 实现 `skills install <skill-name>` 命令
  - 实现 `skills install --all` 批量安装
  - 添加 `--check` 标志（仅检查不安装）
  - 添加 `--dry-run` 标志（预览）
  - 添加 `--force` 标志（强制重新安装）
- [x] 1.2 集成到主CLI程序 (src/cli/index.ts, src/index.ts)
- [x] 1.3 添加帮助文档和使用示例 (README.md)

### 2. 扩展安装类型 ✅
- [x] 2.1 添加Python包支持（pip/pipx/poetry/uv）
  - kind: "python"
  - pythonPackage字段
  - pythonInstaller字段（pip/pipx/poetry/uv）
  - 检测pip/pipx/poetry/uv
- [x] 2.2 添加Ruby gem支持
  - kind: "ruby"
  - gemPackage字段
  - gem install命令
- [x] 2.3 添加Cargo (Rust) 支持
  - kind: "cargo"
  - cratePackage字段
  - cargo install命令
- [ ] 2.4 添加更多download功能
  - 支持自动添加到PATH
  - 支持执行后脚本

### 3. 完善错误处理
- [ ] 3.1 添加详细的错误分类
  - 网络错误
  - 权限错误
  - 依赖错误
  - 超时错误
- [ ] 3.2 实现重试机制
  - 可配置重试次数
  - 指数退避
  - 重试特定错误类型
- [ ] 3.3 添加用户友好的错误提示
  - 错误原因说明
  - 解决建议
  - 相关命令提示
- [ ] 3.4 添加安装日志
  - 详细的安装步骤记录
  - 失败时的诊断信息

### 4. 测试与文档
- [ ] 4.1 创建包含多种安装类型的测试技能
- [ ] 4.2 测试各种错误场景
- [x] 4.3 更新README和文档 ✅
- [x] 4.4 添加使用示例 ✅

## 当前进度
### 正在进行
- ✅ 已完成基础安装功能（task_skill_deps_260204_161646）
- ✅ CLI命令已实现并测试通过
- ✅ README.md文档已更新
- ✅ 扩展安装类型已完成（Python、Ruby、Cargo）
- 🔄 正在完善错误处理和重试机制

## 下一步行动
1. 完善错误处理和重试机制
2. 测试各种错误场景
3. 添加更多 download 功能（可选）

## 技术细节

### CLI命令设计
```bash
# 安装单个技能的依赖
krebs skills install test-install

# 安装所有技能的依赖
krebs skills install --all

# 仅检查状态
krebs skills install --check

# 预览将要安装的内容
krebs skills install --dry-run

# 强制重新安装
krebs skills install test-install --force

# 列出有安装规范的技能
krebs skills list --install
```

### 新安装类型示例
```yaml
install:
  - kind: python
    pythonPackage: black
    installer: pipx  # pip, pipx, poetry

  - kind: ruby
    gemPackage: jekyll

  - kind: cargo
    cratePackage: ripgrep
```

### 错误处理示例
```typescript
try {
  await installer.installSpec(spec);
} catch (error) {
  if (error.code === "EACCES") {
    console.error("权限不足，请尝试使用 sudo");
    console.log("建议: sudo krebs skills install <name>");
  } else if (error.code === "ENOTFOUND") {
    console.error("包未找到，请检查包名是否正确");
  } else if (error.code === "ETIMEDOUT") {
    console.error("网络超时，请检查网络连接");
    console.log("正在重试...");
    await retry();
  }
}
```
