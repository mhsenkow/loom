import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV !== 'production'

function getWindowExpandedState(): boolean {
  if (!mainWindow) return false
  return mainWindow.isFullScreen() || mainWindow.isMaximized()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false, // Frameless for custom title bar
    backgroundColor: '#050505',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 }, // Hide macOS traffic lights
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send(
      'window-maximized-changed',
      getWindowExpandedState()
    )
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized-changed', getWindowExpandedState())
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximized-changed', getWindowExpandedState())
  })

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window-maximized-changed', getWindowExpandedState())
  })

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('window-maximized-changed', getWindowExpandedState())
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Window control IPC handlers
ipcMain.on('window-minimize', () => {
  mainWindow?.minimize()
})

ipcMain.on('window-maximize', () => {
  if (!mainWindow) return
  mainWindow.setFullScreen(!mainWindow.isFullScreen())
})

ipcMain.on('window-close', () => {
  mainWindow?.close()
})

ipcMain.handle('window-is-maximized', () => {
  return getWindowExpandedState()
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
