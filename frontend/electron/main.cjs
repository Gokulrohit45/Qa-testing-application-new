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
  
  if (!fs.existsSync(target.path)) {
    console.warn("[Electron] Python script not found at target path:", target.path);
    return;
  }

  const scriptDir = path.dirname(target.path);
  const venvPython = path.join(scriptDir, "venv", "Scripts", "python.exe");

  let cmdsToTry = [];
  if (fs.existsSync(venvPython)) {
    cmdsToTry.push(venvPython);
  }
  cmdsToTry.push("python", "python3", "py");

  function trySpawn(index) {
    if (index >= cmdsToTry.length) {
      console.error("[Electron] All Python execution attempts failed.");
      return;
    }

    const cmd = cmdsToTry[index];
    console.log(`[Electron] Attempting to spawn Python daemon using '${cmd}'...`);

    try {
      const proc = spawn(cmd, [target.path], {
        cwd: scriptDir,
        env: { ...process.env, PORT: "5000" }
      });

      proc.stdout?.on("data", (data) => {
        console.log(`[Python Engine] ${data}`);
      });
      proc.stderr?.on("data", (data) => {
        console.error(`[Python Engine Log] ${data}`);
      });

      proc.on("error", (err) => {
        console.warn(`[Electron] Spawning '${cmd}' failed:`, err.message);
        trySpawn(index + 1);
      });

      pythonProcess = proc;
    } catch (err) {
      console.warn(`[Electron] Exception launching '${cmd}':`, err.message);
      trySpawn(index + 1);
    }
  }

  trySpawn(0);
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
