const { BrowserView } = require('electron')
const path = require('path')
const { proxyConfig } = require('../config/proxy')

class TabManager {
    constructor(mainWindow) {
        this.mainWindow = mainWindow
        this.tabs = new Map()
        this.tabStates = new Map()
        this.activeTabId = null
        this.toolbarHeight = 72

        // 监听窗口大小改变
        this.mainWindow.on('resize', () => this.updateActiveViewBounds())
    }

    // 私有方法：创建自定义会话
    _createCustomSession(useProxy = false) {
        const session = require('electron').session
        const customSession = session.fromPartition(`persist:tab_${useProxy ? 'proxy' : 'default'}`)
        
        // 设置基本配置
        customSession.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

        if (useProxy) {
            this._configureProxy(customSession)
        }

        return customSession
    }

    // 私有方法：配置代理
    _configureProxy(session) {
        const proxySettings = {
            mode: 'fixed_servers',
            proxyRules: `http://${proxyConfig.host}:${proxyConfig.port}`,
            proxyBypassRules: '<local>'
        }

        session.setProxy(proxySettings)
        console.log('Proxy settings applied:', proxySettings)

        // 添加代理认证头，针对不同域名使用不同的处理
        session.webRequest.onBeforeSendHeaders((details, callback) => {
            const auth = Buffer.from(`${proxyConfig.username}:${proxyConfig.password}`).toString('base64')
            const headers = {
                ...details.requestHeaders,
                'Proxy-Authorization': `Basic ${auth}`,
                'Connection': 'keep-alive'
            }

            // 针对 YouTube 视频链接添加特殊处理
            if (details.url.includes('googlevideo.com')) {
                headers['Range'] = 'bytes=0-' // 添加 Range 头
                headers['Cache-Control'] = 'no-cache'
            }

            callback({ requestHeaders: headers })
        })

        // 优化错误处理
        session.webRequest.onErrorOccurred((details) => {
            // 忽略视频加载的部分错误
            if (details.error.includes('ERR_TUNNEL_CONNECTION_FAILED') && 
                !details.url.includes('googlevideo.com')) {
                console.error('Proxy tunnel connection failed:', details.url)
            } else if (!details.error.includes('ERR_ABORTED')) {
                console.error('Request error:', details.error, details.url)
            }
        })

        // 添加响应头处理
        session.webRequest.onHeadersReceived((details, callback) => {
            const responseHeaders = {...details.responseHeaders}
            
            // 处理 YouTube 视频响应
            if (details.url.includes('googlevideo.com')) {
                // 确保允许范围请求
                responseHeaders['Accept-Ranges'] = ['bytes']
                // 允许跨域
                responseHeaders['Access-Control-Allow-Origin'] = ['*']
            }

            callback({ responseHeaders })
        })
    }

    // 私有方法：设置事件监听
    _setupEventListeners(contents, tabId) {
        // 页面标题更新
        contents.on('page-title-updated', (event, title) => {
            this._updateTabState(tabId, { title })
        })

        // URL 变化
        contents.on('did-navigate', (event, url) => {
            this._updateTabState(tabId, { url })
        })

        // 加载状态
        contents.on('did-start-loading', () => {
            this._updateTabState(tabId, { loading: true })
        })

        contents.on('did-stop-loading', () => {
            this._updateTabState(tabId, { loading: false })
        })

        // 代理认证
        contents.on('login', (event, details, authInfo, callback) => {
            if (authInfo.isProxy) {
                event.preventDefault()
                callback(proxyConfig.username, proxyConfig.password)
            }
        })

        // 权限请求处理
        contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
            const allowedPermissions = [
                'clipboard-read',
                'clipboard-write',
                'pointerLock',
                'fullscreen',
                'media',
                'geolocation',
                'notifications'
            ]
            callback(allowedPermissions.includes(permission))
        })

        // 证书错误处理
        contents.session.setCertificateVerifyProc((request, callback) => {
            callback(0) // 允许所有证书
        })
    }

    // 私有方法：更新标签状态
    _updateTabState(tabId, newState) {
        const currentState = this.tabStates.get(tabId) || {}
        const updatedState = {
            ...currentState,
            ...newState,
            id: tabId
        }
        this.tabStates.set(tabId, updatedState)
        this.mainWindow.webContents.send('tab-loading', updatedState)
    }

    // 公共方法
    createTab(url = 'about:blank', options = {}) {
        if (url === '') {
            url = 'about:blank'
            return
        }

        const customSession = this._createCustomSession(options.useProxy)
        const view = new BrowserView({
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                session: customSession,
                enableBlinkFeatures: '',
                disableBlinkFeatures: 'WebAuthentication,WebUSB,WebBluetooth'
            }
        })

        const tabId = options.tabId || Date.now().toString()
        this.tabs.set(tabId, view)
        this._updateTabState(tabId, {
            useProxy: options.useProxy || false,
            url: url,
            title: 'New Tab'
        })

        const contents = view.webContents
        this._setupEventListeners(contents, tabId)
        contents.setUserAgent(contents.getUserAgent() + ' JYIAIBrowser')

        this.mainWindow.addBrowserView(view)
        this.mainWindow.setBrowserView(view)
        this.activeTabId = tabId
        this.updateActiveViewBounds()

        contents.loadURL(url, {
            timeout: 30000,
            extraHeaders: 'pragma: no-cache\n'
        }).catch(err => {
            console.error('Failed to load URL:', err)
        })

        return {
            id: tabId,
            url,
            title: 'New Tab'
        }
    }

    updateActiveViewBounds() {
        // console.log('updateActiveViewBounds', this.activeTabId)
        if (!this.activeTabId) return
        const view = this.tabs.get(this.activeTabId)
        const bounds = this.mainWindow.getBounds()
        view.setBounds({
            x: 0,
            y: this.toolbarHeight,
            width: bounds.width,
            height: bounds.height - this.toolbarHeight
        })
    }

    switchTab(tabId) {
        // 遍历所有标签页，只显示匹配的id
        for (const [id, view] of this.tabs) {
            if (id === tabId) {
                this.mainWindow.setBrowserView(view)
                this.activeTabId = tabId
            }
        }
        
        // 如果没有找到匹配的标签，清除当前显示
        if (!this.tabs.has(tabId)) {
            this.mainWindow.setBrowserView(null)
            this.activeTabId = null
        }
        
        // 更新视图边界
        this.updateActiveViewBounds()
    }

    closeTab(tabId) {
        console.log('closeTab', tabId, this.tabs)
        if (!this.tabs.has(tabId)) return
        
        const view = this.tabs.get(tabId)
        this.mainWindow.removeBrowserView(view)
        view.webContents.destroy()
        this.tabs.delete(tabId)
        this.tabStates.delete(tabId)  // 删除状态
        
        if (tabId === this.activeTabId) {
            const lastTab = Array.from(this.tabs.keys()).pop()
            if (lastTab) {
                this.switchTab(lastTab)
            }
        }
    }

    goBack() {
        if (!this.activeTabId) return
        const view = this.tabs.get(this.activeTabId)
        if (view.webContents.navigationHistory.canGoBack()) {
            view.webContents.navigationHistory.goBack()
        }
    }

    goForward() {
        if (!this.activeTabId) return
        const view = this.tabs.get(this.activeTabId)
        if (view.webContents.navigationHistory.canGoForward()) {
            view.webContents.navigationHistory.goForward()
        }
    }

    reload() {
        if (!this.activeTabId) return
        const view = this.tabs.get(this.activeTabId)
        view.webContents.reload()
    }

    loadURL(url) {
        if (!this.activeTabId) return
        const view = this.tabs.get(this.activeTabId)
        view.webContents.loadURL(url)
    }

    // 添加切换代理的方法
    toggleProxy(tabId) {
        if (!this.tabs.has(tabId)) return

        const view = this.tabs.get(tabId)
        const state = this.tabStates.get(tabId)
        const newProxyState = !state.useProxy
        const session = view.webContents.session

        // 更新状态
        this.tabStates.set(tabId, {
            ...state,
            useProxy: newProxyState
        })

        if (newProxyState) {
            // 设置代理
            session.setProxy({
                mode: 'fixed_servers',
                proxyRules: `http://${proxyConfig.host}:${proxyConfig.port}`,
                proxyBypassRules: '<local>'
            })

            // 添加代理认证
            session.webRequest.onBeforeSendHeaders((details, callback) => {
                const auth = Buffer.from(`${proxyConfig.username}:${proxyConfig.password}`).toString('base64')
                callback({
                    requestHeaders: {
                        ...details.requestHeaders,
                        'Proxy-Authorization': `Basic ${auth}`
                    }
                })
            })
        } else {
            session.setProxy({
                mode: 'direct',
                proxyBypassRules: '<local>'
            })
        }

        // 刷新页面
        view.webContents.reload()
        return newProxyState
    }

    // 获取标签页代理状态
    getTabProxyState(tabId) {
        return this.tabStates.get(tabId)?.useProxy || false
    }

    // 添加获取标签信息的方法
    getTabInfo(tabId) {
        return this.tabStates.get(tabId) || null
    }
}

module.exports = TabManager 