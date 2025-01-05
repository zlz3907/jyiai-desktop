import { WebContentsView, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import SessionManager from './SessionManager.js'
import ProxyManager from './ProxyManager.js'
import TabStateManager from './TabStateManager.js'
import TabEventHandler from './TabEventHandler.js'
import { MessageType } from './constants.js'
import { getSystemConfig } from '../../config/index.js'
import store from '../../utils/store.js'
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
        this.toolbarHeight = 76
        this.menuView = null
        this.systemConfig = getSystemConfig()
        this.menuPopup = null
        this.sidebarPopup = null

        // 初始化各个管理器
        this.stateManager = new TabStateManager(topView)
        this.eventHandler = new TabEventHandler(this.stateManager, this.systemConfig)
    }

    /**
     * 检查用户的代理权限
     * @private
     * @returns {string} 返回需要跳转的路径，空字符串表示有权限
     */
    _checkProxyPermission() {
        try {
            const userSession = store.getItem('session.user')
            if (!userSession) {
                console.warn('未找到用户会话，需要登录')
                return '/desktop/auth?backUrl=/desktop/vip-upgrade&nobreadcrumb=true'
            }

            const { balance } = (typeof userSession === 'string' 
                ? JSON.parse(userSession) 
                : userSession)

            const expiryTime = balance?.purchase?.vzone?.totalTimeQuantity
            if (!expiryTime) {
                console.warn('未找到代理订阅，需要升级')
                return '/desktop/vip-upgrade'
            }

            return Date.now() < expiryTime ? '' : '/desktop/vip-upgrade'
        } catch (error) {
            console.warn('检查代理权限时出错:', error)
            return '/desktop/auth'
        }
    }

    /**
     * 打开指定页面
     * @private
     * @param {string} tabId - 标签页ID
     * @param {string} path - 页面路径
     */
    _openRedirectPage(tabId, path) {
        const baseUrl = this.systemConfig.get('baseUrl')
        this.createTab(`${baseUrl}${path}`, {
            navigate: true,
            isHome: false,
            tabId: tabId
        })
    }

    /**
     * 创建新标签页
     * @param {string} url - 页面URL
     * @param {Object} options - 配置选项
     * @returns {string} 标签页ID
     */
    createTab(url = 'about:blank', options = {}) {
        // URL 验证和处理
        const validUrl = this._validateUrl(url)
        const tabId = options.tabId || Date.now().toString()

        // 处理代理模式
        if (options.useProxy) {
            const redirectPath = this._checkProxyPermission()
            if (redirectPath) {
                console.log('需要跳转到:', redirectPath)
                this._openRedirectPage(tabId, redirectPath)
                return
            }
        }

        try {
            // 创建和配置 session
            const customSession = SessionManager.createSession(options.useProxy)
            if (options.useProxy) {
                ProxyManager.configureProxy(customSession)
            }

            // 创建和初始化标签页
            const view = this._createTabView(customSession, options)
            this._initializeTab(view, tabId, validUrl, options)

            return tabId
        } catch (error) {
            console.error('Failed to create tab:', error)
            throw error
        }
    }

    /**
     * 初始化标签页
     * @private
     * @param {WebContentsView} view - 标签页视图
     * @param {string} tabId - 标签页ID
     * @param {string} validUrl - 验证后的URL
     * @param {Object} options - 配置选项
     */
    _initializeTab(view, tabId, validUrl, options) {
        this.tabs.set(tabId, view)
        this.activeTabId = tabId
            
        // 初始化标签状态
        this.stateManager.updateState(tabId, {
            useProxy: options.useProxy || false,
            url: options?.navigate ? 'about:blank' : validUrl,
            title: options?.navigate ? 'about:blank' : 'New Tab',
            navigate: options?.navigate,
            isHome: options?.isHome || false
        }, MessageType.TAB_CREATED)

        // 设置事件监听和用户代理
        const contents = view.webContents
        this.eventHandler.setupEvents(contents, tabId)
        contents.setUserAgent(contents.getUserAgent() + ' JYIAIBrowser')

        // 开发环境下打开 DevTools
        if (process.env.NODE_ENV === 'development') {
            view.webContents.openDevTools({ mode: 'detach' })
        }

        // 更新视图布局
        this._updateTabView(view, tabId, options?.isHome)

        // 加载URL
        this._loadTabContent(contents, validUrl, tabId)

        // console.log('createTab', this.tabs)
    }

    /**
     * 更新标签页视图布局
     * @private
     */
    _updateTabView(view, tabId, isHome) {
        // 移除其他标签页
        for (const [id, v] of this.tabs) {
            if (id !== tabId) {
                this.containerView.removeChildView(v)
            }
        }

        // 添加新标签页并更新布局
        this.containerView.addChildView(view)
        this.updateActiveViewBounds(isHome)
    }

    /**
     * 加载标签页内容
     * @private
     */
    _loadTabContent(contents, validUrl, tabId) {
        if (validUrl && validUrl !== 'about:blank') {
            contents.loadURL(validUrl, {
                timeout: 30000,
                extraHeaders: 'pragma: no-cache\n'
            }).catch(err => {
                console.error('Failed to load URL:', err)
                this.stateManager.updateState(tabId, {
                    error: {
                        code: err.code || 'LOAD_ERROR',
                        description: err.message
                    },
                    loading: false
                }, MessageType.TAB_STATE_CHANGED)
            })
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
        const activeTab = this.tabs.get(this.activeTabId)
        if (!activeTab) return

        const view = this.tabs.get(this.activeTabId)
        if (!view) return

        const tabState = this.stateManager.getState(this.activeTabId)
        const isHome = tabState?.isHome || tabState?.isApp || false
        const bounds = this.containerView.getBounds()
        const _boundsConfig = this.systemConfig.get('bounds')
        const _topViewBounds = {
            height: _boundsConfig?.topView?.height || 76,
            minHeight: _boundsConfig?.topView?.minHeight || 32,
        }

        const homeOffset = _boundsConfig?.topView?.height 
            - _boundsConfig?.topView?.minHeight

        view.setBounds({
            x: 0,
            y: _topViewBounds.height - (isHome ? homeOffset - 2 : 0),
            width: bounds.width,
            height: bounds.height - _topViewBounds.height + (isHome ? homeOffset + 2 : 0)
        })
        // const topBounds = this.topView.getBounds()
        this.topView.setBounds({
            x: 0,
            y: 0,
            width: bounds.width,
            height: isHome ? _topViewBounds.minHeight + 2 : _topViewBounds.height
        })
    }

    // 私有方法：创建标签页视图
    _createTabView(session, options) {
        console.log('createTabView:options', options)
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
                ...((options.navigate || options.isHome || options.isApp) ? {
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
        
        // 清理侧边栏
        if (this.sidebarPopup) {
            this.sidebarPopup.destroy()
            this.sidebarPopup = null
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
                resizable: false,
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

    createSidebar(sidebarUrl, options = {}) {
        const {x, y, width, height} = this.mainWindow.getBounds()
        const _boundsConfig = this.systemConfig.get('bounds')
        const _topViewHeight = options.position || _boundsConfig?.topView?.height || 76
        
        const sidebarWidth = options.width || 320 // 默认宽度
        
        const _bounds = {
            width: sidebarWidth,
            height: height - _topViewHeight,
            x: x + width - sidebarWidth,
            y: y + _topViewHeight
        }
        console.log('createSidebar', {x, y, width, height}, _boundsConfig, _bounds)
        if (!this.sidebarPopup) {
            this.sidebarPopup = new BrowserWindow({
                ..._bounds,
                frame: false,
                transparent: true,
                hasShadow: true,
                type: 'popup',
                parent: this.mainWindow,
                show: false,
                roundedCorners: false,  // 禁用窗口圆角
                resizable: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: true,
                    sandbox: true,
                    enableRemoteModule: true,
                    preload: path.join(__dirname, '../../../preload/sdk.js'),
                }
            })

            // 首次加载URL
            this.sidebarPopup.loadURL(sidebarUrl)

            // 监听主窗口的resize事件来调整侧边栏大小
            this.mainWindow.on('resize', () => {
                if (this.sidebarPopup && !this.sidebarPopup.isDestroyed()) {
                    const newBounds = this.mainWindow.getBounds()
                    const currentBounds = this.sidebarPopup.getBounds()
                    this.sidebarPopup.setBounds({
                        width: currentBounds.width,
                        height: newBounds.height - _topViewHeight,
                        x: newBounds.x + newBounds.width - currentBounds.width,
                        y: newBounds.y + _topViewHeight
                    })
                }
            })

            // 监听主窗口的移动事件
            this.mainWindow.on('move', () => {
                if (this.sidebarPopup && !this.sidebarPopup.isDestroyed()) {
                    const newBounds = this.mainWindow.getBounds()
                    const currentBounds = this.sidebarPopup.getBounds()
                    this.sidebarPopup.setBounds({
                        width: currentBounds.width,
                        height: currentBounds.height,
                        x: newBounds.x + newBounds.width - currentBounds.width,
                        y: newBounds.y + _topViewHeight
                    })
                }
            })

            // 监听窗口失去焦点时自动隐藏（可选）
            if (options.autoHide) {
                this.sidebarPopup.on('blur', () => {
                    this.closeSidebar()
                })
            }

            if (process.env.NODE_ENV === 'development') {
                // this.sidebarPopup.webContents.openDevTools({mode: 'detach'})
            }
        } else {
            // 如果侧边栏已存在，更新位置和大小
            this.sidebarPopup.setBounds(_bounds)
            if (sidebarUrl !== this.sidebarPopup.webContents.getURL()) {
                this.sidebarPopup.loadURL(sidebarUrl)
            }
        }

        this.sidebarPopup.show()
        // console.log('createSidebar', this.sidebarPopup)
        // 通知顶部视图侧边栏状态
        this.topView.webContents.send('ipc-msg', {
            type: MessageType.SIDEBAR_STATE, 
            payload: { active: true }
        })
    }

    closeSidebar() {
        if (this.sidebarPopup) {
            this.sidebarPopup.hide()
            this.topView.webContents.send('ipc-msg', {
                type: MessageType.SIDEBAR_STATE, 
                payload: { active: false }
            })
        }
    }
}

export default TabManager 