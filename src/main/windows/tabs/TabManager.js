import { WebContentsView, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import SessionManager from './SessionManager.js'
import ProxyManager from './ProxyManager.js'
import TabStateManager from './TabStateManager.js'
import TabEventHandler from './TabEventHandler.js'
import { MessageType } from './constants.js'
import { getSystemConfig } from '../../config/index.js'

// 获取 __dirname 等价物
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 预加载脚本路径
const PRELOAD_SCRIPT_PATH = path.join(__dirname, '../../../preload/sdk.js')

class TabManager {
    constructor(mainWindow, topView) {
        this.mainWindow = mainWindow
        this.containerView = mainWindow.contentView
        this.topView = topView
        this.tabs = new Map()
        this.activeTabId = null
        this.toolbarHeight = 72
        this.menuView = null
        this.systemConfig = getSystemConfig()
        this.menuPopup = null

        // 初始化各个管理器
        this.stateManager = new TabStateManager(topView)
        this.eventHandler = new TabEventHandler(this.stateManager, this.systemConfig)
    }

    // 创建新标签页
    createTab(url = 'about:blank', options = {}) {
        // URL 验证和处理
        const validUrl = this._validateUrl(url)
        const tabId = options.tabId || Date.now().toString()

        try {
            // 创建和配置 session
            const customSession = SessionManager.createSession(options.useProxy)
            if (options.useProxy) {
                ProxyManager.configureProxy(customSession)
            }

            // 创建视图
            const view = this._createTabView(customSession, options)
            this.tabs.set(tabId, view)
            
            // 设置为活动标签页
            this.activeTabId = tabId
            
            // 初始化标签状态
            this.stateManager.updateState(tabId, {
                useProxy: options.useProxy || false,
                url: options?.navigate ? 'about:blank' : validUrl,
                title: options?.navigate ? 'about:blank' : 'New Tab',
                navigate: options?.navigate,
                isHome: options?.isHome || false
            }, MessageType.TAB_CREATED)

            // 设置事件监听
            const contents = view.webContents
            this.eventHandler.setupEvents(contents, tabId)
            contents.setUserAgent(contents.getUserAgent() + ' JYIAIBrowser')
            // 只在开发环境下打开 DevTools
            if (process.env.NODE_ENV === 'development') {
                // view.webContents.openDevTools({ mode: 'detach' })
            }

            // 先移除其他标签页的显示
            for (const [id, v] of this.tabs) {
                if (id !== tabId) {
                    this.containerView.removeChildView(v)
                }
            }

            // 添加新标签页到容器
            this.containerView.addChildView(view)
            
            // 更新新标签页的布局
            this.updateActiveViewBounds(options?.isHome)

            // 只在 URL 有效时加载
            if (validUrl && validUrl !== 'about:blank') {
                // console.log('Loading URL:', validUrl)
                contents.loadURL(validUrl, {
                    timeout: 30000,
                    extraHeaders: 'pragma: no-cache\n'
                }).catch(err => {
                    console.error('Failed to load URL:', err)
                    // 加载失败时更新状态
                    this.stateManager.updateState(tabId, {
                        error: {
                            code: err.code || 'LOAD_ERROR',
                            description: err.message
                        },
                        loading: false
                    }, MessageType.TAB_STATE_CHANGED)
                })
            }
            return tabId
        } catch (error) {
            console.error('Error creating tab:', error)
            throw error
        }
    }

    // 关闭标签页
    closeTab(tabId) {
        const view = this.tabs.get(tabId)
        if (!view) return

        // 从容器中移除
        this.containerView.removeChildView(view)
        
        // 销毁视图
        view.webContents.destroy()
        
        // 清理状态
        this.tabs.delete(tabId)
        this.stateManager.removeState(tabId)

        // 如果关闭的是当前活动标签，切换到其他标签
        if (this.activeTabId === tabId) {
            const remainingTabs = Array.from(this.tabs.keys())
            if (remainingTabs.length > 0) {
                this.activateTab(remainingTabs[remainingTabs.length - 1])
            } else {
                this.activeTabId = null
            }
        }
    }

    // 激活标签页
    activateTab(tabId) {
        const view = this.tabs.get(tabId)
        if (!view) return

        // 移除当前活动标签
        if (this.activeTabId && this.activeTabId !== tabId) {
            const currentView = this.tabs.get(this.activeTabId)
            if (currentView) {
                this.containerView.removeChildView(currentView)
            }
        }

        // 添加新的活动标签
        this.containerView.addChildView(view)
        // 更新活动标签
        this.activeTabId = tabId
        this.updateActiveViewBounds()
        view.webContents.focus()
    }

    // 更新视图边界
    updateActiveViewBounds() {
        if (!this.activeTabId) return

        const view = this.tabs.get(this.activeTabId)
        if (!view) return

        const tabState = this.stateManager.getState(this.activeTabId)
        const isHome = tabState?.isHome || false
        const bounds = this.containerView.getBounds()
        view.setBounds({
            x: 0,
            y: this.toolbarHeight - (isHome ? 44 : 0),
            width: bounds.width,
            height: bounds.height - this.toolbarHeight + (isHome ? 44 : 0)
        })
        const topBounds = this.topView.getBounds()
        this.topView.setBounds({
            x: 0,
            y: 0,
            width: bounds.width,
            height: isHome ? 28 : 72
        })
    }

    // 私有方法：创建标签页视图
    _createTabView(session, options) {
        return new WebContentsView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                session: session,
                webSecurity: true,
                allowRunningInsecureContent: false,
                experimentalFeatures: false,
                allowFileAccessFromFiles: true,
                webviewTag: true,
                plugins: true,
                javascript: true,
                images: true,
                webgl: true,
                accelerator: true,
                spellcheck: false,
                partition: `persist:tab_${options.useProxy ? 'proxy' : 'default'}`,
                ...(options.navigate ? {
                    preload: PRELOAD_SCRIPT_PATH
                } : {})
            }
        })
    }

    // 私有方法：验证URL
    _validateUrl(url) {
        if (!url || url === '') {
            return 'about:blank'
        }
        try {
            new URL(url)
            return url
        } catch (e) {
            if (url.startsWith('/')) {
                const baseUrl = this.systemConfig.get('baseUrl')
                return `${baseUrl}${url}`
            }
            return url.includes('://') ? url : `https://${url}`
        }
    }

    // 清理资源
    dispose() {
        // 清理所有标签页
        for (const [tabId, view] of this.tabs) {
            this.closeTab(tabId)
        }
        
        // 清理状态
        this.stateManager.clear()
        
        // 清理会话
        SessionManager.dispose()
        
        // 清理菜单窗口
        if (this.menuPopup) {
            this.menuPopup.destroy()
            this.menuPopup = null
        }
    }

    // 别名方法，保持向后兼容
    switchTab(tabId) {
        this.activateTab(tabId)
    }

    goBack() {
        const activeTab = this.tabs.get(this.activeTabId)
        if (activeTab?.webContents.canGoBack()) {
            activeTab.webContents.goBack()
        }
    }

    goForward() {
        const activeTab = this.tabs.get(this.activeTabId)
        if (activeTab?.webContents.canGoForward()) {
            activeTab.webContents.goForward()
        }
    }

    reload() {
        const activeTab = this.tabs.get(this.activeTabId)
        if (activeTab) {
            activeTab.webContents.reload()
        }
    }

    loadURL(url) {
        const activeTab = this.tabs.get(this.activeTabId)
        if (activeTab) {
            activeTab.webContents.loadURL(url)
        }
    }

    getTabInfo(tabId) {
        return this.stateManager.getState(tabId)
    }

    createTabsMenu(position, menuUrl, payload = {}) {
        const {x, y, width, height} = this.mainWindow.getBounds()
        const _bounds = {
            width: position.width,
            height: Math.min(height - y, position.height),
            x: x + width - position.width - 8,
            y: y + position.y
        }
        if (!this.menuPopup) {
            // 首次创建菜单窗口
            
            this.menuPopup = new BrowserWindow({
                ..._bounds,
                frame: false,
                transparent: true,
                hasShadow: true,
                type: 'popup',
                parent: this.mainWindow,
                show: false,  // 初始不显示
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: true,
                    sandbox: true,
                    enableRemoteModule: true,
                    preload: PRELOAD_SCRIPT_PATH,
                }
            })

            // 首次加载URL
            this.menuPopup.loadURL(menuUrl)

            // 设置加载完成的处理
            this.menuPopup.webContents.on('did-finish-load', () => {
                this.updateTabsMenu()
            })

            // 监听窗口失去焦点时自动隐藏
            this.menuPopup.on('blur', () => {
                this.closeTabsMenu()
            })

            if (process.env.NODE_ENV === 'development') {
                // this.menuPopup.webContents.openDevTools({mode: 'detach'})
            }
        } else {
            // 如果菜单已存在，更新位置
            this.menuPopup.setBounds({
                ..._bounds
            })
        }

        // 更新数据并显示
        this.updateTabsMenu()
        this.menuPopup.show()
        this.topView.webContents.send('ipc-msg', {type: MessageType.TAB_MENU_STATE, payload: {active: true}})

    }

    // 新增更新菜单数据的方法
    updateTabsMenu() {
        if (!this.menuPopup) return

        const menuData = {
            tabs: this.stateManager.getAllStates(),
            activeTabId: this.activeTabId,
            dimensions: {
                menuHeight: 300,
                menuWidth: 300
            }
        }
        
        this.menuPopup.webContents.send('init-menu-data', menuData)
    }

    // 修改关闭方法
    closeTabsMenu() {
        
        if (this.menuPopup) {
            // this.menuPopup.blur()
            this.menuPopup.hide()  // 只是隐藏而不销毁
            this.activateTab(this.activeTabId)
            this.topView.webContents.send('ipc-msg', {type: MessageType.TAB_MENU_STATE, payload: {active: false}})
        }
    }
}

export default TabManager 