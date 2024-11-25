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
  }
}) 