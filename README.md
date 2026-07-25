# English Exam Lab

英语真题在线考试系统桌面端。

## 功能

- 67 套 CET4/CET6 真题
- 完整考试流程（听力/阅读/翻译/写作）
- 阅读专项练习
- 单词本（四级/六级/考研）
- 错题本与复习追踪
- 离线桌面应用（Electron）

## 技术栈

- 前端：React + Vite
- 后端：Node.js + Express + SQLite3
- 桌面：Electron
- 包管理：pnpm

## 快速开始

```bash
pnpm install
cp backend/data/english_exam.db.sample backend/data/english_exam.db
pnpm run electron
```

Windows PowerShell：

```powershell
pnpm install
Copy-Item backend/data/english_exam.db.sample backend/data/english_exam.db
pnpm run electron
```

## 打包

```bash
pnpm run package:win
```

## 数据说明

- 本地数据库：`backend/data/english_exam.db`
- 示例数据库：`backend/data/english_exam.db.sample`
- 用户本地数据库不会提交到 Git。
