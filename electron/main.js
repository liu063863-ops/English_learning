const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

let backendProcess = null;
let frontendServer = null;
let mainWindow = null;

let appPort = Number(process.env.ELECTRON_APP_PORT || 3000);
let backendPort = Number(process.env.ELECTRON_BACKEND_PORT || 3001);
const rootDir = path.join(__dirname, "..");
const frontendDist = path.join(rootDir, "frontend", "dist");
const logDir = path.join(rootDir, "logs");
const logFile = path.join(logDir, "electron.log");

initLogging();

function initLogging() {
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(logFile, `\n\n[${new Date().toISOString()}] Electron boot\n`, "utf8");
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => {
    writeLog("INFO", args);
    originalLog(...args);
  };
  console.error = (...args) => {
    writeLog("ERROR", args);
    originalError(...args);
  };
}

function writeLog(level, args) {
  const line = args.map((item) => item instanceof Error ? item.stack || item.message : String(item)).join(" ");
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] [${level}] ${line}\n`, "utf8");
}

function initDatabase() {
  const userDataPath = app.getPath("userData");
  const dbPath = path.join(userDataPath, "english_exam.db");
  const jsonStorePath = path.join(userDataPath, "kaoyan_english.json");
  const sourceDb = findDefaultDatabase();

  if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
  if (!fs.existsSync(dbPath) && fs.existsSync(sourceDb)) {
    fs.copyFileSync(sourceDb, dbPath);
    console.log(`Database initialized: ${dbPath}`);
  } else if (!fs.existsSync(dbPath)) {
    console.log("Default SQLite database not found; backend will create fallback data if possible.");
  }

  return { dbPath, jsonStorePath };
}

function findDefaultDatabase() {
  const candidates = [
    path.join(rootDir, "backend", "data", "english_exam.db"),
    path.join(rootDir, "backend", "data", "english_exam.db.sample")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function startBackend(dataPaths) {
  const backendCommands = resolveBackendCommands();
  spawnBackendWithFallback(backendCommands, dataPaths, 0);
}

function spawnBackendWithFallback(commands, dataPaths, index) {
  const backendCommand = commands[index];
  if (!backendCommand) {
    console.error("No backend command could be started.");
    return;
  }

  console.log(`Starting backend with: ${backendCommand.command} ${backendCommand.args.join(" ")}`);
  backendProcess = spawn(backendCommand.command, backendCommand.args, {
    cwd: rootDir,
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      ...backendCommand.env,
      PORT: String(backendPort),
      DB_PATH: dataPaths.dbPath,
      SQLITE_DB_PATH: dataPaths.dbPath,
      JSON_STORE_PATH: dataPaths.jsonStorePath
    }
  });

  backendProcess.stdout.on("data", (data) => {
    console.log(`Backend: ${data}`);
  });

  backendProcess.stderr.on("data", (data) => {
    console.error(`Backend error: ${data}`);
  });

  backendProcess.on("exit", (code, signal) => {
    console.log(`Backend exited: code=${code}, signal=${signal}`);
    if (code !== 0 && index + 1 < commands.length) {
      console.log("Retrying backend with fallback command...");
      spawnBackendWithFallback(commands, dataPaths, index + 1);
    }
  });

  backendProcess.on("error", (error) => {
    console.error("Failed to start backend process", error);
  });
}

function resolveBackendCommands() {
  const backendEntry = path.join(rootDir, "backend", "src", "index.js");
  const commands = [];

  if (app.isPackaged) {
    commands.push({
      command: process.execPath,
      args: [backendEntry],
      env: { ELECTRON_RUN_AS_NODE: "1" }
    });
  } else {
    commands.push({
      command: process.execPath,
      args: [backendEntry],
      env: { ELECTRON_RUN_AS_NODE: "1" }
    });
  }

  const localNode = "C:/Users/liujinhao/AppData/Local/nodejs/node-v22.12.0-win-x64/node.exe";
  const bundledNode = "C:/Users/liujinhao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe";
  [localNode, bundledNode, "node"].forEach((command) => {
    commands.push({ command, args: [backendEntry], env: {} });
  });

  return commands;
}

function startFrontendServer() {
  if (!fs.existsSync(path.join(frontendDist, "index.html"))) {
    throw new Error(`Frontend dist not found. Please run: npm run build --workspace frontend`);
  }

  frontendServer = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${appPort}`);

    if (url.pathname.startsWith("/api/")) {
      proxyToBackend(req, res);
      return;
    }

    serveStaticFile(url.pathname, res);
  });

  return new Promise((resolve, reject) => {
    frontendServer.once("error", reject);
    frontendServer.listen(appPort, "127.0.0.1", resolve);
  });
}

function proxyToBackend(req, res) {
  const options = {
    hostname: "127.0.0.1",
    port: backendPort,
    path: req.url,
    method: req.method,
    headers: req.headers
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (error) => {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: `Backend unavailable: ${error.message}` }));
  });

  req.pipe(proxyReq);
}

function serveStaticFile(urlPath, res) {
  const safePath = decodeURIComponent(urlPath.split("?")[0]);
  const candidate = path.normalize(path.join(frontendDist, safePath));
  const distRoot = path.normalize(frontendDist);
  const filePath = candidate.startsWith(distRoot) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate
    : path.join(frontendDist, "index.html");

  res.writeHead(200, { "Content-Type": contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg"
  }[ext] || "application/octet-stream";
}

async function waitForBackend(timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await canConnect(backendPort)) return;
    await delay(300);
  }
  throw new Error(`Backend did not start on port ${backendPort}`);
}

async function findAvailablePort(startPort) {
  let port = startPort;
  while (await canConnect(port)) port += 1;
  return port;
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createWindow() {
  const iconPath = path.join(rootDir, "public", "favicon.ico");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: "#f6faf7",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${appPort}`);

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Window failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });
}

app.whenReady().then(async () => {
  try {
    console.log(`Root: ${rootDir}`);
    console.log(`Frontend dist: ${frontendDist}`);
    const useExternalBackend = process.env.ELECTRON_EXTERNAL_BACKEND === "1";
    if (!useExternalBackend) backendPort = await findAvailablePort(backendPort);
    appPort = await findAvailablePort(appPort);
    console.log(`Ports: app=${appPort}, backend=${backendPort}`);
    const dataPaths = initDatabase();
    console.log(`SQLite DB: ${dataPaths.dbPath}`);
    console.log(`JSON store: ${dataPaths.jsonStorePath}`);
    if (useExternalBackend) console.log(`Using external backend on port ${backendPort}`);
    else startBackend(dataPaths);
    await waitForBackend();
    await startFrontendServer();
    console.log(`Frontend server: http://127.0.0.1:${appPort}`);
    createWindow();
  } catch (error) {
    console.error(error);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (backendProcess) backendProcess.kill();
  if (frontendServer) frontendServer.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (backendProcess) backendProcess.kill();
  if (frontendServer) frontendServer.close();
});
