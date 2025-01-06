import { app, BaseWindow, ipcMain, Menu, WebContentsView } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import { getConfigLoader, getSystemConfig } from './config/index.js'
import { createApplicationMenu } from './config/menu.js'
import TabManager from './windows/tabs/TabManager.js'
import { setupIPC } from '../ipc/index.js'

// 获取 __dirname 等价物
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 读取 package.json
const packageJson = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8'))

// 初始化应用名称
app.name = 'AIMetar'
app.setName('AIMetar')

// 修改版本信息的获取方式
const APP_VERSION = packageJson.version;
const BUILD_NUMBER = '1';

// 启动应用
getConfigLoader({
  env: process.env.NODE_ENV,
  configApiUrl: process.env.CONFIG_API_URL
})
.then(() => {
  const application = new Application()
  application.start()
})
.catch(error => {
  console.error('Failed to initialize config:', error)
  app.quit()
})

class Application {
  constructor() {
    this.mainWindow = null
    this.tabManager = null
    this.ipcInitialized = false
    // this.browserWindowManager = new BrowserWindowManager()
    // 初始化系统配置
    this.systemConfig = getSystemConfig()

    // 禁用 FIDO 和蓝牙相关功能
    app.commandLine.appendSwitch('disable-features', 'WebAuthentication,WebUSB,WebBluetooth')

    // 配置自动更新
    if (app.isPackaged) {  // 只在打包环境下启用自动更新
      autoUpdater.logger = console  // 添加日志输出
      autoUpdater.autoDownload = false
      
      // 添加更新事件处理
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

      // 检查更新
      try {
        autoUpdater.checkForUpdatesAndNotify().catch(error => {
          console.warn('Auto update check failed:', error)
        })
      } catch (error) {
        console.warn('Failed to setup auto updater:', error)
      }
    }
  }

  createMainWindow() {
    console.log(`process.platform: ${process.platform}`)
    
    // 获取窗口尺寸，确保是数字
    const _boundsConfig = this.systemConfig.get('bounds')
    
    // 使用 BaseWindow 创建主窗口
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
          // color: '#2f3241',
          // symbolColor: '#74b1be',
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

    // 创建顶部视图（工具栏和标签栏）
    this.topView = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        preload: path.join(__dirname, '../preload/sdk.js'),
      }
    })

    // 将顶部视图添加到主窗口
    this.mainWindow.contentView.addChildView(this.topView)

    // 设置顶部视图的位置和大小
    const bounds = this.mainWindow.getBounds()

    this.topView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: _boundsConfig?.topView?.height
    })

    // 加载默认页面
    const baseUrl = this.systemConfig.get('baseUrl')
    this.topView.webContents.loadURL(`${baseUrl}/desktop`)
    // this.topView.webContents.openDevTools({ mode: 'detach' })

    // 初始化标签管理器
    this.tabManager = new TabManager(this.mainWindow, this.topView)
    
    // 设置IPC处理程序
    if (!this.ipcInitialized) {
      setupIPC(this.tabManager)
      this.ipcInitialized = true
    }

    // 创建应用菜单 - 移到这里，确保 tabManager 已经初始化
    createApplicationMenu(this.mainWindow, this.tabManager)

    // 监听窗口大小改变
    this.mainWindow.on('resize', () => {
      // 更新当前活动标签的大小
      this.tabManager.updateActiveViewBounds()
    })

    // if (process.env.NODE_ENV === 'development') {
    //   console.log('Opening DevTools in development mode')
    //   this.topView.webContents.openDevTools({ mode: 'detach' })
    // }
  }

  start() {
    app.whenReady().then(() => {
      this.createMainWindow()
    })

    app.on('activate', () => {
      if (BaseWindow.getAllWindows().length === 0) {
        this.createMainWindow()
      }
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })
  }

  setupAutoUpdater() {
    // 配置更新服务器
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'zhycit',
      repo: 'jyiai-desktop',
      private: true,
      token: process.env.GH_TOKEN  // 从环境变量获取 GitHub token
    })

    // 配置自动更新行为
    autoUpdater.autoDownload = false
    autoUpdater.logger = console  // 添加日志输出

    // 添加更新事件处理
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

    // 检查更新
    try {
      autoUpdater.checkForUpdatesAndNotify().catch(error => {
        console.warn('Auto update check failed:', error)
      })
    } catch (error) {
      console.warn('Failed to setup auto updater:', error)
    }
  }
} 