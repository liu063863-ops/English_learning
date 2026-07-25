# English Exam Lab

English Exam Lab 是一个面向四六级与考研英语备考的本地学习软件。项目包含 React 前端、Node.js/Express 后端、SQLite 本地数据库和 Electron 桌面端包装层，支持真题考试、阅读练习、单词本、错题本、翻译写作与学习数据看板。

## 功能概览

- 首页 Dashboard：学习统计、复习进度、表达训练空状态引导
- 真题考试：67 套试卷框架入库，支持考试列表、考试进行页、答题保存、提交与解析流程
- 阅读练习：复用真题阅读数据，支持文章筛选、答题、解析和错题收录
- 单词本：四级、六级、考研词库结构，支持筛选、搜索和熟悉度复习
- 错题本：自动收录错题，支持标记掌握/恢复复习
- 翻译写作：可独立练习和展示题目
- Electron 桌面端：打包本地前后端与 SQLite 数据库，适合作为 PC 软件运行

## 技术栈

- Frontend：React 18、Vite、lucide-react
- Backend：Node.js、Express
- Database：SQLite，本地数据库文件位于 `backend/data/english_exam.db`
- Desktop：Electron
- Package manager：pnpm workspace

## 项目结构

```text
kaoyan-english-lab/
  backend/
    src/
    data/
      english_exam.db
  frontend/
    src/
      App.jsx
      api.js
      components/
      styles.css
      styles/
    dist/
  electron/
    main.js
    preload.js
  scripts/
    runFullImport.mjs
    runImportMinimal.mjs
    verifyImport.mjs
  docs/
  package.json
  pnpm-workspace.yaml
  pnpm-lock.yaml
```

## 环境要求

- Node.js 18 或更高版本
- pnpm
- Windows 10/11 推荐用于当前桌面端脚本

安装依赖：

```bash
pnpm install
```

## 开发模式

同时启动前端和后端：

```bash
pnpm run dev
```

常用地址：

- 前端：http://localhost:5173
- 后端：http://localhost:3001 或脚本指定端口

## 构建前端

```bash
pnpm --dir frontend build
```

构建输出目录：

```text
frontend/dist/
```

## 启动桌面端

使用已有构建产物快速启动：

```bash
run-electron-dev.bat
```

构建并启动：

```bash
run-electron.bat
```

也可以使用 package scripts：

```bash
pnpm run electron:direct
pnpm run electron:dev
```

## 数据导入与验证

当前项目支持 SQLite 降级导入，数据库文件：

```text
backend/data/english_exam.db
```

常用脚本：

```bash
node scripts/runFullImport.mjs
node scripts/runImportMinimal.mjs
node scripts/verifyImport.mjs
```

阅读数据修复 SQL：

```bash
sqlite3 backend/data/english_exam.db < fix_all_reading.sql
```

## 代码质量

提交前建议运行：

```bash
pnpm --dir frontend build
```

## 维护说明

- 业务数据优先通过脚本增量导入，避免删除重建数据库
- 试卷、题目、阅读文章和音频关联通过 SQLite 保存，后续可迁移到 MongoDB
- 前端页面尽量复用统一设计令牌与全局样式，避免分散写死颜色和阴影
- Electron 只作为包装层，前端和后端业务代码保持独立
