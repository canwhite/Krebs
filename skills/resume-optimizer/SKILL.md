---
name: resume-optimizer
description: ATS简历优化器 - 根据职位描述(JD)和个人能力，生成符合ATS解析要求的高匹配简历
license: MIT
compatibility: 通用
metadata:
  version: "1.0.0"
  author: "Krebs"
---

# Resume Optimizer - ATS简历优化器

智能简历优化工具，根据职位描述(JD)和候选人的实际能力，生成符合现代ATS(申请人跟踪系统)要求的优化简历。

## 核心原则

**2026年ATS优化的现实**：
- 隐藏文本、白字、堆砌关键词等"黑科技"已被广泛检测，会导致降分或黑名单
- 现代ATS使用AI+NLP语义解析，真正的优化是"让系统正确理解你"
- 最佳策略：**格式标准化 + 自然语义关键词匹配 + 量化成就**

## 使用方法

### 步骤1：提供输入信息

用户提供以下两项：
1. **职位描述(JD)** - 目标岗位的完整职位描述
2. **个人能力** - 候选人的真实技能、经历、成就（文本形式）

### 步骤2：分析匹配

系统将自动：
- 从JD中提取**核心硬技能、工具、职责短语**
- 分析个人能力与JD的**匹配度和差距**
- 识别**可转移技能**和**需要强调的经验**

### 步骤3：生成优化简历

输出一份**符合以下标准**的简历：

#### 格式标准（ATS解析友好）
- **单列布局** - 避免表格、多列、文本框
- **标准标题** - Work Experience, Education, Skills, Certifications
- **日期一致** - MM/YYYY 或 Month YYYY – Month YYYY
- **标准字体** - Arial, Calibri, Times New Roman (10-12pt)
- **文件类型建议** - 优先 .DOCX

#### 内容优化策略

1. **专业总结（Professional Summary）**
   - 3-4行，突出与JD最相关的核心能力
   - 自然融入JD中的关键词

2. **技能列表（Skills）**
   - 分组呈现：技术技能、工具、软技能
   - 包含缩写和全称（如 SQL / Structured Query Language）
   - 精确匹配JD中的术语

3. **工作经历（Work Experience）**
   - 每条经历使用 **Action + Tool/Scope + Result** 格式
   - 量化成就（数字、百分比、具体成果）
   - 自然融入JD关键词，避免生硬堆砌

4. **教育背景（Education）**
   - 标准格式：学位、专业、学校、毕业时间

5. **证书/其他（Certifications）**
   - 仅列出与JD相关的证书

## 示例

### 输入示例

**JD片段**：
```
We are looking for a Data Analyst with:
- 3+ years of experience in data analysis
- Proficient in SQL, Python, Tableau
- Experience with agile methodologies
- Strong communication skills
```

**个人能力片段**：
```
3年数据分析经验，使用SQL查询数据库，用Python做数据处理，
做过几个数据可视化项目，平时用敏捷开发流程，需要和产品经理沟通需求。
```

### 输出示例（简化）

```
PROFESSIONAL SUMMARY
Data Analyst with 3+ years of experience leveraging SQL, Python, and Tableau
to deliver actionable insights. Proven track record in agile environments with
strong stakeholder communication skills.

SKILLS
Technical: SQL (Advanced), Python (Pandas, NumPy), Tableau, Data Visualization
Methodologies: Agile/Scrum, Sprint Planning
Soft Skills: Stakeholder Communication, Requirements Gathering

WORK EXPERIENCE
Data Analyst | Company Name | 01/2022 – Present
• Developed SQL queries to analyze user behavior, driving 15% improvement in customer retention
• Created Python data pipelines using Pandas/NumPy, reducing manual reporting time by 40%
• Built interactive Tableau dashboards for executive reporting, used by 50+ stakeholders
• Collaborated with product managers in agile sprints to define data requirements
```

## 注意事项

⚠️ **避免以下高风险操作**：
- 隐藏文本（白字、小字号、层叠）
- 直接复制整段JD
- 过度堆砌关键词
- 使用AI生成痕迹过重的内容

✅ **推荐做法**：
- 基于真实能力进行优化
- 自然融入关键词
- 量化真实成就
- 保持对人类招聘者友好

## References

- [ATS优化最佳实践](references/ats-best-practices.md)
- [关键词匹配策略](references/keyword-matching.md)
