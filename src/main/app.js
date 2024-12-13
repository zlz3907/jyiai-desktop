const { app, BrowserWindow, ipcMain, BrowserView, Menu } = require('electron')
const path = require('path')
const TabManager = require('./windows/tabs')
const { BrowserWindowManager } = require('./windows/browser')
const { autoUpdater } = require('electron-updater')
app.name = 'AIMetar'
app.setName('AIMetar')
class Application {
    constructor() {
        // 设置环境变量
        // process.env.NODE_ENV = process.env.NODE_ENV || 'development'
        
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
        this.mainWindow = new BrowserWindow({
            width: 1215,
            height: 751,
            minWidth: 800,
            minHeight: 600,
            darkTheme: true,
            // frame: false,
            // show: false,
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
            // backgroundColor: '#2f3241',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: true,
                sandbox: true,
                enableRemoteModule: true,
                preload: path.join(__dirname, '../preload/sdk.js'),
            }
        })

        if (process.platform !== 'darwin') {
            // this.mainWindow.setWindowButtonVisibility(false)
            // this.mainWindow.se
        }
        

        // 加载主窗口HTML
        // this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
        this.mainWindow.loadURL('http://localhost:59001/desktop')
        Menu.setApplicationMenu(null)
        // 初始化标签管理器
        this.tabManager = new TabManager(this.mainWindow)
        // 延迟创建初始标签
        // this.tabManager.createTab('https://www.baidu.com/', { useProxy: false })
        // this.tabManager.createTab('https://wwww.google.com', { useProxy: true })
        // 设置IPC处理程序
        this.setupIPC()

        
        // this.injectWinEvents()
        // 测试
        // const view = new BrowserView()
        // view.setBounds({ x: 0, y: 0, width: 800, height: 600 })
        // this.mainWindow.addBrowserView(view)
        // view.webContents.loadURL('https://www.baidu.com')

        // 如果是开发环境，打开开发者工具
        // console.log('process.env.NODE_ENV', process.env.NODE_ENV)
        this.mainWindow.setAutoHideMenuBar(true)
        this.mainWindow.setMenu(null)
        if (process.env.NODE_ENV === 'development') {
            console.log('Opening DevTools in development mode')
            // this.mainWindow.webContents.openDevTools()
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

    injectWinEvents() {
        this.mainWindow.on('ready-to-show', () => {
            this.mainWindow.show()
        })
    }

    start() {
        app.whenReady().then(() => {
            this.createMainWindow()
        })

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

    setupAutoUpdater() {
        autoUpdater.on('update-available', () => {
            // 处理更新可用的情况
        })
        
        autoUpdater.on('update-downloaded', () => {
            // 处理更新下载完成的情况
        })
    }
}

const template = [
    {
        label: '应用',
        submenu: [
            {
                label: '关于',
                click: () => {
                    // 在这里放置关于对话框的逻辑
                    console.log('关于此应用');
                }
            },
            {
                type: 'separator' // 分隔线
            },
            {
                label: '退出',
                role: 'quit' // 退出应用
            }
        ]
    },
    {
        label: '编辑',
        submenu: [
            {
                label: '撤销',
                role: 'undo'
            },
            {
                label: '重做',
                role: 'redo'
            },
            { type: 'separator' },
            {
                label: '剪切',
                role: 'cut'
            },
            {
                label: '复制',
                role: 'copy'
            },
            {
                label: '粘贴',
                role: 'paste'
            }
        ]
    },
    {
        label: '查看',
        submenu: [
            {
                label: '刷新',
                role: 'reload'
            },
            {
                label: '强制重新加载',
                role: 'forceReload'
            },
            {
                label: '开发者工具',
                role: 'toggleDevTools'
            }
        ]
    }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);


const application = new Application()
application.start() 