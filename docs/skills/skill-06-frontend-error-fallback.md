---
title: "Skill 06: 前端错误兜底与骨架屏"
category: skills
tags: [react, skeleton, error-handling]
created: 2026-07-26
---

> **适用场景**：任何需要处理加载/错误/空状态的 React/Vue 应用。

## 数据加载三态组件

```tsx
// DataContainer.tsx
import React from 'react';
import { SkeletonList } from './SkeletonList';
import { ErrorState } from './ErrorState';
import { EmptyState } from './EmptyState';

interface Props {
  loading: boolean;
  error: string | null;
  data: any[] | null;
  onRetry: () => void;
  children: React.ReactNode;
}

export const DataContainer: React.FC<Props> = ({
  loading, error, data, onRetry, children
}) => {
  if (loading) return <SkeletonList count={5} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!data || data.length === 0) return <EmptyState onAction={onRetry} />;
  return <>{children}</>;
};
```

## 骨架屏组件

```tsx
// SkeletonCard.tsx
import React from 'react';
import './SkeletonCard.css';

export const SkeletonCard: React.FC = () => (
  <div className="skeleton-card">
    <div className="skeleton-header"></div>
    <div className="skeleton-line"></div>
    <div className="skeleton-line short"></div>
  </div>
);

// SkeletonList.tsx
import React from 'react';
import { SkeletonCard } from './SkeletonCard';

export const SkeletonList: React.FC<{ count: number }> = ({ count }) => (
  <div className="skeleton-list">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);
```

## 骨架屏闪光动画 CSS

```css
/* SkeletonCard.css */
.skeleton-card {
  background: #ffffff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  margin-bottom: 16px;
}

.skeleton-header, .skeleton-line {
  background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

.skeleton-header {
  height: 20px;
  width: 60%;
  margin-bottom: 16px;
}

.skeleton-line {
  height: 12px;
  width: 100%;
  margin-bottom: 8px;
}

.skeleton-line.short {
  width: 40%;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

## 空状态组件

```tsx
// EmptyState.tsx
import React from 'react';

interface Props {
  icon?: string;
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<Props> = ({
  icon = '📭',
  title = '暂无数据',
  description = '数据为空，请稍后重试',
  actionText = '刷新',
  onAction
}) => (
  <div className="empty-state">
    <div className="empty-icon">{icon}</div>
    <h3>{title}</h3>
    <p>{description}</p>
    {onAction && (
      <button className="btn-primary" onClick={onAction}>
        {actionText}
      </button>
    )}
  </div>
);
```

## 错误状态组件

```tsx
// ErrorState.tsx
import React from 'react';

export const ErrorState: React.FC<{
  message: string;
  onRetry: () => void;
}> = ({ message, onRetry }) => (
  <div className="error-state">
    <div className="error-icon">⚠️</div>
    <h3>加载失败</h3>
    <p>{message}</p>
    <button className="btn-primary" onClick={onRetry}>
      重试
    </button>
  </div>
);
```

## 强制规则（3条）

| 规则 | 说明 |
|------|------|
| 禁止纯文字 loading | 必须用骨架屏或动画，不能显示"加载中..." |
| 禁止白屏 | 任何状态都必须有 UI 展示 |
| 禁止 NaN/undefined | 数据异常时必须兜底为 "--" 或 "0" |

## 数据兜底示例

```tsx
// 修复前
<div>{progress}%</div>  // NaN%

// 修复后
<div>{isNaN(progress) ? '--' : progress}%</div>
```
```

---

## 任务 2：推送到 `English_learning` 仓库

```bash
cd "C:\Users\liujinhao\Documents\New project\kaoyan-english-lab"

# 确认所有 6 个文件存在
Get-ChildItem docs/skills/

# 添加所有 Skill 文件
git add docs/skills/

# 提交
git commit -m "docs: add 6 development skills handbook (complete)"

# 推送到 English_learning 仓库
git push origin main
```

---

## 任务 3：推送到 `Electron-React-skills` 仓库

```bash
cd "C:\Users\liujinhao\Documents\New project\kaoyan-english-lab"

# 添加新的远程仓库（skills）
git remote add skills https://github.com/liu063863-ops/Electron-React-skills.git

# 如果已存在，先移除再添加
# git remote remove skills
# git remote add skills https://github.com/liu063863-ops/Electron-React-skills.git

# 推送到 skills 仓库（空仓库需要用 -u）
git push -u skills main

# 如果报错（空仓库有 README 冲突），强制推送
# git push skills main --force
```

---

## 任务 4：创建 README.md（在 Electron-React-skills 仓库）

如果 `Electron-React-skills` 是空仓库，推送前创建一个 README：

```bash
cd "C:\Users\liujinhao\Documents\New project\kaoyan-english-lab"

# 创建 README
@'
# Electron-React-Skills

个人开发技能手册，从 English Exam Lab 项目沉淀的 6 个可复用技能。

## Skills 列表

| 编号 | 技能 | 说明 |
|------|------|------|
| 01 | Electron + React 桌面封装 | Web 项目转桌面端 |
| 02 | PDF 渐进式解析 | 非结构化数据导入 |
| 03 | SQLite 桌面数据管理 | 本地数据库规范 |
| 04 | AI 分段任务模板 | 降低 Codex 幻觉 |
| 05 | 教育 UI 设计系统 | 考试系统视觉规范 |
| 06 | 错误兜底与骨架屏 | 前端状态管理 |

## 来源

从 [English Exam Lab](https://github.com/liu063863-ops/English_learning) 项目沉淀。
'@ | Out-File -Encoding utf8 "docs/skills/README.md"

git add docs/skills/README.md
git commit -m "docs: add skills README"
git push skills main
```

---

## 验证标准

1. `docs/skills/` 目录下有 7 个文件（6 个 skill + 1 个 README）
2. `English_learning` 仓库能看到 `docs/skills/` 目录
3. `Electron-React-skills` 仓库能看到所有 skill 文件
4. 两个仓库的代码一致

## 输出要求

1. 列出 `docs/skills/` 目录下的所有文件名
2. 显示 `git remote -v` 的结果
3. 显示 `git log --oneline -3` 的结果
4. 确认两个仓库都推送成功
