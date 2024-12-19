const { BrowserView } = require('electron')

class LayoutManager {
    constructor(window, tabManager) {
        this.window = window
        this.tabManager = tabManager
        this.topView = null
        this.bottomView = null
        this.toolbarHeight = 72
        this.splitRatio = 0.6
    }

    createViews() {
        // 创建顶部视图
        this.topView = new BrowserView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: true,
                sandbox: true,
                preload: require('path').join(__dirname, '../../preload/sdk.js')
            }
        })

        // 底部视图使用 TabManager
        this.bottomView = this.tabManager

        // 添加顶部视图到窗口
        this.window.addBrowserView(this.topView)

        // 初始化布局
        this.updateLayout()

        // 监听窗口大小改变
        this.window.on('resize', () => {
            this.updateLayout()
        })
    }

    updateLayout() {
        const bounds = this.window.getBounds()
        const contentHeight = bounds.height - this.toolbarHeight
        
        // 顶部视图占据splitRatio的可用高度
        this.topView.setBounds({
            x: 0,
            y: this.toolbarHeight,
            width: bounds.width,
            height: Math.floor(contentHeight * this.splitRatio)
        })
        
        // 更新 TabManager 的工具栏高度和视图边界
        if (this.tabManager) {
            this.tabManager.toolbarHeight = this.toolbarHeight + Math.floor(contentHeight * this.splitRatio)
            this.tabManager.updateActiveViewBounds()
        }
    }

    loadContent(topUrl) {
        if (topUrl) {
            this.topView.webContents.loadURL(topUrl).catch(err => {
                console.error('Failed to load top view URL:', err)
            })
        }
    }

    getTopView() {
        return this.topView
    }

    getBottomView() {
        return this.bottomView
    }

    // 显示/隐藏视图
    toggleView(view, show) {
        if (!view) return

        if (show) {
            if (view === this.topView) {
                this.window.addBrowserView(view)
            }
        } else {
            if (view === this.topView) {
                this.window.removeBrowserView(view)
            }
        }
        this.updateLayout()
    }

    // 设置分割比例
    setSplitRatio(ratio) {
        if (ratio >= 0.1 && ratio <= 0.9) {
            this.splitRatio = ratio
            this.updateLayout()
        }
    }

    // 销毁视图
    destroy() {
        if (this.topView) {
            this.window.removeBrowserView(this.topView)
            this.topView.webContents.destroy()
        }
    }
}

module.exports = LayoutManager 