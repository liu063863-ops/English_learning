---
title: "Skill 05: 教育类考试系统 UI 设计系统"
category: skills
tags: [ui, design-system, css]
created: 2026-07-26
---

> **适用场景**：任何需要"做题、答题、展示解析"的教育/考试/问卷类应用。

## CSS 设计令牌

```css
:root {
  /* 色彩 */
  --color-bg: #f8fafc;
  --color-surface: #ffffff;
  --color-sidebar: #0f172a;
  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;
  --color-accent: #f59e0b;
  --color-success: #10b981;
  --color-danger: #ef4444;
  --color-text-primary: #0f172a;
  --color-text-secondary: #475569;
  --color-text-muted: #94a3b8;
  --color-border: #e2e8f0;
  
  /* 尺寸 */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 25px rgba(0,0,0,0.1);
  
  /* 动画 */
  --transition-fast: 0.15s ease;
  --transition-base: 0.25s ease;
  --transition-slow: 0.4s ease;
}
```

## 通用组件模式

### 1. 选项卡片

```css
.option-card {
  padding: 16px 20px;
  border-radius: var(--radius-md);
  border: 2px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.option-card:hover {
  border-color: var(--color-primary);
  background: #eff6ff;
}

.option-card.selected {
  border-color: var(--color-primary);
  background: #eff6ff;
}

.option-letter {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.option-card.selected .option-letter {
  background: var(--color-primary);
  color: white;
}
```

### 2. 题号导航

```css
.question-nav {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-bottom: 20px;
}

.question-dot {
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  border: 2px solid transparent;
}

.question-dot.unanswered {
  background: #f1f5f9;
  color: var(--color-text-secondary);
  border-color: #e2e8f0;
}

.question-dot.answered {
  background: var(--color-success);
  color: white;
}

.question-dot.current {
  background: var(--color-primary);
  color: white;
  border-color: #1d4ed8;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.2);
}

.question-dot:hover {
  transform: scale(1.1);
}
```

### 3. 统计卡片

```css
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: 24px;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  margin-bottom: 16px;
}

.stat-icon.blue { background: #dbeafe; }
.stat-icon.green { background: #d1fae5; }
.stat-icon.red { background: #fee2e2; }
.stat-icon.yellow { background: #fef3c7; }

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-muted);
}
```

### 4. 空状态

```css
.empty-state {
  text-align: center;
  padding: 48px 24px;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  border: 2px dashed var(--color-border);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-state h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

.empty-state p {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 24px;
}

.btn-primary {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-hover));
  color: white;
  padding: 10px 24px;
  border-radius: var(--radius-md);
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59,130,246,0.4);
}
```

### 5. 环形进度条

```css
.progress-ring-container {
  position: relative;
  width: 120px;
  height: 120px;
}

.progress-ring {
  transform: rotate(-90deg);
}

.progress-bg {
  fill: none;
  stroke: #e2e8f0;
  stroke-width: 8;
}

.progress-fill {
  fill: none;
  stroke: var(--color-primary);
  stroke-width: 8;
  stroke-linecap: round;
  stroke-dasharray: 339.292;
  transition: stroke-dashoffset 1s ease;
}

.progress-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}

.progress-number {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary);
}
```

## 侧边栏固定布局

```css
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  width: 240px;
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
  background: linear-gradient(180deg, #0f172a, #1e293b);
  z-index: 100;
}

.main-content {
  margin-left: 240px;
  width: calc(100vw - 240px);
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--color-bg);
  padding: 24px;
}

html, body, #root {
  height: 100vh;
  overflow: hidden;
  margin: 0;
  padding: 0;
}
```

## 强制规则

- 禁止页面出现"加载中..."纯文字
- 禁止白屏（必须有骨架屏或 loading 动画）
- 禁止显示 NaN / undefined（必须兜底为 "--" 或 "0"）
