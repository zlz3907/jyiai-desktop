const { WebContentsView, Menu } = require('electron')
const path = require('path')
const { getSystemConfig } = require('../config')

class TabManager {
    constructor(containerView, topView) {
        this.containerView = containerView
        this.topView = topView
        this.tabs = new Map()
        this.tabStates = new Map()
        this.activeTabId = null
        this.toolbarHeight = 72
        this.menuView = null

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

        // 设置全局请求拦截
        this._setupGlobalRequestInterception()
    }

    // 获取代理配置的辅助方法
    getProxyConfig() {
        try {
            return getSystemConfig().getProxy()
        } catch (error) {
            console.warn('Failed to get proxy config:', error)
            return {
                enabled: false,
                host: 'localhost',
                port: '7890'
            }
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

    // 配置代理
    _configureProxy(session) {
        const proxyConfig = this.getProxyConfig()
        const proxySettings = {
            mode: 'fixed_servers',
            proxyRules: `http://${proxyConfig.host}:${proxyConfig.port}`,
            proxyBypassRules: '<local>'
        }

        session.setProxy(proxySettings)
        
        console.log('setProxy', proxyConfig)

        // 添加代理认证头
        session.webRequest.onBeforeSendHeaders((details, callback) => {
            const auth = Buffer.from(`${proxyConfig.username}:${proxyConfig.password}`).toString('base64')
            const headers = {
                ...details.requestHeaders,
                'Proxy-Authorization': `Basic ${auth}`,
                'Connection': 'keep-alive'
            }

            callback({ requestHeaders: headers })
        })

        // 错误处理
        session.webRequest.onErrorOccurred((details) => {
            if (details.error.includes('ERR_TUNNEL_CONNECTION_FAILED')) {
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

        // // 监听网站图标更新
        // contents.on('page-favicon-updated', (event, favicons) => {
        //     // favicons 是一个数组，通常包含多个尺寸的图标
        //     this._updateTabState(tabId, { 
        //         favicon: favicons[0] || null 
        //     }, this.MessageType.TAB_STATE_CHANGED)
        // })

        // 获取标签状态
        const tabState = this.tabStates.get(tabId)
        
        // 只为非导航页和非主页添加网站信息监听
        if (!tabState?.isHome && !tabState?.navigate) {
            // 监听导航完成事件，获取完整信息
            contents.on('did-finish-load', () => {
                // 获取网站的完整信息
                Promise.all([
                    contents.getTitle(),
                    contents.getURL(),
                    contents.executeJavaScript(`
                        JSON.stringify({
                            // 获取网站的 meta 信息
                            description: document.querySelector('meta[name="description"]')?.content || '',
                            keywords: document.querySelector('meta[name="keywords"]')?.content || '',
                            // 获取网站的图标信息
                            favicon: document.querySelector('link[rel="icon"]')?.href 
                                || document.querySelector('link[rel="shortcut icon"]')?.href 
                                || document.querySelector('link[rel="apple-touch-icon"]')?.href
                                || window.location.origin + '/favicon.ico',
                            // 获取 Open Graph 信息
                            ogTitle: document.querySelector('meta[property="og:title"]')?.content,
                            ogDescription: document.querySelector('meta[property="og:description"]')?.content,
                            ogImage: document.querySelector('meta[property="og:image"]')?.content,
                            // 获取所有可能的图标
                            icons: Array.from(document.querySelectorAll('link[rel*="icon"]')).map(link => ({
                                href: link.href,
                                rel: link.rel,
                                sizes: link.sizes?.value || ''
                            }))
                        })
                    `)
                ]).then(([title, url, metaDataStr]) => {
                    const metaData = JSON.parse(metaDataStr)
                    
                    // 更新标签状态
                    const updatedState = {
                        title: title,
                        url: url,
                        loading: false,
                        metaData: {
                            ...metaData,
                            timestamp: Date.now()
                        }
                    }

                    // 更新缓存的标签属性
                    const currentState = this.tabStates.get(tabId) || {}
                    this.tabStates.set(tabId, {
                        ...currentState,
                        ...updatedState,
                        favicon: metaData.favicon,
                        icons: metaData.icons,
                        lastUpdated: Date.now()
                    })

                    // 发送状态更新消息
                    this._sendMessage(this.MessageType.TAB_STATE_CHANGED, this.tabStates.get(tabId))

                }).catch(error => {
                    console.error('Error getting page info:', error)
                    // 即使出错也要更新状态
                    this._updateTabState(tabId, {
                        error: {
                            code: 'META_FETCH_ERROR',
                            description: error.message
                        },
                        loading: false
                    }, this.MessageType.TAB_STATE_CHANGED)
                })
            })
        }

        // 监听加载状态
        contents.on('did-start-loading', () => {
            this._updateTabState(tabId, { loading: true }, this.MessageType.TAB_LOADING_STATE)
        })

        contents.on('did-stop-loading', () => {
            this._updateTabState(tabId, { loading: false }, this.MessageType.TAB_LOADING_STATE)
        })

        // 监听导航状态变化
        contents.on('did-navigate', (event, url, httpResponseCode, httpStatusText) => {
            this._updateTabState(tabId, {
                url,
                httpStatus: {
                    code: httpResponseCode,
                    text: httpStatusText
                }
            }, this.MessageType.TAB_URL_UPDATED)
        })

        // 错误处理
        contents.on('did-fail-load', (event, errorCode, errorDescription) => {
            this._updateTabState(tabId, {
                error: {
                    code: errorCode,
                    description: errorDescription
                },
                loading: false
            }, this.MessageType.TAB_STATE_CHANGED)
        })

        // 代理认证
        contents.on('login', (event, details, authInfo, callback) => {
            if (authInfo.isProxy) {
                event.preventDefault()
                const proxyConfig = this.getProxyConfig()
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

        // 添加导航完成事件来更新 URL
        contents.on('did-finish-navigation', (event, url) => {
            if (!event.isMainFrame) return // 只处理主框架的导航
            
            // 导航完成时发送 URL 更新事件
            this._updateTabState(tabId, { url }, this.MessageType.TAB_URL_UPDATED)
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
        // console.log('updatedState', messageType, currentState?.navigate, updatedState)
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
                nodeIntegration: options.navigate ? false : true,
                contextIsolation: options.navigate ? true : false,
                session: customSession,
                enableBlinkFeatures: '',
                disableBlinkFeatures: 'WebAuthentication,WebUSB,WebBluetooth',
                ...(options.navigate ? {
                    preload: path.join(__dirname, '../../preload/sdk.js')
                } : {})
            }
        })

        // console.log('createTab', options)   
        // view.webContents.openDevTools({ mode: 'detach' })
        const tabId = options.tabId || Date.now().toString()
        this.tabs.set(tabId, view)
        
        // 设置为活动标签页
        this.activeTabId = tabId
        
        this._updateTabState(tabId, {
            useProxy: options.useProxy || false,
            url: options?.navigate ? 'about:blank' : url,
            title: options?.navigate ? 'about:blank' : 'New Tab',
            navigate: options?.navigate,
            isHome: options?.isHome
        }, this.MessageType.TAB_CREATED)

        const contents = view.webContents
        this._setupEventListeners(contents, tabId)
        contents.setUserAgent(contents.getUserAgent() + ' JYIAIBrowser')

        // 先移除其他标签页的显示
        for (const [id, v] of this.tabs) {
            if (id !== tabId) {
                this.containerView.removeChildView(v)
            }
        }

        // 添加新标签页到容器
        this.containerView.addChildView(view)
        this.updateActiveViewBounds(options?.isHome)

        console.log('createTab', url, 'activeTabId:', this.activeTabId)
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
        if (!view) return

        const tabState = this.tabStates.get(this.activeTabId)
        const isHome = tabState?.isHome || false
        console.log('updateActiveViewBounds', this.activeTabId, view.getBounds())
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

    switchTab(tabId) {
        // 获取要切换到的标签的状态
        const tabState = this.tabStates.get(tabId)
        
        // 遍历所有标签页，只显示匹配的id
        for (const [id, view] of this.tabs) {
            if (id === tabId) {
                this.containerView.addChildView(view)
                this.activeTabId = tabId
            } else {
                this.containerView.removeChildView(view)
            }
        }
        
        // 如果没有找到匹配的标签，清除当前显示
        if (!this.tabs.has(tabId)) {
            this.activeTabId = null
        }
        
        // 更新视图边界，传入 isHome 参数
        this.updateActiveViewBounds(tabState?.isHome)
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
            const proxyConfig = this.getProxyConfig()
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

    // 创建自定义弹出菜单
    createTabsMenu(x, y, menuUrl) {
        // 如果已有菜单，先关闭
        if (this.menuView) {
            this.closeTabsMenu()
        }

        console.log('createTabsMenu', x, y, menuUrl)
        return new Promise((resolve) => {
            // 准备菜单数据
            const menuData = {
                tabs: Array.from(this.tabStates.values()),
                activeTabId: this.activeTabId
            }

            // 计算菜单高度
            const itemHeight = 40  // 每个标签项的高度
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
                    preload: path.join(__dirname, '../../preload/sdk.js'),
                }
            })

            // 添加到容器
            this.containerView.addChildView(this.menuView)
            // this.menuView.webContents.openDevTools({ mode: 'detach' })

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
                console.log('init-menu-data', {
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

            // 监听菜单操作
            const removeMenu = () => {
                if (this.menuView) {
                    this.containerView.removeChildView(this.menuView)
                    this.menuView.webContents.destroy()
                    this.menuView = null
                    resolve()
                }
            }

            // 监听菜单关闭事件
            this.menuView.webContents.on('ipc-message', (event, channel, ...args) => {
                switch (channel) {
                    case 'menu-close':
                        removeMenu()
                        break
                    case 'switch-tab':
                        this.switchTab(args[0])
                        removeMenu()
                        break
                    case 'close-tab':
                        this.closeTab(args[0])
                        removeMenu()
                        break
                    case 'new-tab':
                        this.createTab(args[0] || 'about:blank')
                        removeMenu()
                        break
                    // 可以添加更多菜单操作...
                }
            })

            // 点击菜单外部区域关闭菜单
            const clickHandler = (event) => {
                const clickX = event.x
                const clickY = event.y
                const menuBounds = this.menuView.getBounds()

                if (clickX < menuBounds.x || clickX > menuBounds.x + menuBounds.width ||
                    clickY < menuBounds.y || clickY > menuBounds.y + menuBounds.height) {
                    removeMenu()
                    this.containerView.removeListener('click', clickHandler)
                }
            }
            this.containerView.on('click', clickHandler)

            // 加载菜单页面
            this.menuView.webContents.loadURL(menuUrl).catch(err => {
                console.error('Failed to load menu:', err)
                removeMenu()
            })
        })
    }

    // 添加关闭菜单的方法
    closeTabsMenu() {
        if (this.menuView) {
            this.containerView.removeChildView(this.menuView)
            this.menuView.webContents.destroy()
            this.menuView = null
        }
    }

    // 获取当前活动标签
    getActiveTabId() {
        return this.activeTabId
    }

    // 添加新的私有方法来设置全局请求拦截
    _setupGlobalRequestInterception() {
        const handleNewWindow = (webContents) => {
            // 只处理新窗口打开的情况
            webContents.setWindowOpenHandler(({ url, frameName, features }) => {
                // 忽略 devtools 和特殊窗口
                // console.log('url', url, frameName, features)
                if (url === 'about:blank') {
                    return { action: 'deny' }
                }
                if (frameName === '_blank' && features.indexOf('nodeIntegration') !== -1) {
                    return { action: 'allow' }
                }

                // 发送创建标签命令并阻止新窗口
                this.topView.webContents.send('tab-command', {
                    action: 'addTab',
                    payload: {
                        title: 'New Tab',
                        // id: uuidv4(),
                        url: url,
                        isApp: false,
                        isHome: false,
                        navigate: false,
                        isNewWindow: true
                    }
                })
                return { action: 'deny' }
            })
        }

        // 监听新创建的 webContents
        require('electron').app.on('web-contents-created', (event, webContents) => {
            handleNewWindow(webContents)
        })

        // 为现有标签设置拦截
        this.tabs.forEach(view => {
            handleNewWindow(view.webContents)
        })
    }

    // 添加辅助方法检查是否同域名
    _isSameDomain(url1, url2) {
        try {
            if (!url1 || !url2) return false
            const domain1 = new URL(url1).hostname
            const domain2 = new URL(url2).hostname
            return domain1 === domain2
        } catch (e) {
            console.error('Error comparing domains:', e)
            return false
        }
    }
}

module.exports = TabManager 