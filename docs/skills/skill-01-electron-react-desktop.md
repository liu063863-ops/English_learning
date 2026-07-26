---
title: "Skill 01: Electron + React 桌面应用快速封装"
category: skills
tags: [electron, react, desktop]
created: 2026-07-26
---

> **适用场景**：任何已有的 Web 项目（React/Vue/Angular）需要转为离线桌面端。

## 核心架构
┌─────────────────────────────────────────┐
│           Electron 主进程                │
│  ┌──────────────┐    ┌──────────────┐  │
│  │  React 前端   │◄──►│ Node.js 后端 │  │
│  │  (Vite构建)   │    │  (Express)   │  │
│  └──────────────┘    └──────────────┘  │
│         ▲                   ▲           │
│         │                   │           │
│    frontend/dist      backend/src       │
│         │                   │           │
│         └────────┬──────────┘           │
│                  SQLite                  │
│         backend/data/app.db             │
└─────────────────────────────────────────┘
plain

## 最小可用主进程

```javascript
// electron/main.js
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let backendProcess;

function startBackend() {
  backendProcess = spawn('node', ['backend/src/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3001' },
    shell: true
  });
}

function initDatabase() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'app.db');
  const sourceDb = path.join(__dirname, '../backend/data/app.db');
  if (!fs.existsSync(dbPath) && fs.existsSync(sourceDb)) {
    fs.copyFileSync(sourceDb, dbPath);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const indexPath = path.join(__dirname, '../dist/index.html');
  win.loadFile(indexPath);
}

app.whenReady().then(() => {
  initDatabase();
  startBackend();
  setTimeout(createWindow, 3000);
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  app.quit();
});
```
预加载脚本
JavaScript
```javascript
// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version')
});
```
package.json 配置
JSON
```json
{
  "main": "electron/main.js",
  "scripts": {
    "electron": "npm run build && electron .",
    "package:win": "npm run build && electron-builder --win"
  },
  "build": {
    "appId": "com.your-app",
    "files": ["dist/**/\*", "backend/**/*", "electron/\*\*/*"],
    "extraResources": [{"from": "backend/data", "to": "data"}],
    "win": { "target": "nsis" }
  }
}
```
关键要点
表格
要点	说明
后端子进程	Electron 启动 Node.js 服务，前端访问 localhost:3001
数据库迁移	首次启动复制到 %APPDATA%，避免更新覆盖用户数据
上下文隔离	preload.js 是唯一通信桥梁
进程清理	window-all-closed 时 kill 后端进程
开发/生产	开发用 loadURL，生产用 loadFile
常见坑
端口占用：后端启动前检查 3001 是否被占用
CORS：生产时前端直接访问本地服务，无需 CORS
路径：打包后用 process.resourcesPath 访问额外资源
补完后提交到 git：
bash
git add docs/skills/skill-01-electron-react-desktop.md
git commit -m "docs: add skill 01 - electron desktop packaging"
git push origin main
