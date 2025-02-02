const { contextBridge, ipcRenderer } = require('electron')

// 定义SDK版本
const SDK_VERSION = '1.0.0'

// 按需加载模块
const loadExcel = () => {
    return require('xlsx')
}

// Excel 功能
const excel = {
    readFile: (file) => {
        const XLSX = loadExcel()
        return XLSX.readFile(file)
    },
}

// 暴露安全的API到渲染进程
contextBridge.exposeInMainWorld('jyiaiSDK', {
    // 基础信息
    version: SDK_VERSION,
    excel,
    
    // 存储功能
    store: {
        setItem: (key, value) => ipcRenderer.invoke('store:set', key, value),
        getItem: (key) => ipcRenderer.invoke('store:get', key),
        removeItem: (key) => ipcRenderer.invoke('store:remove', key),
        clear: () => ipcRenderer.invoke('store:clear')
    },

    // 窗口管理，测试用，正式版不要使用
    window: {
        openUrl: (url, options = {}) => {
            return ipcRenderer.invoke('window:openUrl', {
                url,
                width: options.width || 800,
                height: options.height || 600,
                title: options.title || '新窗口',
                modal: options.modal || false,
                frame: options.frame !== false,
                resizable: options.resizable !== false,
                useProxy: options.useProxy || false
            })
        }
    },

    // 系统信息
    system: {
        platform: process.platform,
        arch: process.arch,
        versions: {
            electron: process.versions.electron,
            chrome: process.versions.chrome,
            node: process.versions.node
        }
    },

    // 浏览器功能
    browser: {
        openUrl: (url, options = {}) => ipcRenderer.invoke('open-url', url, options),
        
        // 标签页操作
        createTab: (url, options = {}) => ipcRenderer.invoke('create-tab', url, options),
        switchTab: (tabId) => ipcRenderer.invoke('switch-tab', tabId),
        closeTab: (tabId) => ipcRenderer.invoke('close-tab', tabId),
        
        // 导航操作
        goBack: () => ipcRenderer.invoke('navigate-back'),
        goForward: () => ipcRenderer.invoke('navigate-forward'),
        reload: () => ipcRenderer.invoke('navigate-reload'),
        navigateToUrl: (url) => ipcRenderer.invoke('navigate-to-url', url),

        // 事件监听
        onIPCMsg: (callback) => {
            ipcRenderer.on('ipc-msg', (event, data) => callback(data))
        },
        onTabStateChanged: (callback) => {
            ipcRenderer.on('tab-state-changed', (event, data) => callback(data))
        },
        
        onTabTitleUpdated: (callback) => {
            ipcRenderer.on('tab-title-updated', (event, data) => callback(data))
        },
        onTabUrlUpdated: (callback) => {
            ipcRenderer.on('tab-url-updated', (event, data) => callback(data))
        },
        onTabLoading: (callback) => {
            ipcRenderer.on('tab-loading', (event, data) => callback(data))
        },

        // 菜单
        showTabsMenu: (postion, menuUrl, payload) => ipcRenderer.invoke('show-tabs-menu', { postion, menuUrl, payload }),
        closeTabsMenu: () => ipcRenderer.send('menu-close'),
        onMenuData: (callback) => {
            ipcRenderer.on('init-menu-data', (event, data) => callback(data))
        },

        // 向topView发送标签管理的相关指令
        sendTabCommand: (command) => ipcRenderer.send('tab-command', command),
        onTabCommand: (callback) => {
            ipcRenderer.on('tab-command', (event, command) => callback(command))
        }
    },

    // 侧边栏功能
    sidebar: {
        show: (url, options = {}) => ipcRenderer.invoke('popup:show', { url, options }),
        close: () => ipcRenderer.invoke('popup:close'),
        resize: (width) => ipcRenderer.invoke('popup:resize', { width })
    },

    // 弹出菜单
    popup: {
        show: (url, options = {}) => ipcRenderer.invoke('popup:show', { url, options }),
        close: () => ipcRenderer.invoke('popup:close'),
        resize: (width) => ipcRenderer.invoke('popup:resize', { width })
    }
}) 
