import { app, BaseWindow, ipcMain, Menu, WebContentsView } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import path from 'path'
import { fileURLToPath } from 'url'
import { getConfigLoader, getSystemConfig } from './config/index.js'
// import { BrowserWindowManager } from './windows/browser.js'
import TabManager from './windows/tabs/TabManager.js'
import store from './utils/store.js'
import packageJson from '../../package.json'

// 获取 __dirname 等价物
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
    // this.browserWindowManager = new BrowserWindowManager()
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
    
    // 使用 BaseWindow 创建主窗口
    this.mainWindow = new BaseWindow({
      width: 1215,
      height: 751,
      minWidth: 800,
      minHeight: 600,
      darkTheme: true,
      autoHideMenuBar: true,
      ...(process.platform !== 'darwin' ? {
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          color: '#2f3241',
          symbolColor: '#74b1be',
          height: 32
        }
      } : {
        titleBarStyle: 'hiddenInset',
      }),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        sandbox: true,
        enableRemoteModule: true,
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
        sandbox: true,
        enableRemoteModule: true,
        preload: path.join(__dirname, '../preload/sdk.js'),
      }
    })

    // 将顶部视图添加到主窗口
    this.mainWindow.contentView.addChildView(this.topView)

    // 设置顶部视图的位置和大小
    const bounds = this.mainWindow.getBounds()
    const topHeight = 72 // 根据需求文档设置高度

    this.topView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: topHeight
    })

    // 获取系统配置
    const systemConfig = getSystemConfig()
    const baseUrl = systemConfig.get('baseUrl')

    // 加载默认页面
    this.topView.webContents.loadURL(`${baseUrl}/desktop`)
    // this.topView.webContents.openDevTools({ mode: 'detach' })

    // 初始化标签管理器
    this.tabManager = new TabManager(this.mainWindow, this.topView)
    
    const newBounds = this.mainWindow.getBounds()
    // 更新顶部视图大小
    this.topView.setBounds({
      x: 0,
      y: 0,
      width: newBounds.width,
      height: topHeight
    })

    // 监听窗口大小改变
    this.mainWindow.on('resize', () => {
      // 更新当前活动标签的大小
      this.tabManager.updateActiveViewBounds()
    })

    // 设置IPC处理程序
    this.setupIPC()

    if (process.env.NODE_ENV === 'development') {
      console.log('Opening DevTools in development mode')
      this.topView.webContents.openDevTools({ mode: 'detach' })
    }
  }

  setupIPC() {
    // ipcMain.handle('open-url', (event, url, options = {}) => {
    //   console.log('open-url', url, options)
    //   return this.browserWindowManager.createWindow({ url, ...options })
    // })
    // 标签页操作
    ipcMain.handle('create-tab', (event, url, options = {}) => {
      console.log('create-tab', url, options)
      return this.tabManager.createTab(url, options)
    })

    ipcMain.handle('switch-tab', (event, tabId) => {
      this.tabManager.switchTab(tabId)
    })

    ipcMain.handle('close-tab', (event, tabId) => {
      this.tabManager.closeTab(tabId)
    })

    // 导航操作
    ipcMain.handle('navigate-back', () => {
      const activeTab = this.tabManager.tabs.get(this.tabManager.activeTabId)
      if (activeTab?.webContents.canGoBack()) {
        activeTab.webContents.goBack()
      }
    })

    ipcMain.handle('navigate-forward', () => {
      const activeTab = this.tabManager.tabs.get(this.tabManager.activeTabId)
      if (activeTab?.webContents.canGoForward()) {
        activeTab.webContents.goForward()
      }
    })

    ipcMain.handle('navigate-reload', () => {
      const activeTab = this.tabManager.tabs.get(this.tabManager.activeTabId)
      if (activeTab) {
        activeTab.webContents.reload()
      }
    })

    ipcMain.handle('navigate-to-url', (event, url) => {
      const activeTab = this.tabManager.tabs.get(this.tabManager.activeTabId)
      if (activeTab) {
        activeTab.webContents.loadURL(url)
      }
    })

    // 获取标签信息
    ipcMain.handle('get-tab-info', (event, tabId) => {
      return this.tabManager.stateManager.getState(tabId)
    })

    ipcMain.handle('show-tabs-menu', (event, { postion, menuUrl, payload }) => {
      if (!menuUrl) {
        console.error('Menu URL is required')
        return Promise.reject(new Error('Menu URL is required'))
      }
      return this.tabManager.createTabsMenu(postion, menuUrl, payload)
    })

    ipcMain.on('menu-close', () => {
      if (this.tabManager.menuView) {
        this.tabManager.closeTabsMenu()
      }
    })

    ipcMain.on('tab-command', (event, command) => {
      this.topView.webContents.send('tab-command', command)
    })

    // 处理存储相关IPC
    ipcMain.handle('store:set', async (event, key, value) => {
      store.setItem(key, value)
    })

    ipcMain.handle('store:get', async (event, key) => {
      return store.getItem(key)
    })
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