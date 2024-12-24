const { WebContentsView, Menu } = require('electron')
const path = require('path')
const { getSystemConfig } = require('../config')
const ErrorHandler = require('../utils/ErrorHandler')

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
            TAB_VIEW_STATE: 'tab-view-state',
            TAB_PROXY_STATUS: 'tab-proxy-status',
            TAB_REQUEST_ERROR: 'tab-request-error'
        }

        // 设置全局请求拦截
        this._setupGlobalRequestInterception()
    }

    // 获取代理配置的辅助方法
    getProxyConfig() {
        try {
            const config = getSystemConfig().getProxy()
            // 确保配置包含所有必要字段
            return {
                enabled: true, // 如果调用这个方法，就假定要启用代理
                host: config.host || 'localhost',
                port: config.port || '7890',
                username: config.username || '',
                password: config.password || '',
                ...config
            }
        } catch (error) {
            console.warn('Failed to get proxy config:', error)
            return {
                enabled: false,
                host: 'localhost',
                port: '7890',
                username: '',
                password: ''
            }
        }
    }

    // 私有方法：发送消息到顶部视图
    _sendMessage(type, payload) {
        if (!this.topView?.webContents) {
            console.warn('TopView not available for message:', type)
            return
        }
        this.topView.webContents.send('ipc-msg', {type, payload})
    }

    // 私有方法：创建自定义会话
    _createCustomSession(useProxy = false) {
        const session = require('electron').session
        const customSession = session.fromPartition(`persist:tab_${useProxy ? 'proxy' : 'default'}`)
        
        // 设置基本配置
        customSession.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

        // 根据环境变量设置权限
        if (process.env.NODE_ENV === 'development') {
            // 开发环境：允许所有权限
            customSession.setPermissionRequestHandler((webContents, permission, callback) => {
                console.log('Permission requested:', permission)
                callback(true)
            })
        }

        // 处理本地资源请求
        customSession.webRequest.onBeforeRequest((details, callback) => {
            const url = new URL(details.url)
            
            // 处理本地资源请求
            if (url.hostname === 'localhost') {
                callback({})
                return
            }
            
            callback({ cancel: false })
        })

        // 配置本地资源的响应头
        customSession.webRequest.onHeadersReceived((details, callback) => {
            const responseHeaders = {...details.responseHeaders}
            
            try {
                const url = new URL(details.url)
                
                // 为本地资源添加缓存控制
                if (url.hostname === 'localhost') {
                    responseHeaders['Cache-Control'] = ['public, max-age=31536000']
                    responseHeaders['Access-Control-Allow-Origin'] = ['*']
                }
                
                // 为图片和字体文件添加特殊处理
                if (details.resourceType === 'image' || details.resourceType === 'font') {
                    responseHeaders['Access-Control-Allow-Origin'] = ['*']
                    responseHeaders['Access-Control-Allow-Headers'] = ['*']
                    responseHeaders['Access-Control-Allow-Methods'] = ['GET']
                }
            } catch (error) {
                console.error('Error processing URL:', error)
            }
            
            callback({ responseHeaders })
        })

        // 配置允许加载本地资源
        customSession.setPermissionRequestHandler((webContents, permission, callback) => {
            const allowedPermissions = [
                'media',
                'mediaKeySystem',
                'geolocation',
                'notifications',
                'fullscreen',
                'pointerLock',
                'local-fonts'  // 允许访问本地字体
            ]
            callback(allowedPermissions.includes(permission) || permission === 'local-fonts')
        })

        // 配置缓存存储
        customSession.protocol.registerFileProtocol('local-resource', (request, callback) => {
            const url = request.url.substr(15)
            callback({ path: path.normalize(`${__dirname}/../../${url}`) })
        })

        // 配置代理
        if (useProxy) {
            this._configureProxy(customSession)
        }

        return customSession
    }

    // 配置代理
    _configureProxy(session) {
        const proxyConfig = this.getProxyConfig()
        if (!proxyConfig.enabled) {
            console.log('Proxy is disabled, skipping proxy configuration')
            return
        }

        const proxySettings = {
            mode: 'fixed_servers',
            proxyRules: `http://${proxyConfig.host}:${proxyConfig.port}`,
            proxyBypassRules: '<local>;localhost;127.0.0.1;*.local',
            pacScript: '',
            // proxyRoutingRules: {
            //     'ws': `http://${proxyConfig.host}:${proxyConfig.port}`,  // 支持 WebSocket
            //     'wss': `http://${proxyConfig.host}:${proxyConfig.port}`  // 支持 WebSocket over SSL
            // }
        }

        // 设置代理认证
        session.webRequest.onBeforeSendHeaders((details, callback) => {
            const headers = {...details.requestHeaders}
            
            if (proxyConfig.username && proxyConfig.password) {
                const auth = Buffer.from(`${proxyConfig.username}:${proxyConfig.password}`).toString('base64')
                headers['Proxy-Authorization'] = `Basic ${auth}`
            }
            
            callback({ requestHeaders: headers })
        })

        // 设置代理配置
        session.setProxy(proxySettings).then(() => {
            console.log('Proxy configured successfully')
        }).catch(err => {
            console.error('Failed to set proxy:', err)
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

        // 监听导航状态变化 - 更新处理方式
        contents.on('did-navigate', (event, url, httpResponseCode, httpStatusText) => {
            this._updateTabState(tabId, {
                url,
                httpStatus: {
                    code: httpResponseCode,
                    text: httpStatusText
                }
            }, this.MessageType.TAB_URL_UPDATED)
        })

        // 添加导航完成事件来更新 URL
        contents.on('did-finish-navigation', (event, url) => {
            if (!event.isMainFrame) return // 只处理主框架的导航
            
            // 导航完成时发送 URL 更新事件
            this._updateTabState(tabId, { url }, this.MessageType.TAB_URL_UPDATED)
        })

        // 改进加载状态处理
        contents.on('did-start-loading', () => {
            this._updateTabState(tabId, { 
                loading: true,
                error: null
            }, this.MessageType.TAB_LOADING_STATE)
        })

        contents.on('did-stop-loading', () => {
            this._updateTabState(tabId, { 
                loading: false,
                error: null
            }, this.MessageType.TAB_LOADING_STATE)
        })
        

        // 添加导航错误处理
        contents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            if (!isMainFrame) return

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
        // contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        //     const allowedPermissions = [
        //         'clipboard-read',
        //         'clipboard-write',
        //         'pointerLock',
        //         'fullscreen',
        //         'media',
        //         'geolocation',
        //         'notifications'
        //     ]
        //     callback(allowedPermissions.includes(permission))
        // })

        // 证书错误处理
        contents.session.setCertificateVerifyProc((request, callback) => {
            callback(0) // 允许所有证书
        })

        // contents.on('crashed', () => {
        //     this._updateViewState(tabId, this.ViewState.ERROR, {
        //         errorCode: 'CRASHED',
        //         errorDescription: 'Page crashed'
        //     })
        // })

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


        // 只在发生错误时记录日志
        contents.session.webRequest.onErrorOccurred((details) => {
            // 处理代理相关错误
            if (details.error.includes('ERR_PROXY_') || 
                details.error.includes('ERR_TUNNEL_')) {
                const errorResult = ErrorHandler.handleProxyError(details)
                
                // 更新标签状态以显示代理错误
                if (errorResult.isProxyError) {
                    this._updateTabState(tabId, {
                        error: {
                            type: 'PROXY_ERROR',
                            code: errorResult.errorType,
                            details: errorResult.details
                        },
                        loading: false
                    }, this.MessageType.TAB_REQUEST_ERROR)
                }
            } else {
                // 处理其他浏览器错误
                const errorResult = ErrorHandler.handleBrowserError(details)
                
                this._updateTabState(tabId, {
                    error: {
                        type: 'BROWSER_ERROR',
                        code: errorResult.errorType,
                        details: errorResult.details
                    },
                    loading: false
                }, this.MessageType.TAB_REQUEST_ERROR)
            }
        })

        // 移除之前的 onBeforeRequest 和 onCompleted 监听器的日志输出
        // contents.session.webRequest.onBeforeRequest((details, callback) => {
        //     // 打印请求URL
        //     // console.log('Request URL:', details.url)
        //     callback({ cancel: false });
        // });
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
        // URL 验证和处理
        const validUrl = (() => {
            if (!url || url === '') {
                return 'about:blank'
            }
            try {
                // 尝试解析 URL
                new URL(url)
                return url
            } catch (e) {
                // 如果不是有效的 URL，检查是否是相对路径
                if (url.startsWith('/')) {
                    const systemConfig = getSystemConfig()
                    const baseUrl = systemConfig.get('baseUrl')
                    return `${baseUrl}${url}`
                }
                // 如果不是相对路径，添加 https://
                if (!url.includes('://')) {
                    return `https://${url}`
                }
                return 'about:blank'
            }
        })()

        const customSession = this._createCustomSession(options.useProxy)
        const view = new WebContentsView({
            webPreferences: {
                nodeIntegration: options.navigate ? false : true,
                contextIsolation: options.navigate ? true : false,
                session: customSession,
                webSecurity: true,
                allowRunningInsecureContent: false,
                experimentalFeatures: true,
                // 添加本地资源访问相关配置
                allowFileAccessFromFiles: true,
                webviewTag: true,
                // 媒体相关配置
                plugins: true,
                // 配置缓存
                partition: `persist:tab_${options.useProxy ? 'proxy' : 'default'}`,
                ...(options.navigate ? {
                    preload: path.join(__dirname, '../../preload/sdk.js')
                } : {})
            }
        })

        const tabId = options.tabId || Date.now().toString()
        // console.log('createTab', options, view)
        this.tabs.set(tabId, view)
        
        // 设置为活动标签页
        this.activeTabId = tabId
        
        this._updateTabState(tabId, {
            useProxy: options.useProxy || false,
            url: options?.navigate ? 'about:blank' : validUrl,
            title: options?.navigate ? 'about:blank' : 'New Tab',
            navigate: options?.navigate,
            isHome: options?.isHome
        }, this.MessageType.TAB_CREATED)

        const contents = view.webContents
        this._setupEventListeners(contents, tabId)
        contents.setUserAgent(contents.getUserAgent() + ' JYIAIBrowser')
        contents.openDevTools({ mode: 'detach' })
        // 先移除其他标签页的显示
        for (const [id, v] of this.tabs) {
            if (id !== tabId) {
                this.containerView.removeChildView(v)
            }
        }

        // 添加新标签页到容器
        this.containerView.addChildView(view)
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
                this._updateTabState(tabId, {
                    error: {
                        code: err.code || 'LOAD_ERROR',
                        description: err.message
                    },
                    loading: false
                }, this.MessageType.TAB_STATE_CHANGED)
            })
        }

        // 添加本地资源错误处理
        contents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
            if (errorCode === -113) { // ERR_CACHE_MISS
                // 重新加载资源
                contents.reload()
            }
        })

        return tabId
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
            const itemHeight = 40  // 每标签的高度
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

    // 可选：添加获取代理状态的方法
    getTabProxyStatus(tabId) {
        const state = this.tabStates.get(tabId);
        return state?.proxyStatus || {
            enabled: false,
            used: false,
            info: null,
            timestamp: null,
            error: null
        };
    }

    // 添加缓存清理方法
    clearBrowserCache() {
        const sessions = [
            session.fromPartition('persist:tab_proxy'),
            session.fromPartition('persist:tab_default')
        ]
        
        return Promise.all(sessions.map(session => 
            session.clearCache()
        )).then(() => {
            console.log('Cache cleared successfully')
        }).catch(err => {
            console.error('Failed to clear cache:', err)
        })
    }
}

module.exports = TabManager 