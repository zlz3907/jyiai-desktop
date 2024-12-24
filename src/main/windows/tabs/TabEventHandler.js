const { MessageType } = require('./constants')
const ErrorHandler = require('../../utils/ErrorHandler')
const { getSystemConfig } = require('../../config')

class TabEventHandler {
    constructor(tabStateManager) {
        this.stateManager = tabStateManager
        this.systemConfig = getSystemConfig()
    }

    setupEvents(contents, tabId) {
        this._setupNavigationEvents(contents, tabId)
        this._setupLoadingEvents(contents, tabId)
        this._setupErrorEvents(contents, tabId)
        this._setupMemoryMonitoring(contents, tabId)
    }

    _setupNavigationEvents(contents, tabId) {
        // 页面标题更新
        contents.on('page-title-updated', (event, title) => {
            this.stateManager.updateState(tabId, { title }, MessageType.TAB_TITLE_UPDATED)
        })

        // 导航完成，获取完整信息
        contents.on('did-finish-load', () => {
            this._updatePageInfo(contents, tabId)
        })

        // URL 更新
        contents.on('did-navigate', (event, url, httpResponseCode, httpStatusText) => {
            this.stateManager.updateState(tabId, {
                url,
                httpStatus: { code: httpResponseCode, text: httpStatusText }
            }, MessageType.TAB_URL_UPDATED)
        })
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
            // 获取当前 URL
            const url = contents.getURL()
            
            // // 检查是否是 YouTube 观看页面
            // if (url.includes('youtube.com/watch')) {
            //     // 延迟 500ms 后重新加载页面
            //     setTimeout(() => {
            //         if (!contents.isDestroyed()) {
            //             contents.reload()
            //         }
            //     }, 500)
            //     return
            // }

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

    async _updatePageInfo(contents, tabId) {
        try {
            const [title, url, metaDataStr] = await Promise.all([
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
            ])

            const metaData = JSON.parse(metaDataStr)
            this.stateManager.updateState(tabId, {
                title,
                url,
                loading: false,
                metaData: {
                    ...metaData,
                    timestamp: Date.now()
                },
                favicon: metaData.favicon,
                icons: metaData.icons
            })
        } catch (error) {
            console.error('Error getting page info:', error)
            this.stateManager.updateState(tabId, {
                error: {
                    code: 'META_FETCH_ERROR',
                    description: error.message
                },
                loading: false
            })
        }
    }
}

module.exports = TabEventHandler 