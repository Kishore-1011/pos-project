const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

// Helper to determine crash log location safely
const getCrashLogPath = () => {
  try {
    const userData = app.isReady()
      ? app.getPath('userData')
      : (process.env.APPDATA ? path.join(process.env.APPDATA, 'pos-project') : process.cwd());
    if (!fs.existsSync(userData)) {
      fs.mkdirSync(userData, { recursive: true });
    }
    return path.join(userData, 'crash.log');
  } catch (e) {
    return path.join(process.cwd(), 'crash.log');
  }
};

// Log all crashes to a debug file in AppData and show error box
const logError = (error) => {
  try {
    const logPath = getCrashLogPath();
    const errorMsg = `[${new Date().toISOString()}] ${error ? (error.stack || error) : 'Unknown error'}\n\n`;
    fs.appendFileSync(logPath, errorMsg);
    console.error('[Electron Crash Logged]:', error);
    dialog.showErrorBox(
      'Application Error',
      `${(error && (error.message || error)) || 'Unknown Error'}\n\nCheck crash.log in AppData for details.`
    );
  } catch (e) {
    console.error('Failed to write log:', e);
  }
};

process.on('uncaughtException', (err) => logError(err));
process.on('unhandledRejection', (err) => logError(err));

let mainWindow = null;

// Start Express Backend inside the Electron lifecycle
function startBackend() {
  try {
    const serverIndex = path.join(__dirname, '..', 'server', 'src', 'index.js');
    if (fs.existsSync(serverIndex)) {
      require(serverIndex);
      console.log('[Electron] Embedded backend initialized.');
    } else {
      const err = new Error(`Server entry file not found at: ${serverIndex}`);
      console.error('[Electron]', err);
      logError(err);
    }
  } catch (err) {
    console.error('[Electron] Failed to start backend server:', err);
    logError(err);
  }
}

function createWindow() {
  const iconDist = path.join(__dirname, '..', 'client', 'dist', 'favicon.svg');
  const iconPublic = path.join(__dirname, '..', 'client', 'public', 'favicon.svg');
  const iconPath = fs.existsSync(iconDist) ? iconDist : (fs.existsSync(iconPublic) ? iconPublic : undefined);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: 'POS Project',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  // Load production bundle if built, or local dev server
  const clientDist = path.join(__dirname, '..', 'client', 'dist', 'index.html');
  if (fs.existsSync(clientDist)) {
    mainWindow.loadFile(clientDist);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle initialization: userData accessed ONLY inside app.whenReady()
app.whenReady().then(() => {
  const isPackaged = app.isPackaged;
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'data');
  const uploadsDir = path.join(userDataPath, 'uploads', 'items');

  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const dbPath = path.join(dbDir, 'pos_project.db');

  // Pass paths to backend processes and database manager
  process.env.POS_IS_PACKAGED = isPackaged ? 'true' : 'false';
  process.env.POS_USER_DATA_PATH = userDataPath;
  process.env.POS_DB_PATH = dbPath;
  process.env.POS_UPLOADS_PATH = uploadsDir;

  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
