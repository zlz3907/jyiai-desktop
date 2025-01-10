import { app, BaseWindow, ipcMain, Menu, WebContentsView, dialog } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import path from 'path'
import { fileURLToPath } from 'url'
import { readFile } from 'fs/promises'
import { getConfigLoader, getSystemConfig } from './config/index.js'
import { createApplicationMenu } from './config/menu.js'
import TabManager from './windows/tabs/TabManager.js'
import { setupIPC } from '../ipc/index.js'
import store from './utils/store.js'

// 获取 __dirname 等价物
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 初始化应用
function initialize() {
  try {
    // 读取 package.json
    readFile(path.join(__dirname, '../../package.json'), 'utf8').then((data) => {
      const packageJson = JSON.parse(data)

      // 初始化应用名称
      app.name = 'AIMetar'
      app.setName('AIMetar')

      // 修改版本信息的获取方式
      const APP_VERSION = packageJson.version
      const BUILD_NUMBER = '1'

      // 启动应用
      getConfigLoader({
        env: process.env.NODE_ENV,
        configApiUrl: process.env.CONFIG_API_URL
      }).then(() => {
        const application = new Application()
        application.start()
      })
    })
  } catch (error) {
    console.error('Failed to initialize app:', error)
    app.quit()
  }
}

// 运行初始化
initialize()

class Application {
  constructor() {
    this.mainWindow = null
    this.tabManager = null
    this.ipcInitialized = false
    this.systemConfig = null
    this.isQuitting = false

    // 禁用 FIDO 和蓝牙相关功能
    app.commandLine.appendSwitch('disable-features', 'WebAuthentication,WebUSB,WebBluetooth')

    // 配置自动更新
    if (app.isPackaged) {
      autoUpdater.logger = console
      autoUpdater.autoDownload = false

      autoUpdater.on('error', (error) => {
        console.error('Update error:', error)
      })

      autoUpdater.on('checking-for-update', () => {
        console.log('Checking for updates...')
      })

      autoUpdater.on('update-available', (info) => {
        console.log('Update available:', info)
      })

      autoUpdater.on('update-not-available', (info) => {
        console.log('Update not available:', info)
      })

      try {
        autoUpdater.checkForUpdatesAndNotify().catch(error => {
          console.warn('Auto update check failed:', error)
        })
      } catch (error) {
        console.warn('Failed to setup auto updater:', error)
      }
    }
  }

  start() {
    app.whenReady().then(() => {
      this.createMainWindow()

      app.on('activate', () => {
        if (BaseWindow.getAllWindows().length === 0) {
          this.createMainWindow()
        } else {
          if (this.mainWindow.isMinimized()) {
            this.mainWindow.restore()
          } else if (!this.mainWindow.isVisible()) {
            this.mainWindow.show()
          }
          this.mainWindow.focus()
        }
      })

      app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
          app.quit()
        }
      })

      // 在用户通过系统菜单退出时设置 isQuitting 标志
      app.on('before-quit', async () => {
        this.isQuitting = true
      })
    })
  }
  
  createMainWindow() {
    console.log(`process.platform: ${process.platform}`)
    
    this.systemConfig = getSystemConfig()

    const _boundsConfig = this.systemConfig.get('bounds')

    this.mainWindow = new BaseWindow({
      width: _boundsConfig?.mainWindow?.width,
      height: _boundsConfig?.mainWindow?.height,
      minWidth: _boundsConfig?.mainWindow?.minWidth,
      minHeight: _boundsConfig?.mainWindow?.minHeight,
      darkTheme: true,
      autoHideMenuBar: true,
      ...(process.platform !== 'darwin' ? {
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          height: 32
        }
      } : {
        titleBarStyle: 'hiddenInset',
      }),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        preload: path.join(__dirname, '../preload/sdk.js'),
      }
    })

    Menu.setApplicationMenu(null)
    this.mainWindow.setAutoHideMenuBar(true)
    this.mainWindow.setMenu(null)

    this.topView = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        preload: path.join(__dirname, '../preload/sdk.js'),
      }
    })

    this.mainWindow.contentView.addChildView(this.topView)

    const bounds = this.mainWindow.getBounds()

    this.topView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: _boundsConfig?.topView?.height
    })

    const baseUrl = this.systemConfig.get('baseUrl')
    this.topView.webContents.loadURL(`${baseUrl}/desktop`)

    this.tabManager = new TabManager(this.mainWindow, this.topView)
    
    if (!this.ipcInitialized) {
      setupIPC(this.tabManager)
      this.ipcInitialized = true
    }

    createApplicationMenu(this.mainWindow, this.tabManager)

    this.mainWindow.on('resize', () => {
      this.tabManager.updateActiveViewBounds()
    })

    this.mainWindow.on('close', async (event) => {
      if (this.isQuitting) {
        return;
      }

      event.preventDefault();
      let choice = store.getItem('dontAskOnClose');
      if (isNaN(choice)) {
        const { response, checkboxChecked } = await dialog.showMessageBox(this.mainWindow, {
          type: 'question',
          buttons: ['最小化', '取消', '退出'],
          title: '确认',
          message: '您想要退出应用程序还是最小化窗口？',
          cancelId: 1,
          checkboxLabel: '不再提示',
          checkboxChecked: false
        });
        choice = response;
        if (checkboxChecked && response !== 1) {
          store.setItem('dontAskOnClose', response);
        }
      }

      switch (choice) {
        case 0:
          this.mainWindow.minimize();
          break;
        case 2:
          this.isQuitting = true;
          app.quit();
          break;
      }
      
    });
  }

  async initializeOptionalFeatures() {
    if (app.isPackaged) {
      await this.setupAutoUpdater()
    }
    
    this.setupExtendedFeatures()
  }

  setupExtendedFeatures() {
    console.log('Initializing extended features...')
  }

  setupAutoUpdater() {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'zhycit',
      repo: 'jyiai-desktop',
      private: true,
      token: process.env.GH_TOKEN
    })

    autoUpdater.autoDownload = false
    autoUpdater.logger = console

    autoUpdater.on('error', (error) => {
      console.error('Update error:', error)
    })

    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for updates...')
    })

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info)
    })

    autoUpdater.on('update-not-available', (info) => {
      console.log('Update not available:', info)
    })

    try {
      autoUpdater.checkForUpdatesAndNotify().catch(error => {
        console.warn('Auto update check failed:', error)
      })
    } catch (error) {
      console.warn('Failed to setup auto updater:', error)
    }
  }
} 