const { WebContentsView } = require('electron')
const path = require('path')
const SessionManager = require('./SessionManager')
const ProxyManager = require('./ProxyManager')
const TabStateManager = require('./TabStateManager')
const TabEventHandler = require('./TabEventHandler')
const { MessageType } = require('./constants')

class TabManager {
    constructor(containerView, topView) {
        this.containerView = containerView
        this.topView = topView
        this.tabs = new Map()
        this.activeTabId = null
        this.toolbarHeight = 72  // 默认工具栏高度
        this.menuView = null
        this.systemConfig = require('../../config').getSystemConfig()

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
            // if (process.env.NODE_ENV === 'development') {
            //     view.webContents.openDevTools({ mode: 'detach' })
            // }

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
                console.log('Loading URL:', validUrl)
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
                allowRunningInsecureContent: true,
                experimentalFeatures: true,
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
                    preload: path.join(__dirname, '../../../preload/sdk.js')
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

    // 创建标签菜单
    createTabsMenu(x, y, menuUrl) {
        return new Promise((resolve) => {
            // 准备菜单数据
            const menuData = {
                tabs: this.stateManager.getAllStates(),
                activeTabId: this.activeTabId
            }

            // 计算菜单高度
            const itemHeight = 40  // 每个标签的高度
            const headerHeight = 48  // 菜单头部高度
            const footerHeight = 48  // 菜单底部高度（包含分隔线和新建标签按钮）
            const separatorHeight = 1  // 分隔线高度
            const padding = 16  // 上下padding总和
            
            // 计算标签列表的高度
            const tabsHeight = menuData.tabs.length * itemHeight
            
            // 计算总高度（标签列表 + 头部 + 底部 + padding）
            let totalHeight = tabsHeight + headerHeight + footerHeight + padding
            
            // 获取窗口高度并设置最大高度限制
            const bounds = this.containerView.getBounds()
            const maxHeight = bounds.height - this.toolbarHeight - 20  // 减去工具栏高度和一些边距
            const menuHeight = Math.min(totalHeight, maxHeight)
            const menuWidth = 300  // 菜单宽度

            // 创建菜单视图
            this.menuView = new WebContentsView({
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: true,
                    sandbox: true,
                    enableRemoteModule: true,
                    preload: path.join(__dirname, '../../../preload/sdk.js'),
                }
            })

            // 添加到容器
            this.containerView.addChildView(this.menuView)

            // 确保菜单不会超出窗口边界
            const menuX = Math.min(x, bounds.width - menuWidth)
            const menuY = Math.min(y, bounds.height - menuHeight)

            // 设置菜单视图的位置和大小
            this.menuView.setBounds({
                x: menuX,
                y: menuY,
                width: menuWidth,
                height: menuHeight
            })

            // 设置菜单页面加载完成的处理
            this.menuView.webContents.once('did-finish-load', () => {
                // 发送标签数据和尺寸信息到菜单页面
                this.menuView.webContents.send('init-menu-data', {
                    ...menuData,
                    dimensions: {
                        itemHeight,
                        headerHeight,
                        footerHeight,
                        separatorHeight,
                        padding,
                        totalHeight,
                        menuHeight,
                        menuWidth
                    }
                })
            })

            // 加载菜单页面
            this.menuView.webContents.loadURL(menuUrl).then(() => {
                resolve()
            }).catch(err => {
                console.error('Failed to load menu:', err)
                this.closeTabsMenu()
                resolve()
            })
        })
    }

    // 关闭标签菜单
    closeTabsMenu() {
        if (this.menuView) {
            this.containerView.removeChildView(this.menuView)
            this.menuView.webContents.destroy()
            this.menuView = null
        }
    }
}

module.exports = TabManager 