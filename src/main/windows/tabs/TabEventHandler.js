import { MessageType } from './constants.js'
import ErrorHandler from '../../utils/ErrorHandler.js'
import { getSystemConfig } from '../../config/index.js'
import ProxyManager from './ProxyManager.js'

class TabEventHandler {
    constructor(stateManager) {
        this.stateManager = stateManager
        this.systemConfig = getSystemConfig()
        // 存储每个标签页的事件清理函数
        this.cleanupHandlers = new Map()
    }

    setupEvents(contents, tabId) {
        // 清理之前的事件监听器
        if (this.cleanupHandlers.has(tabId)) {
            this.cleanupHandlers.get(tabId)()
            this.cleanupHandlers.delete(tabId)
        }

        // 收集需要清理的事件处理函数
        const cleanupFunctions = []

        this._setupNavigationEvents(contents, tabId)
        this._setupLoadingEvents(contents, tabId)
        this._setupErrorEvents(contents, tabId)
        this._setupMemoryMonitoring(contents, tabId)
        this._setupNewWindowHandler(contents, tabId)
        this._setupFaviconHandler(contents, tabId)

        // 当标签页销毁时清理事件监听器
        contents.once('destroyed', () => {
            if (this.cleanupHandlers.has(tabId)) {
                this.cleanupHandlers.get(tabId)()
                this.cleanupHandlers.delete(tabId)
            }
        })
    }

    _setupNavigationEvents(contents, tabId) {
        const handlers = {
            'page-title-updated': (event, title) => {
                this.stateManager.updateState(tabId, { title }, MessageType.TAB_TITLE_UPDATED)
            },
            'did-finish-load': () => {
                this._updatePageInfo(contents, tabId)
            },
            'did-navigate-in-page': (event, url, isMainFrame) => {
                if (isMainFrame) {
                    this.stateManager.updateState(tabId, { 
                        url,
                        loading: true
                    })
                }
            },
            'did-navigate': (event, url, httpResponseCode, httpStatusText) => {
                this.stateManager.updateState(tabId, {
                    url,
                    httpStatus: { code: httpResponseCode, text: httpStatusText }
                }, MessageType.TAB_URL_UPDATED)
            }
        }

        // 注册事件处理函数
        Object.entries(handlers).forEach(([event, handler]) => {
            contents.on(event, handler)
        })

        // 返回清理函数
        return () => {
            Object.entries(handlers).forEach(([event, handler]) => {
                contents.removeListener(event, handler)
            })
        }
    }

    _setupLoadingEvents(contents, tabId) {
        // 代理认证
        contents.on('login', (event, details, authInfo, callback) => {
            if (authInfo.isProxy) {
                event.preventDefault()
                const proxyConfig = this.systemConfig.getProxy()
                callback(proxyConfig.username, proxyConfig.password)
            }
        })

        contents.on('did-start-loading', () => {
            this.stateManager.updateState(tabId, { 
                loading: true,
                error: null
            }, MessageType.TAB_LOADING_STATE)
        })

        contents.on('did-stop-loading', () => {
            this.stateManager.updateState(tabId, { 
                loading: false,
                error: null
            }, MessageType.TAB_LOADING_STATE)
        })
    }

    _setupErrorEvents(contents, tabId) {
        // 请求错误处理
        contents.session.webRequest.onErrorOccurred((details) => {
            if (details.error.includes('ERR_PROXY_') || 
                details.error.includes('ERR_TUNNEL_')) {
                const errorResult = ErrorHandler.handleProxyError(details)
                if (errorResult.isProxyError) {
                    this.stateManager.updateState(tabId, {
                        error: {
                            type: 'PROXY_ERROR',
                            code: errorResult.errorType,
                            details: errorResult.details
                        },
                        loading: false
                    }, MessageType.TAB_REQUEST_ERROR)
                }
            } else {
                const errorResult = ErrorHandler.handleBrowserError(details)
                this.stateManager.updateState(tabId, {
                    error: {
                        type: 'BROWSER_ERROR',
                        code: errorResult.errorType,
                        details: errorResult.details
                    },
                    loading: false
                }, MessageType.TAB_REQUEST_ERROR)
            }
        })
    }

    _setupMemoryMonitoring(contents, tabId) {
        const memoryInterval = setInterval(() => {
            if (contents.isDestroyed()) {
                clearInterval(memoryInterval)
                return
            }
            
            const processId = contents.getProcessId()
            if (processId) {
                process.getProcessMemoryInfo(processId).then(info => {
                    if (info.private > 1024 * 1024 * 500) { // 500MB
                        console.warn(`Tab ${tabId} memory usage high:`, info)
                    }
                }).catch(err => {
                    console.error('Failed to get memory info:', err)
                    clearInterval(memoryInterval)
                })
            }
        }, 30000)

        contents.once('destroyed', () => {
            clearInterval(memoryInterval)
        })
    }

    _setupFaviconHandler(contents, tabId) {
        // 拦截所有请求
        contents.session.webRequest.onBeforeRequest(
            { urls: ['*://*/*favicon*', '*://*/favicon.ico'] },
            (details, callback) => {
                const tabState = this.stateManager.getState(tabId)
                
                if (tabState?.useProxy) {
                    // 如果标签页启用了代理，使用代理配置
                    const proxyConfig = ProxyManager.getProxyConfig()
                    if (proxyConfig.enabled) {
                        // 添加代理认证头
                        const requestOptions = {
                            ...details,
                            proxyUrl: `http://${proxyConfig.host}:${proxyConfig.port}`
                        }
                        
                        if (proxyConfig.username && proxyConfig.password) {
                            const auth = Buffer.from(`${proxyConfig.username}:${proxyConfig.password}`).toString('base64')
                            requestOptions.extraHeaders = {
                                'Proxy-Authorization': `Basic ${auth}`
                            }
                        }
                        
                        callback(requestOptions)
                        return
                    }
                }
                
                // 不使用代理的情况
                callback({ cancel: false })
            }
        )

        // 监听favicon更新
        contents.on('page-favicon-updated', (event, favicons) => {
            if (favicons && favicons.length > 0) {
                this.stateManager.updateState(tabId, {
                    favicon: favicons[0],
                    icons: favicons.map(url => ({
                        href: url,
                        rel: 'icon'
                    }))
                })
            }
        })
    }

    _updatePageInfo(contents, tabId) {
        const tabState = this.stateManager.tabStates.get(tabId)
        if (!tabState?.isHome && !tabState?.navigate) {
            Promise.all([
                contents.getTitle(),
                contents.getURL(),
                contents.executeJavaScript(`
                    JSON.stringify({
                        description: document.querySelector('meta[name="description"]')?.content || '',
                        keywords: document.querySelector('meta[name="keywords"]')?.content || '',
                        favicon: document.querySelector('link[rel="icon"]')?.href 
                            || document.querySelector('link[rel="shortcut icon"]')?.href 
                            || document.querySelector('link[rel="apple-touch-icon"]')?.href
                            || window.location.origin + '/favicon.ico',
                        ogTitle: document.querySelector('meta[property="og:title"]')?.content,
                        ogDescription: document.querySelector('meta[property="og:description"]')?.content,
                        ogImage: document.querySelector('meta[property="og:image"]')?.content,
                        icons: Array.from(document.querySelectorAll('link[rel*="icon"]')).map(link => ({
                            href: link.href,
                            rel: link.rel,
                            sizes: link.sizes?.value || ''
                        }))
                    })
                `)
            ]).then(([title, url, metaDataStr]) => {
                const metaData = JSON.parse(metaDataStr)
                // 使用 useProxy 状态来决定是否通过代理获取 favicon
                const currentState = this.stateManager.getState(tabId)
                this.stateManager.updateState(tabId, {
                    title,
                    url,
                    loading: false,
                    metaData: {
                        ...metaData,
                        timestamp: Date.now()
                    },
                    favicon: metaData.favicon,
                    icons: metaData.icons,
                    useProxy: currentState?.useProxy || false
                })
            }).catch(error => {
                console.error('Error getting page info:', error)
                this.stateManager.updateState(tabId, {
                    error: {
                        code: 'META_FETCH_ERROR',
                        description: error.message
                    },
                    loading: false
                })
            })
        }
    }

    _setupNewWindowHandler(contents, tabId) {
        // 拦截新窗口打开
        contents.setWindowOpenHandler(({ url, frameName, features, disposition }) => {
            // 忽略 devtools 和特殊窗口
            console.log('new window:', { url, frameName, features, disposition })

            // 允许以下情况：
            // 1. about:blank 页面
            // 2. 带有 nodeIntegration 的窗口（开发工具等）
            // 3. 登录弹窗 (disposition 为 'foreground-tab' 以外的情况)
            if (url === 'about:blank' || 
                (frameName === '_blank' && features.indexOf('nodeIntegration') !== -1) ||
                disposition !== 'foreground-tab') {
                return { action: 'allow' }
            }

            // 只处理从链接点击打开的新窗口 (disposition === 'foreground-tab')
            const currentState = this.stateManager.getState(tabId)
            this.stateManager.topView.webContents.send('tab-command', {
                action: 'addTab',
                payload: {
                    title: 'New Tab',
                    url: url,
                    isApp: false,
                    isHome: false,
                    navigate: false,
                    isNewWindow: true,
                    useProxy: currentState?.useProxy || false
                }
            })
            return { action: 'deny' }
        })
    }
}

export default TabEventHandler 