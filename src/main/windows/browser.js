const { BrowserWindow } = require('electron')
const path = require('path')
const { getSystemConfig } = require('../config')

class BrowserWindowManager {
  constructor() {
    this.windows = new Set()
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

  createWindow(options) {
    try {
      const windowOptions = {
        width: options.width || 1024,
        height: options.height || 768,
        title: options.title || '新窗口',
        modal: options.modal || false,
        frame: options.frame !== false,
        resizable: options.resizable !== false,
        webPreferences: {
          nodeIntegration: true,
          // partition: 'persist:proxy',
          // contextIsolation: false,
          // session,
          // enableRemoteModule: true,
          webSecurity: true,
          // allowRunningInsecureContent: true
        }
      }

      if (options.useProxy) {
        const proxyConfig = this.getProxyConfig()
        windowOptions.webPreferences.proxy = {
          mode: 'fixed_servers',
          proxyRules: `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`
        }
      }

      console.log('windowOptions', windowOptions)
      const win = new BrowserWindow(windowOptions)

      // 如果需要调试
      if (process.argv.includes('--inspect')) {
        win.webContents.openDevTools()
      }

      win.on('closed', () => {
        this.windows.delete(win)
      })

      win.loadURL(options.url).then(() => {
        console.log('窗口加载完成')
      }).catch(err => {
        console.error('窗口加载失败:', err)
      })

    } catch (error) {
      console.error('创建窗口失败:', error)
    }
  }
}

module.exports = { BrowserWindowManager }