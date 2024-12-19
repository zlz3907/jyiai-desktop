const { BrowserView, WebContentsView } = require('electron')
const path = require('path')
const { proxyConfig } = require('../config/proxy')

class TabManager {
    constructor(containerView, topView) {
        this.containerView = containerView
        this.topView = topView
        this.tabs = new Map()
        this.tabStates = new Map()
        this.activeTabId = null
        this.toolbarHeight = 72

        // 添加视图状态枚举
        this.ViewState = {
            LOADING: 'loading',
            READY: 'ready',
            ERROR: 'error'
        }

        // 重新定义更细化的消息类型常量
        this.MessageType = {
            TAB_TITLE_UPDATED: 'tab-title-updated',
            TAB_URL_UPDATED: 'tab-url-updated',
            TAB_LOADING_STATE: 'tab-loading-state',
            TAB_STATE_CHANGED: 'tab-state-changed',
            TAB_CREATED: 'tab-created',
            TAB_VIEW_STATE: 'tab-view-state'
        }
    }

    // 私有方法：发送消息到顶部视图
    _sendMessage(type, payload) {
        if (!this.topView?.webContents) {
            console.warn('TopView not available for message:', type)
            return
        }
        this.topView.webContents.send(this.MessageType.TAB_STATE_CHANGED, {type, payload})
    }

    createBottomView() {
        const bottomView = new WebContentsView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: true,
                sandbox: true,
                enableRemoteModule: true,
                preload: path.join(__dirname, '../preload/sdk.js'),
            }
        })
        this.containerView.addChildView(bottomView)
        // 其他初始化代码...
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
            this._updateTabState(tabId, { title }, this.MessageType.TAB_TITLE_UPDATED)
        })

        // URL 变化
        contents.on('did-navigate', (event, url) => {
            this._updateTabState(tabId, { url }, this.MessageType.TAB_URL_UPDATED)
        })

        // 加载状态
        contents.on('did-start-loading', () => {
            this._updateTabState(tabId, { loading: true }, this.MessageType.TAB_LOADING_STATE)
        })

        contents.on('did-stop-loading', () => {
            this._updateTabState(tabId, { loading: false }, this.MessageType.TAB_LOADING_STATE)
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

        contents.on('did-fail-load', (event, errorCode, errorDescription) => {
            this._updateViewState(tabId, this.ViewState.ERROR, {
                errorCode,
                errorDescription
            })
        })

        contents.on('crashed', () => {
            this._updateViewState(tabId, this.ViewState.ERROR, {
                errorCode: 'CRASHED',
                errorDescription: 'Page crashed'
            })
        })

        // Fix memory monitoring using process
        const memoryInterval = setInterval(() => {
            if (contents.isDestroyed()) {
                clearInterval(memoryInterval);
                return;
            }
            
            const processId = contents.getProcessId();
            if (processId) {
                process.getProcessMemoryInfo(processId).then(info => {
                    if (info.private > 1024 * 1024 * 500) { // 500MB
                        console.warn(`Tab ${tabId} memory usage high:`, info)
                    }
                }).catch(err => {
                    console.error('Failed to get memory info:', err);
                    clearInterval(memoryInterval);
                });
            }
        }, 30000);

        // Clear event listeners
        contents.once('destroyed', () => {
            clearInterval(memoryInterval)
        })
    }

    // 私有方法：更新标签状态
    _updateTabState(tabId, newState, messageType = this.MessageType.TAB_STATE_CHANGED) {
        const currentState = this.tabStates.get(tabId) || {}
        const updatedState = {
            ...currentState,
            ...newState,
            id: tabId
        }
        updatedState.url = updatedState?.navigate ? '' : updatedState?.url
        console.log('updatedState', messageType, currentState?.navigate, updatedState)
        this.tabStates.set(tabId, updatedState)
        this._sendMessage(messageType, updatedState)
    }

    // 公共方法
    createTab(url = 'about:blank', options = {}) {
        // const targetUrl = url || 'http://localhost:59001/desktop/links'
        // console.log('createTab', url)
        const customSession = this._createCustomSession(options.useProxy)
        const view = new WebContentsView({
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
            url: options?.navigate ? 'about:blank' : url,
            title: options?.navigate ? 'about:blank' : 'New Tab',
            navigate: options?.navigate
        }, this.MessageType.TAB_CREATED)

        const contents = view.webContents
        this._setupEventListeners(contents, tabId)
        contents.setUserAgent(contents.getUserAgent() + ' JYIAIBrowser')

        this.containerView.addChildView(view)
        this.updateActiveViewBounds()

        contents.loadURL(url, {
            timeout: 30000,
            extraHeaders: 'pragma: no-cache\n'
        }).catch(err => {
            console.error('Failed to load URL:', err)
        })

        // console.log('send createTab', this.tabStates.get(tabId))
        // this._sendMessage(this.MessageType.TAB_CREATED, this.tabStates.get(tabId))
    }

    updateActiveViewBounds() {
        if (!this.activeTabId) return
        const view = this.tabs.get(this.activeTabId)
        const bounds = this.containerView.getBounds()
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
                this.containerView.addChildView(view);
                this.activeTabId = tabId;
            } else {
                this.containerView.removeChildView(view);
            }
        }
        
        // 如果没有找到匹配的标签，清除当前显示
        if (!this.tabs.has(tabId)) {
            this.activeTabId = null;
        }
        
        // 更新视图边界
        this.updateActiveViewBounds();
    }

    closeTab(tabId) {
        console.log('closeTab', tabId, this.tabs)
        if (!this.tabs.has(tabId)) return
        
        const view = this.tabs.get(tabId)
        this.containerView.removeChildView(view)
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

    // 修改视图状态管理方法
    _updateViewState(tabId, state, data = {}) {
        const currentState = this.tabStates.get(tabId) || {}
        const updatedState = {
            ...currentState,
            state,
            lastUpdated: Date.now(),
            ...data
        }
        this.tabStates.set(tabId, updatedState)
        this._sendMessage(this.MessageType.TAB_VIEW_STATE, updatedState)
    }

    dispose() {
        // 清理所有标签页
        for (const [tabId, view] of this.tabs) {
            this.closeTab(tabId)
        }
        this.tabs.clear()
        this.tabStates.clear()
        this.activeTabId = null
    }

    pauseTab(tabId) {
        const view = this.tabs.get(tabId)
        if (view) {
            view.webContents.audioMuted = true
            view.webContents.setBackgroundThrottling(true)
        }
    }

    resumeTab(tabId) {
        const view = this.tabs.get(tabId)
        if (view) {
            view.webContents.audioMuted = false
            view.webContents.setBackgroundThrottling(false)
        }
    }

    _optimizeViewPerformance(view) {
        const contents = view.webContents
        
        // 设置背景节流
        contents.setBackgroundThrottling(true)
        
        // 禁用不需要的特性
        contents.session.setPreloads([])
        contents.session.setSpellCheckerEnabled(false)
        
        // 设置内存限制
        contents.setMemoryLimit({ suggestLimit: 512 }) // 512MB
    }

    // 获取所有标签信息
    getAllTabs() {
        return Array.from(this.tabStates.values())
    }

    // 查找标签
    findTabByUrl(url) {
        for (const [tabId, state] of this.tabStates) {
            if (state.url === url) {
                return tabId
            }
        }
        return null
    }

    // 批量操作
    batchOperation(tabIds, operation) {
        tabIds.forEach(tabId => {
            if (this.tabs.has(tabId)) {
                operation(this.tabs.get(tabId), tabId)
            }
        })
    }

    _setupSecurityPolicies(contents) {
        // CSP 策略
        contents.session.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': ['default-src \'self\'']
                }
            })
        })

        // 限制新窗口打开
        contents.setWindowOpenHandler(({ url }) => {
            // 在新标签页中打开而不是新窗口
            this.createTab(url)
            return { action: 'deny' }
        })
    }
}

module.exports = TabManager 