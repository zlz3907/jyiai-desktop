const { BrowserWindow, session } = require('electron')
const path = require('path')

class BrowserWindowManager {
  constructor(proxyConfig) {
    this.proxyConfig = proxyConfig
    this.windows = new Set()
  }

  async setupWindowProxy() {
    try {
      const { host, port, username, password } = this.proxyConfig
      
      // 创建新的session
      const windowSession = session.fromPartition(`persist:window-${Date.now()}`)
      
      // 将认证信息直接放在代理URL中
      const proxyUrl = `http://${username}:${password}@${host}:${port}`
      console.log('正在设置代理:', proxyUrl.replace(/:\/\/.*:.*@/, '://***:***@'))
      
      // 设置代理配置
      await windowSession.setProxy({
        proxyRules: proxyUrl,
        proxyBypassRules: '<local>'
      })

      // 监听响应
      windowSession.webRequest.onResponseStarted((details) => {
        console.log('收到响应:', {
          url: details.url,
          statusCode: details.statusCode,
          statusLine: details.statusLine,
          ip: details.ip
        })
      })

      // 监听错误
      windowSession.webRequest.onErrorOccurred((details) => {
        console.error('代理请求错误:', {
          url: details.url,
          error: details.error,
          fromCache: details.fromCache,
          statusCode: details.statusCode,
          ip: details.ip
        })
      })

      console.log('代理设置成功')
      return windowSession
    } catch (error) {
      console.error('设置窗口代理失败:', error)
      return null
    }
  }

  async createWindow(options) {
    try {
      // 如果需要代理，先设置session
      const windowSession = options.useProxy 
        ? await this.setupWindowProxy()
        : null

      if (options.useProxy && !windowSession) {
        throw new Error('代理设置失败')
      }

      const win = new BrowserWindow({
        width: options.width || 1024,
        height: options.height || 768,
        title: options.title || '新窗口',
        modal: options.modal || false,
        frame: options.frame !== false,
        resizable: options.resizable !== false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: true,
        }
      })

      this.windows.add(win)

      win.on('closed', () => {
        this.windows.delete(win)
      })

      // 监听加载错误，但忽略 ERR_ABORTED
      win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        // 忽略 ERR_ABORTED 错误
        if (errorCode === -3) {
          console.log('页面加载中断，但可能已经正常显示')
          return
        }

        console.error('页面加载失败:', {
          url: options.url,
          errorCode,
          errorDescription
        })
      })

      // 设置 CSP
      win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
            ]
          }
        })
      })

      console.log('正在加载URL:', options.url)
      try {
        await win.loadURL(options.url)
        console.log('URL加载完成')
        return { success: true }
      } catch (error) {
        // 如果是 ERR_ABORTED 错误，且窗口已经显示内容，则认为是成功的
        if (error.code === 'ERR_ABORTED' && win.webContents.getURL() === options.url) {
          console.log('页面已正常显示，忽略加载中断错误')
          return { success: true }
        }
        throw error
      }
    } catch (error) {
      console.error('创建窗口失败:', error)
      return { success: false, error: error.message }
    }
  }
}

module.exports = { BrowserWindowManager }