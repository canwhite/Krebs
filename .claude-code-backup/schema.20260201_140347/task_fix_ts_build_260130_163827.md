# Task: 修复 Docker 构建中的 TypeScript 类型错误

**任务ID**: task_fix_ts_build_260130_163827
**创建时间**: 2026-01-30
**状态**: 进行中
**目标**: 修复 auth-choice.apply.deepseek.ts 文件中缺少 mode 属性的 TypeScript 类型错误

## 最终目标
解决 Docker 构建失败问题，确保 `pnpm build` 命令成功执行。

## 错误信息
```
src/commands/auth-choice.apply.deepseek.ts(73,51): error TS2345: Argument of type '{ profileId: string; provider: string; }' is not assignable to parameter of type '{ profileId: string; provider: string; mode: "token" | "api_key" | "oauth"; email?: string | undefined; preferProfileFirst?: boolean | undefined; }'.
  Property 'mode' is missing in type '{ profileId: string; provider: string; }' but required in type '{ profileId: string; provider: string; mode: "token" | "api_key" | "oauth"; email?: string | undefined; preferProfileFirst?: boolean | undefined; }'.
```

## 拆解步骤
### 1. 问题分析
- [ ] 读取 src/commands/auth-choice.apply.deepseek.ts 文件
- [ ] 定位第 73 行的错误代码
- [ ] 理解缺少的 mode 属性及其有效值

### 2. 代码审查
- [ ] 检查相关类型定义
- [ ] 查看类似的实现文件（如 auth-choice.apply.ts）
- [ ] 确定正确的 mode 值

### 3. 修复问题
- [ ] 添加缺失的 mode 属性
- [ ] 验证修复后的代码
- [ ] 运行构建测试

### 4. 全局审查
- [ ] 搜索所有类似的代码模式
- [ ] 修复所有潜在的问题

## 当前进度
### 正在进行: 验证修复
已修复第 73-76 行的 mode 属性缺失问题，添加了 `mode: "api_key"`

## 下一步行动
1. 运行构建验证
2. 全局检查类似问题
