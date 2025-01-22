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
    /**
     * 标签页管理器构造函数
     * @param {BrowserWindow} mainWindow - 主窗口实例
     * @param {WebContentsView} topView - 顶部工具栏视图
     */
    constructor(mainWindow, topView) {
        // 主窗口相关
        this.mainWindow = mainWindow
        this.containerView = mainWindow.contentView  // 主窗口内容视图
        this.topView = topView  // 顶部工具栏视图
        
        // 标签页管理
        this.tabs = new Map()  // 存储所有标签页，key为tabId，value为WebContentsView
        this.activeTabId = null  // 当前活动标签页ID
        this.toolbarHeight = 76  // 工具栏高度
        
        // UI相关
        this.menuView = null  // 菜单视图
        this.menuPopup = null  // 菜单弹出窗口
        this.popupWindow = null  // 侧边栏弹出窗口
        
        // 配置
        this.systemConfig = getSystemConfig()  // 获取系统配置
        
        // 初始化各个管理器
        this.stateManager = new TabStateManager(topView)  // 标签页状态管理
        this.eventHandler = new TabEventHandler(this.stateManager, this.systemConfig)  // 事件处理
        this.rightClickMenu = null  // 右键菜单
    }

    /**
     * 检查用户的代理权限
     * @private
     * @returns {string} 返回需要跳转的路径，空字符串表示有权限
     * 
     * 该方法检查用户是否具有使用代理的权限：
     * 1. 检查用户是否登录
     * 2. 检查用户是否有有效的代理订阅
     * 3. 检查订阅是否在有效期内
     */
    _checkProxyPermission() {
        try {
            // 获取用户会话信息
            const userSession = store.getItem('session.user')
            if (!userSession) {
                console.warn('未找到用户会话，需要登录')
                return '/desktop/auth?backUrl=/desktop/links&nobreadcrumb=true'
            }

            // 解析用户余额信息
            const { balance } = (typeof userSession === 'string' 
                ? JSON.parse(userSession) 
                : userSession)

            // 获取代理订阅到期时间
            const expiryTime = balance?.purchase?.vzone?.totalTimeQuantity
            if (!expiryTime) {
                console.warn('未找到代理订阅，需要升级')
                return '/desktop/vip-upgrade'
            }

            // 检查订阅是否在有效期内
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
     * @param {string} url - 页面URL，默认为'about:blank'
     * @param {Object} options - 配置选项
     * @returns {string} 标签页ID
     * 
     * 主要流程：
     * 1. 验证和处理URL
     * 2. 检查代理权限（如果使用代理）
     * 3. 创建自定义session
     * 4. 配置代理（如果需要）
     * 5. 创建标签页视图
     * 6. 初始化标签页
     */
    createTab(url = 'about:blank', options = {}) {
        // URL 验证和处理
        const validUrl = this._validateUrl(url)
        const tabId = options.tabId || Date.now().toString()  // 生成唯一tabId

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
            const customSession = SessionManager.createSession(url,options)
            if (options.useProxy) {
                ProxyManager.configureProxy(customSession)  // 配置代理
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
     * 
     * 初始化流程：
     * 1. 将新标签页添加到tabs Map中
     * 2. 更新当前活动标签页ID
     * 3. 初始化标签页状态
     * 4. 设置事件监听
     * 5. 更新视图布局
     * 6. 加载URL内容
     * 7. 设置右键菜单（如果存在）
     */
    _initializeTab(view, tabId, validUrl, options) {
        // 将新标签页添加到tabs Map中
        this.tabs.set(tabId, view)
        this.activeTabId = tabId  // 更新当前活动标签页ID
            
        // 初始化标签状态
        this.stateManager.updateState(tabId, {
            useProxy: options.useProxy || false,  // 是否使用代理
            url: options?.navigate ? 'about:blank' : validUrl,  // 标签页URL
            title: options?.navigate ? 'about:blank' : 'New Tab',  // 标签页标题
            navigate: options?.navigate,  // 是否正在导航
            isApp: options?.isApp || false,  // 是否是应用模式
            isHome: options?.isHome || false  // 是否是主页
        }, MessageType.TAB_CREATED)

        // 设置事件监听和用户代理
        const contents = view.webContents
        this.eventHandler.setupEvents(contents, tabId)

        // 更新视图布局
        this._updateTabView(view, tabId, options?.isHome)

        // 加载URL
        this._loadTabContent(contents, validUrl, tabId)

        // 设置右键菜单
        if (this.rightClickMenu) {
            contents.on('context-menu', (event) => {
                event.preventDefault()
                this.rightClickMenu.popup({ window: view })
            })
        }
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

    /**
     * 关闭标签页
     * @param {string} tabId - 要关闭的标签页ID
     * 
     * 关闭流程：
     * 1. 从容器中移除视图
     * 2. 销毁webContents
     * 3. 从tabs Map中删除
     * 4. 清理状态
     * 5. 如果关闭的是活动标签页，切换到其他标签页
     */
    closeTab(tabId) {
        const view = this.tabs.get(tabId)
        if (view) {
            // 从容器中移除
            this.containerView.removeChildView(view)
            
            // 销毁视图
            view.webContents.destroy()
            
            // 清理状态
            this.tabs.delete(tabId)
        }

        // 清理状态管理
        this.stateManager.removeState(tabId)

        // 如果关闭的是当前活动标签，切换到其他标签
        if (this.activeTabId === tabId) {
            const remainingTabs = Array.from(this.tabs.keys())
            if (remainingTabs.length > 0) {
                // 切换到最后一个标签页
                this.activateTab(remainingTabs[remainingTabs.length - 1])
            } else {
                this.activeTabId = null  // 没有标签页时清空活动标签页ID
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

    /**
     * 更新活动标签页的视图边界
     * 
     * 根据当前窗口大小和标签页状态调整视图边界：
     * 1. 获取活动标签页
     * 2. 计算视图边界
     * 3. 调整标签页视图和顶部工具栏视图的大小和位置
     */
    updateActiveViewBounds() {
        const activeTab = this.tabs.get(this.activeTabId)
        if (!activeTab) return

        const view = this.tabs.get(this.activeTabId)
        if (!view) return

        // 获取标签页状态
        const tabState = this.stateManager.getState(this.activeTabId)
        const isHome = tabState?.isHome || tabState?.isApp || false  // 是否是主页或应用模式
        
        // 获取容器边界
        const bounds = this.containerView.getBounds()
        const _boundsConfig = this.systemConfig.get('bounds')
        
        // 顶部工具栏边界配置
        const _topViewBounds = {
            height: _boundsConfig?.topView?.height || 76,
            minHeight: _boundsConfig?.topView?.minHeight || 32,
        }

        // 计算主页模式下的偏移量
        const homeOffset = _boundsConfig?.topView?.height 
            - _boundsConfig?.topView?.minHeight

        // 设置标签页视图边界
        view.setBounds({
            x: 0,
            y: _topViewBounds.height - (isHome ? homeOffset - 2 : 0),
            width: bounds.width,
            height: bounds.height - _topViewBounds.height + (isHome ? homeOffset + 2 : 0)
        })

        // 设置顶部工具栏边界
        this.topView.setBounds({
            x: 0,
            y: 0,
            width: bounds.width,
            height: isHome ? _topViewBounds.minHeight + 2 : _topViewBounds.height
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
                experimentalFeatures: true,
                webgl: true,
                canvas: true,
                audio: true,
                video: true,
                webaudio: true,
                backgroundThrottling: true,
                enableBlinkFeatures: 'OverlayScrollbars',
                enableWebSQL: true,
                v8CacheOptions: 'code',
                permissions: {
                    webCapturer: true,
                    media: true,
                    geolocation: true,
                    notifications: true,
                    midi: true,
                    pointerLock: true,
                    fullscreen: true,
                    clipboard: true,
                    payment: true
                },
                allowFileAccessFromFiles: true,
                webviewTag: true,
                plugins: true,
                javascript: true,
                images: true,
                accelerator: true,
                spellcheck: true,
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

            // if (process.env.NODE_ENV === 'development') {
            //     // this.menuPopup.webContents.openDevTools({mode: 'detach'})
            // }
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
        // console.log('updateTabsMenu', menuData)
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

    createPopupWindow(popupUrl, options = {}) {
        const {x, y, width, height} = this.mainWindow.getBounds()
        const _boundsConfig = this.systemConfig.get('bounds')
        const _topViewHeight = options.position || _boundsConfig?.topView?.height || 76
        
        const popupWidth = options.width || 320 // 默认宽度
        // const _x = isNaN(options.x) ? x + options.x : (x + width - sidebarWidth)
        // const _y = isNaN(options.y) ? y + options.y : (y + _topViewHeight)
        
        const _bounds = {
            width: popupWidth,
            height: options.height || height - _topViewHeight,
            // x: x + width - sidebarWidth,
            // y: y + _topViewHeight
            x: !isNaN(options.x) ? x + options.x : (x + width - popupWidth),
            y: !isNaN(options.y) ? y + options.y : (y + _topViewHeight)
        }
        // console.log('createSidebar', {x, y, width, height}, _boundsConfig, _bounds)
        if (!this.popupWindow) {
            this.popupWindow = new BrowserWindow({
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
            this.popupWindow.loadURL(popupUrl)

            // 监听主窗口的resize事件来调整侧边栏大小
            this.mainWindow.on('resize', () => {
                if (this.popupWindow && !this.popupWindow.isDestroyed()) {
                    const newBounds = this.mainWindow.getBounds()
                    const currentBounds = this.popupWindow.getBounds()
                    this.popupWindow.setBounds({
                        width: currentBounds.width,
                        height: newBounds.height - _topViewHeight,
                        x: newBounds.x + newBounds.width - currentBounds.width,
                        y: newBounds.y + _topViewHeight
                    })
                }
            })

            // 监听主窗口的移动事件
            this.mainWindow.on('move', () => {
                if (this.popupWindow && !this.popupWindow.isDestroyed()) {
                    const newBounds = this.mainWindow.getBounds()
                    const currentBounds = this.popupWindow.getBounds()
                    this.popupWindow.setBounds({
                        width: currentBounds.width,
                        height: currentBounds.height,
                        x: newBounds.x + newBounds.width - currentBounds.width,
                        y: newBounds.y + _topViewHeight
                    })
                }
            })

            // 监听窗口失去焦点时自动隐藏（可选）
            if (options.autoHide) {
                this.popupWindow.on('blur', () => {
                    this.closePopupWindow()
                })
            }

            // if (process.env.NODE_ENV === 'development') {
            //     // this.sidebarPopup.webContents.openDevTools({mode: 'detach'})
            // }
        } else {
            // 如果侧边栏已存在，更新位置和大小
            this.popupWindow.setBounds(_bounds)
            if (popupUrl !== this.popupWindow.webContents.getURL()) {
                this.popupWindow.loadURL(popupUrl)
            }
        }

        this.popupWindow.show()
        // console.log('createSidebar', this.sidebarPopup)
        // 通知顶部视图侧边栏状态
        this.topView.webContents.send('ipc-msg', {
            type: MessageType.SIDEBAR_STATE, 
            payload: { active: true }
        })
    }

    closePopupWindow() {
        if (this.popupWindow) {
            this.popupWindow.hide()
            this.topView.webContents.send('ipc-msg', {
                type: MessageType.SIDEBAR_STATE, 
                payload: { active: false }
            })
        }
    }
}

export default TabManager
