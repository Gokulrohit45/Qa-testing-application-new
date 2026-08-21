const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, exec } = require("child_process");
const http = require("http");

let mainWindow = null;
let pythonProcess = null;

function getPythonEnginePath() {
  if (app.isPackaged) {
    const packagedExe = path.join(process.resourcesPath, "python_engine", "app.exe");
    if (fs.existsSync(packagedExe)) return { type: "exe", path: packagedExe };
    const packagedPy = path.join(process.resourcesPath, "backend", "app.py");
    if (fs.existsSync(packagedPy)) return { type: "script", path: packagedPy };
  }
  return { type: "script", path: path.join(__dirname, "..", "..", "backend", "app.py") };
}

function startPythonBackend() {
  const target = getPythonEnginePath();
  console.log("[Electron] Starting Python Backend from:", target.path);
  
  try {
    if (target.type === "exe") {
      pythonProcess = spawn(target.path, [], { cwd: path.dirname(target.path), env: { ...process.env, PORT: "5000" } });
    } else {
      // Try venv python first if available
      const venvPythonWin = path.join(path.dirname(target.path), "venv", "Scripts", "python.exe");
      const pythonCmd = fs.existsSync(venvPythonWin) ? venvPythonWin : "python";
      pythonProcess = spawn(pythonCmd, [target.path], { cwd: path.dirname(target.path), env: { ...process.env, PORT: "5000" } });
    }

    if (pythonProcess) {
      pythonProcess.on("error", (err) => {
        console.error("[Electron] Failed to start Python backend (Python might not be in PATH):", err);
      });
      pythonProcess.stdout?.on("data", (data) => console.log(`[Python Engine] ${data}`));
      pythonProcess.stderr?.on("data", (data) => console.error(`[Python Engine Error] ${data}`));
    }
  } catch (err) {
    console.error("[Electron] Exception during spawning Python process:", err);
  }
}

function waitForBackend(callback, retries = 50) {
  http.get("http://127.0.0.1:5000/api/health", (res) => {
    if (res.statusCode === 200) callback();
    else if (retries > 0) setTimeout(() => waitForBackend(callback, retries - 1), 100);
    else callback();
  }).on("error", () => {
    if (retries > 0) setTimeout(() => waitForBackend(callback, retries - 1), 100);
    else callback();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: "QA-AI Autonomous Testing Platform",
    backgroundColor: "#0B0F17",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  startPythonBackend();
  waitForBackend(() => createWindow());
});

app.on("window-all-closed", () => {
  if (process.platform === "win32") exec("taskkill /F /IM app.exe /T", () => {});
  if (pythonProcess) pythonProcess.kill();
  if (process.platform !== "darwin") app.quit();
});
