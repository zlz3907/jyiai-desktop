const { app, BaseWindow, ipcMain, Menu, WebContentsView } = require('electron')
const path = require('path')
const TabManager = require('./windows/tabs')
const { BrowserWindowManager } = require('./windows/browser')
const { autoUpdater } = require('electron-updater')
const LayoutManager = require('./windows/layout')

app.name = 'AIMetar'
app.setName('AIMetar')

class Application {
    constructor() {
        this.mainWindow = null
        this.tabManager = null
        this.browserWindowManager = new BrowserWindowManager()
        // 禁用 FIDO 和蓝牙相关功能
        app.commandLine.appendSwitch('disable-features', 'WebAuthentication,WebUSB,WebBluetooth')

        // 配置自动更新
        autoUpdater.autoDownload = false
        autoUpdater.checkForUpdatesAndNotify()
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

        // 加载默认页面
        this.topView.webContents.loadURL('http://localhost:59001/desktop')

        // 初始化标签管理器，传入 contentView 和 topView
        this.tabManager = new TabManager(this.mainWindow.contentView, this.topView)

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
        ipcMain.handle('window:openUrl', (event, options) => {
            this.browserWindowManager.createWindow(options)
        })
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
            this.tabManager.goBack()
        })

        ipcMain.handle('navigate-forward', () => {
            this.tabManager.goForward()
        })

        ipcMain.handle('navigate-reload', () => {
            this.tabManager.reload()
        })

        ipcMain.handle('navigate-to-url', (event, url) => {
            this.tabManager.loadURL(url)
        })

        // 获取标签信息
        ipcMain.handle('get-tab-info', (event, tabId) => {
            return this.tabManager.getTabInfo(tabId)
        })

        // 添加布局相关的 IPC 处理
        ipcMain.handle('layout:toggle-top', (event, show) => {
            this.layoutManager.toggleView(this.layoutManager.getTopView(), show)
        })

        ipcMain.handle('layout:toggle-bottom', (event, show) => {
            this.layoutManager.toggleView(this.layoutManager.getBottomView(), show)
        })

        ipcMain.handle('layout:load-content', (event, { topUrl, bottomUrl }) => {
            this.layoutManager.loadContent(topUrl, bottomUrl)
        })

        ipcMain.handle('show-tabs-menu', (event, { x, y, menuUrl }) => {
            if (!menuUrl) {
                console.error('Menu URL is required')
                return Promise.reject(new Error('Menu URL is required'))
            }
            return this.tabManager.createTabsMenu(x, y, menuUrl)
        })

        ipcMain.on('menu-close', () => {
            if (this.tabManager.menuView) {
                this.tabManager.closeTabsMenu()
            }
        })

        ipcMain.on('tab-command', (event, command) => {
            this.topView.webContents.send('tab-command', command)
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
        autoUpdater.on('update-available', () => {
            // 处理更新可用的情况
        })
        
        autoUpdater.on('update-downloaded', () => {
            // 处理更新下载完成的情况
        })
    }
}

// const menu = Menu.buildFromTemplate(template);
// Menu.setApplicationMenu(menu);


const application = new Application()
application.start() 