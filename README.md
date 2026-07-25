# English Exam Lab

英语真题在线考试系统桌面端，基于 Electron + React + Node.js + SQLite。

## 功能

- 67 套四六级真题（CET4/CET6）
- 完整考试流程（听力/阅读/翻译/写作）
- 阅读专项练习（201 篇文章）
- 单词本（四级/六级/考研词汇）
- 错题本与复习进度追踪
- 离线桌面端应用

## 技术栈

- 前端：React + Vite
- 后端：Node.js + Express + SQLite
- 桌面：Electron
- 包管理：pnpm

## 快速开始

```bash
# 安装依赖
pnpm install

# 初始化本地数据库
cp backend/data/english_exam.db.sample backend/data/english_exam.db

# 开发模式
pnpm run electron

# 构建前端
pnpm --dir frontend build

# 打包 Windows 安装程序
pnpm run package:win
```

Windows PowerShell 初始化数据库：

```powershell
Copy-Item backend/data/english_exam.db.sample backend/data/english_exam.db
```

## 常用脚本

```bash
# 同时启动前后端
pnpm run dev

# 启动后端
pnpm run start

# 启动 Electron
pnpm run electron

# 使用已有 dist 启动桌面端
run-electron-dev.bat

# 构建并启动桌面端
run-electron.bat
```

## 数据说明

- 本地运行数据库：`backend/data/english_exam.db`
- 仓库样例数据库：`backend/data/english_exam.db.sample`
- 用户本地数据库已加入 `.gitignore`，避免把个人学习数据提交到仓库。

## 项目结构

```text
kaoyan-english-lab/
  backend/      # Express API 与 SQLite 数据访问
  frontend/     # React + Vite 前端
  electron/     # Electron 主进程
  scripts/      # 导入、验证和修复脚本
  docs/         # 数据导入、质量监控和接口文档
```
