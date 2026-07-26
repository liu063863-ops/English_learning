---
title: "Skill 03: SQLite 桌面端数据管理规范"
category: skills
tags: [sqlite, database, desktop]
created: 2026-07-26
---

> **适用场景**：任何需要本地存储的桌面应用（笔记、记账、考试、工具类）。

## 数据库初始化检查

```javascript
const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = process.env.SQLITE_DB_PATH 
  || path.join(__dirname, '../data/app.db');

const db = new sqlite3.Database(dbPath);

const REQUIRED_TABLES = ['users', 'items', 'logs'];

// 启动时自动建表
REQUIRED_TABLES.forEach(table => {
  db.get(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    [table],
    (err, row) => {
      if (!row) createTable(table);
    }
  );
});

// 兜底数据：空表时自动填充
db.get('SELECT COUNT(*) as count FROM items', (err, row) => {
  if (row.count === 0) insertDefaults();
});
```

## .gitignore 规范

```gitignore
# 忽略用户数据，保留示例
*.db
!*.db.sample
!backend/data/english_exam.db.sample
```

## 数据库备份/导出

```javascript
// 导出：复制 .db 文件到用户选择的位置
const fs = require('fs');
fs.copyFileSync(dbPath, exportPath);

// 导入：覆盖当前数据库（需重启应用）
fs.copyFileSync(importPath, dbPath);
```

## Electron 用户数据目录

```javascript
const { app } = require('electron');
const userDataPath = app.getPath('userData'); // %APPDATA%/YourApp
```

## 关键原则

| 原则 | 说明 |
|------|------|
| 自动建表 | 应用启动时检查表是否存在，不存在则创建 |
| 兜底数据 | 空表时自动插入默认数据，确保功能可用 |
| 用户隔离 | 数据库放在用户目录，多用户不冲突 |
| 版本兼容 | 表结构变更时，用 ALTER TABLE 迁移 |
| 备份导出 | 提供一键导出 .db 文件功能 |

## 常见坑

- 数据库路径：开发时用项目目录，生产时用用户目录
- 并发写入：SQLite 单线程，大量写入需队列化
- 大文件：数据库超过 100MB 时考虑分表或压缩
