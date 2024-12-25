const { session } = require('electron')
const path = require('path')
const { SessionConfig } = require('./constants')

class SessionManager {
    createSession(useProxy = false) {
        const sessionId = `persist:tab_${useProxy ? 'proxy' : 'default'}`
        const customSession = session.fromPartition(sessionId)
        
        // 只配置基本必需的设置
        if (!customSession._configured) {
            this._configureSession(customSession)
            customSession._configured = true
        }
        
        return customSession
    }

    _configureSession(customSession) {
        // 基本配置
        customSession.setUserAgent(SessionConfig.USER_AGENT)

        // 配置默认权限
        customSession.setPermissionRequestHandler((webContents, permission, callback) => {
            callback(true)  // 允许所有权限
        })

        // 配置 Content-Security-Policy
        // customSession.webRequest.onHeadersReceived((details, callback) => {
        //     callback({
        //         responseHeaders: {
        //             ...details.responseHeaders,
        //             'Access-Control-Allow-Origin': ['*'],
        //             'Access-Control-Allow-Methods': ['*'],
        //             'Access-Control-Allow-Headers': ['*']
        //         }
        //     })
        // })

        // 配置代理规则
        if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
            customSession.setProxy({
                proxyRules: process.env.HTTP_PROXY || process.env.HTTPS_PROXY,
                proxyBypassRules: 'localhost,127.0.0.1'
            })
        }

        // 注册本地资源协议
        customSession.protocol.registerFileProtocol('local-resource', (request, callback) => {
            const url = request.url.substr(15)
            callback({ path: path.normalize(`${__dirname}/../../../${url}`) })
        })
    }

    dispose() {
        // 清理资源
    }
}

module.exports = new SessionManager() 