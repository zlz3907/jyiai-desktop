const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { proxyConfig } = require('./config/proxy')
const { BrowserWindowManager } = require('./windows/browser')

class Application {
  constructor() {
    this.mainWindow = null
    this.browserManager = new BrowserWindowManager(proxyConfig)
  }

  initIPC() {
    ipcMain.handle('window:openUrl', async (event, options) => {
      return await this.browserManager.createWindow(options)
    })
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        preload: path.join(__dirname, '../preload/sdk.js')
      }
    })

    this.mainWindow.loadURL('https://ai.zhycit.com')

    if (process.argv.includes('--inspect')) {
      this.mainWindow.webContents.openDevTools()
    }
  }

  async start() {
    await app.whenReady()
    this.initIPC()
    this.createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow()
      }
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })
  }
}

const application = new Application()
application.start() 