const { contextBridge, ipcRenderer } = require('electron')

// 定义SDK版本
const SDK_VERSION = '1.0.0'

// 暴露安全的API到渲染进程
contextBridge.exposeInMainWorld('jyiaiSDK', {
  // 基础信息
  version: SDK_VERSION,
  
  // 窗口管理
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

  // 浏览器功能 (原 browser 对象的内容)
  browser: {
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
      // console.log('onTabLoading 注册了吗？')
      ipcRenderer.on('tab-loading', (event, data) => callback(data))
    },

    // 菜单
    showTabsMenu: (x, y, menuUrl) => ipcRenderer.invoke('show-tabs-menu', { x, y, menuUrl }),
    closeTabsMenu: () => ipcRenderer.send('menu-close'),
    onMenuData: (callback) => {
      ipcRenderer.on('init-menu-data', (event, data) => callback(data))
    },

    // 向topView发送标签管理的相关指令
    sendTabCommand: (command) => ipcRenderer.send('tab-command', command),
    onTabCommand: (callback) => {
      ipcRenderer.on('tab-command', (event, command) => callback(command))
    }
  }
}) 
