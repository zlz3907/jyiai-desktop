const { app, BrowserWindow, ipcMain, BrowserView } = require('electron')
const path = require('path')
const TabManager = require('./windows/tabs')
const { BrowserWindowManager } = require('./windows/browser')
class Application {
    constructor() {
        // 设置环境变量
        // process.env.NODE_ENV = process.env.NODE_ENV || 'development'
        
        this.mainWindow = null
        this.tabManager = null
        this.browserWindowManager = new BrowserWindowManager()
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

        // 加载主窗口HTML
        // this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
        this.mainWindow.loadURL('http://localhost:59001/desktop')
        // 初始化标签管理器
        this.tabManager = new TabManager(this.mainWindow)
        // 延迟创建初始标签
        // this.tabManager.createTab('https://www.baidu.com/', { useProxy: false })
        // this.tabManager.createTab('https://wwww.google.com', { useProxy: true })
        // 设置IPC处理程序
        this.setupIPC()

        // 测试
        // const view = new BrowserView()
        // view.setBounds({ x: 0, y: 0, width: 800, height: 600 })
        // this.mainWindow.addBrowserView(view)
        // view.webContents.loadURL('https://www.baidu.com')

        // 如果是开发环境，打开开发者工具
        // console.log('process.env.NODE_ENV', process.env.NODE_ENV)
        if (process.env.NODE_ENV === 'development') {
            console.log('Opening DevTools in development mode')
            this.mainWindow.webContents.openDevTools()
        }
        
    }

    setupIPC() {
        ipcMain.handle('window:openUrl', (event, options) => {
            // console.log('window:openUrl', options)
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
    }

    async start() {
        await app.whenReady()
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