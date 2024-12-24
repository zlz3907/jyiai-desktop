const { session } = require('electron')
const path = require('path')
const { SessionConfig } = require('./constants')

class SessionManager {
    createSession(useProxy = false) {
        const sessionId = `persist:tab_${useProxy ? 'proxy' : 'default'}`
        const customSession = session.fromPartition(sessionId)
        
        // 配置 session（只在第一次创建时需要）
        if (!customSession._configured) {
            this._configureSession(customSession)
            customSession._configured = true
        }
        
        return customSession
    }

    _configureSession(customSession) {
        // 基本配置
        customSession.setUserAgent(SessionConfig.USER_AGENT)

        // 设置权限处理
        customSession.setPermissionRequestHandler((webContents, permission, callback) => {
            callback(SessionConfig.ALLOWED_PERMISSIONS.includes(permission))
        })

        // 开发环境配置
        if (process.env.NODE_ENV === 'development') {
            this._configureDevSession(customSession)
        }

        // 配置本地资源访问
        this._configureLocalResources(customSession)
    }

    _configureDevSession(customSession) {
        customSession.setPermissionRequestHandler((webContents, permission, callback) => {
            console.log('Permission requested:', permission)
            callback(true)
        })
    }

    _configureLocalResources(customSession) {
        // 本地资源请求处理
        customSession.webRequest.onBeforeRequest((details, callback) => {
            // 允许 devtools 请求通过
            if (details.url.startsWith('devtools://')) {
                callback({})
                return
            }

            try {
                const url = new URL(details.url)
                // 只处理 localhost 请求
                if (url.hostname === 'localhost') {
                    callback({})
                } else {
                    callback({ cancel: false })
                }
            } catch (error) {
                // 如果 URL 解析失败，允许请求通过
                callback({ cancel: false })
            }
        })

        // 响应头配置
        customSession.webRequest.onHeadersReceived((details, callback) => {
            const responseHeaders = this._getConfiguredHeaders(details)
            callback({ responseHeaders })
        })

        // 注册本地资源协议
        customSession.protocol.registerFileProtocol('local-resource', (request, callback) => {
            const url = request.url.substr(15)
            callback({ path: path.normalize(`${__dirname}/../../../${url}`) })
        })
    }

    _getConfiguredHeaders(details) {
        const headers = {...details.responseHeaders}
        try {
            const url = new URL(details.url)
            if (url.hostname === 'localhost') {
                headers['Cache-Control'] = ['public, max-age=31536000']
                headers['Access-Control-Allow-Origin'] = ['*']
            }
            
            if (details.resourceType === 'image' || details.resourceType === 'font') {
                headers['Access-Control-Allow-Origin'] = ['*']
                headers['Access-Control-Allow-Headers'] = ['*']
                headers['Access-Control-Allow-Methods'] = ['GET']
            }
        } catch (error) {
            console.error('Error processing headers:', error)
        }
        return headers
    }

    dispose() {
        
    }
}

module.exports = new SessionManager() 