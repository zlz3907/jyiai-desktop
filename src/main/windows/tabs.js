const { BrowserView } = require('electron')
const path = require('path')
const { proxyConfig } = require('../config/proxy')
class TabManager {
    constructor(mainWindow) {
        this.mainWindow = mainWindow
        this.tabs = new Map()
        this.tabStates = new Map()
        this.activeTabId = null
        
        // 预留顶部空间给标签栏和工具栏
        this.toolbarHeight = 80 // 标签栏 + 地址栏的高度
        
        // 监听窗口大小改变
        this.mainWindow.on('resize', () => {
            this.updateActiveViewBounds()
        })
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

    createTab(url = 'about:blank', options = {}) {
        if (url === '') {
            url = 'about:blank'
            return
        }
        
        const session = require('electron').session;
        const customSession = session.fromPartition(`persist:tab_${Date.now()}`);

        // 设置基本配置
        customSession.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 根据选项决定是否使用代理
        if (options.useProxy) {
            const proxyUrl = `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`
            
            customSession.setProxy({
                mode: 'fixed_servers',
                proxyRules: proxyUrl,
                proxyBypassRules: '<local>'
            }).then(() => {
                console.log('Proxy set successfully')
            }).catch(err => {
                console.error('Failed to set proxy:', err)
            })
        }

        const view = new BrowserView({
            webPreferences: {
                // nodeIntegration: false,  // 改为 false 增加安全性
                // contextIsolation: true,  // 改为 true 增加安全性
                // webSecurity: true,
                session: customSession,
                // allowRunningInsecureContent: true,
                // // 添加其他必要的安全配置
                // sandbox: true,
                // javascript: true,
                // webgl: true,
                // plugins: true
            }
        })

        const contents = view.webContents

        // 简化响应头处理
        customSession.webRequest.onHeadersReceived((details, callback) => {
            callback({ responseHeaders: details.responseHeaders })
        })

        // 添加错误处理
        contents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('Page load failed:', errorCode, errorDescription)
        })

        // 使用 try-catch 包装 loadURL
        try {
            contents.loadURL(url)
        } catch (err) {
            console.error('Failed to load URL:', err)
        }

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

        // 处理证书错误
        contents.session.setCertificateVerifyProc((request, callback) => {
            callback(0) // 允许所有证书
        })

        contents.setUserAgent(contents.getUserAgent() + ' JYIAIBrowser')

        // contents.setWindowOpenHandler(({ url }) => {
        //     this.createTab(url)
        //     return { action: 'allow' }
        // })

        contents.on('dom-ready', () => {
            // contents.executeJavaScript(`
            //     document.documentElement.style.userSelect = 'auto';
            //     document.documentElement.style.pointerEvents = 'auto';
            // `)
        })

        this.mainWindow.addBrowserView(view)

        // 使用传入的 tabId 或生成新的
        const tabId = options.tabId || Date.now().toString()
        this.tabs.set(tabId, view)
        
        // 保存标签页状态
        this.tabStates.set(tabId, {
            useProxy: options.useProxy || false,
            url: url
        })

        // 设置为当前显示的视图
        this.mainWindow.setBrowserView(view)
        this.activeTabId = tabId
        this.updateActiveViewBounds()
        
        // 监听页面标题变化
        contents.on('page-title-updated', (event, title) => {
            const state = this.tabStates.get(tabId)
            this.tabStates.set(tabId, {
                ...state,
                title: title,
                id: tabId
            })
            this.mainWindow.webContents.send('tab-loading', {
                ...this.tabStates.get(tabId)
            })
        })

        // 监听页面 URL 变化
        contents.on('did-navigate', (event, url) => {
            const state = this.tabStates.get(tabId)
            this.tabStates.set(tabId, {
                ...state,
                url: url,
                id: tabId
            })
            this.mainWindow.webContents.send('tab-loading', {
                ...this.tabStates.get(tabId)
            })
        })

        // 添加加载状态监听
        contents.on('did-start-loading', () => {
            const state = this.tabStates.get(tabId)
            this.tabStates.set(tabId, {
                ...state,
                loading: true,
                id: tabId
            })
            this.mainWindow.webContents.send('tab-loading', {
                ...this.tabStates.get(tabId)  // 包含完整的标签状态
            })
        })

        contents.on('did-stop-loading', () => {
            const state = this.tabStates.get(tabId)
            this.tabStates.set(tabId, {
                ...state,
                loading: false,
                id: tabId
            })
            this.mainWindow.webContents.send('tab-loading', {
                ...this.tabStates.get(tabId)  // 包含完整的标签状态
            })
        })

        return {
            id: tabId,
            url,
            title: 'New Tab'
        }
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
        if (view.webContents.canGoBack()) {
            view.webContents.goBack()
        }
    }

    goForward() {
        if (!this.activeTabId) return
        const view = this.tabs.get(this.activeTabId)
        if (view.webContents.canGoForward()) {
            view.webContents.goForward()
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

        // 更新状态
        this.tabStates.set(tabId, {
            ...state,
            useProxy: newProxyState
        })

        const session = view.webContents.session

        // 设置新的代理状态
        if (newProxyState) {
            const proxyUrl = `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`
            session.setProxy({
                mode: 'fixed_servers',
                proxyRules: proxyUrl,
                proxyBypassRules: '<local>'
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