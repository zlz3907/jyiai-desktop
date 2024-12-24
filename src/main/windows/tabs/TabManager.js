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
        this.toolbarHeight = 72
        this.menuView = null

        // 初始化各个管理器
        this.stateManager = new TabStateManager(topView)
        this.eventHandler = new TabEventHandler(this.stateManager)
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
                isHome: options?.isHome
            }, MessageType.TAB_CREATED)

            // 设置事件监听
            const contents = view.webContents
            this.eventHandler.setupEvents(contents, tabId)
            contents.setUserAgent(contents.getUserAgent() + ' JYIAIBrowser')

            // 添加新标签页到容器
            this.containerView.addChildView(view)
            this.updateActiveViewBounds(options?.isHome)

            // 加载URL
            if (!options?.navigate) {
                contents.loadURL(validUrl).catch(err => {
                    console.error('Failed to load URL:', err)
                    this.stateManager.updateState(tabId, {
                        error: {
                            code: 'LOAD_ERROR',
                            description: err.message
                        },
                        loading: false
                    })
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

        // 隐藏当前活动标签
        if (this.activeTabId && this.activeTabId !== tabId) {
            const currentView = this.tabs.get(this.activeTabId)
            if (currentView) {
                currentView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
            }
        }

        // 更新活动标签
        this.activeTabId = tabId
        this.updateActiveViewBounds()
        view.webContents.focus()
    }

    // 更新视图边界
    updateActiveViewBounds(isHome = false) {
        if (!this.activeTabId) return

        const view = this.tabs.get(this.activeTabId)
        if (!view) return

        const bounds = this.containerView.getBounds()
        view.setBounds({
            x: 0,
            y: this.toolbarHeight,
            width: bounds.width,
            height: bounds.height - this.toolbarHeight
        })
    }

    // 私有方法：创建标签页视图
    _createTabView(session, options) {
        return new WebContentsView({
            webPreferences: {
                nodeIntegration: options.navigate ? false : true,
                contextIsolation: options.navigate ? true : false,
                session: session,
                webSecurity: true,
                allowRunningInsecureContent: false,
                experimentalFeatures: true,
                allowFileAccessFromFiles: true,
                webviewTag: true,
                plugins: true,
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
                const systemConfig = require('../../config').getSystemConfig()
                const baseUrl = systemConfig.get('baseUrl')
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
}

module.exports = TabManager 