# pnpm Ignored Build Scripts 问题记录

## 问题现象

运行 `pnpm install` 时出现以下错误：

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @google/genai@1.52.0, koffi@2.16.1, protobufjs@7.5.6
```

pnpm 拒绝执行这些包的构建脚本（install / postinstall / preinstall），安装流程以退出码 1 中止。

## 原因

pnpm v10+ 引入了**构建脚本白名单机制**，旨在防止恶意依赖通过 lifecycle scripts 执行任意代码。所有需要在安装期间运行脚本的依赖（无论是直接依赖还是传递依赖），都必须被显式批准。

默认情况下，pnpm 会忽略所有传递依赖的构建脚本。当新的传递依赖被引入且未列入白名单时，pnpm 会报错并拒绝继续。

本项目 `pnpm-workspace.yaml` 中的 `allowBuilds` 字段被设为占位符文本（`set this to true or false`）而非实际的布尔值，因此这三个包的构建脚本被忽略。

## 解决

将 `pnpm-workspace.yaml` 中的 `allowBuilds` 值设为 `true`：

```yaml
# 修改前
allowBuilds:
  '@google/genai': set this to true or false
  koffi: set this to true or false
  protobufjs: set this to true or false

# 修改后
allowBuilds:
  '@google/genai': true
  koffi: true
  protobufjs: true
```

然后重新运行 `pnpm install`，构建脚本正常执行：

- `koffi` — 编译原生扩展（通过 `cnoke` / `node-gyp`）
- `protobufjs` — 运行 postinstall 脚本
- `@google/genai` — 运行 preinstall 脚本

## 注意事项

- `pnpm.onlyBuiltDependencies`（在 `package.json` 中）是全局名单，用于限定整个项目中允许运行的构建依赖。但如果在 `pnpm-workspace.yaml` 中已经配置了 `allowBuilds`，后者会覆盖前者的行为。
- `pnpm approve-builds` 是交互式命令，等价于手动编辑 `pnpm-workspace.yaml` 或 `package.json` 中的 `allowBuilds` / `onlyBuiltDependencies` 字段。
- 当项目中引入新的包含构建脚本的依赖时，需同步更新该配置。
