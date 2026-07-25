const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");

let backendProcess;
let mainWindow;
const port = process.env.KAOYAN_DESKTOP_PORT || "4187";

function startBackend() {
  const nodeBin = process.env.NODE_BIN || "node";
  const backendEntry = path.join(__dirname, "..", "backend", "src", "index.js");

  backendProcess = spawn(nodeBin, [backendEntry], {
    cwd: path.join(__dirname, "..", "backend"),
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, PORT: port }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#f4f7f4"
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/desktop`);
}

app.whenReady().then(() => {
  startBackend();

  const waitForPage = setInterval(async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/api/health`);
      clearInterval(waitForPage);
      createWindow();
    } catch {
      // keep waiting
    }
  }, 500);
});

app.on("window-all-closed", () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (backendProcess) backendProcess.kill();
});
