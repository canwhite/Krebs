# Skills 配置重构说明

## 变更内容

将硬编码在 `server.ts` 和 `examples/index.ts` 中的 skills 数组提取到独立的 `skills/index.ts` 配置文件中。

## 文件结构

```
skills/
├── index.ts                    # Skills 配置文件（新增）
├── web-search-tool/            # 网页搜索 skill
├── diffusion-narrative-denouncing/  # 扩散叙事 skill
├── wechat-article/             # 微信公众号文章 skill
└── no-useeffect/               # React 无 useEffect skill
```

## 使用方式

### 导入 SKILLS

```typescript
import { SKILLS } from "./skills/index";
```

### 在 resourceLoader 中使用

```typescript
resourceLoader: {
  // ...
  getSkills: () => ({
    skills: SKILLS,
    diagnostics: [],
  }),
}
```

### 添加新 Skill

1. 在 `skills/` 目录下创建新的 skill 文件夹
2. 在 `skills/index.ts` 的 `SKILLS` 数组中添加配置：

```typescript
{
  name: "your-skill-name",
  description: "Your skill description",
  filePath: `${SKILLS_BASE_DIR}/your-skill-name/SKILL.md`,
  baseDir: `${SKILLS_BASE_DIR}/your-skill-name`,
  source: "inline",
  disableModelInvocation: false,
}
```

## 辅助函数

### getSkillByName(name: string)

根据 name 获取 skill 配置

```typescript
import { getSkillByName } from "./skills/index";

const skill = getSkillByName("web-search-tool");
console.log(skill?.description);
```

### getSkillNames(): string[]

获取所有 skill 名称

```typescript
import { getSkillNames } from "./skills/index";

const names = getSkillNames(); // ["web-search-tool", "diffusion-narrative-denouncing", ...]
```

## 优势

1. **解耦**：skills 配置与业务逻辑分离
2. **可维护性**：集中管理，易于添加/修改 skills
3. **复用性**：多个文件可共享同一份配置
4. **类型安全**：TypeScript 类型定义，避免拼写错误
