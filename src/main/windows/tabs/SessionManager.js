const { session } = require('electron')
const path = require('path')
const { SessionConfig } = require('./constants')

class SessionManager {
    constructor() {
        this.sessions = new Map()
    }

    createSession(useProxy = false) {
        const sessionId = `persist:tab_${useProxy ? 'proxy' : 'default'}`
        if (this.sessions.has(sessionId)) {
            return this.sessions.get(sessionId)
        }

        const customSession = session.fromPartition(sessionId)
        this._configureSession(customSession)
        this.sessions.set(sessionId, customSession)
        return customSession
    }

    _configureSession(customSession) {
        // 基本配置
        customSession.setUserAgent(SessionConfig.USER_AGENT)

        // 开发环境配置
        if (process.env.NODE_ENV === 'development') {
            this._configureDevSession(customSession)
        }

        // 配置本地资源访问
        this._configureLocalResources(customSession)

        // 配置权限
        this._configurePermissions(customSession)
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
            const url = new URL(details.url)
            callback({ cancel: url.hostname !== 'localhost' })
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

    _configurePermissions(customSession) {
        customSession.setPermissionRequestHandler((webContents, permission, callback) => {
            callback(SessionConfig.ALLOWED_PERMISSIONS.includes(permission))
        })
    }

    clearSession(sessionId) {
        const customSession = this.sessions.get(sessionId)
        if (customSession) {
            customSession.clearCache()
            customSession.clearStorageData()
        }
    }

    dispose() {
        this.sessions.clear()
    }
}

module.exports = new SessionManager() 