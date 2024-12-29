import { session } from 'electron'
import path from 'path'
import { SessionConfig } from './constants.js'

// CSP 配置
const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:",
    "style-src 'self' 'unsafe-inline' https: http: data:",
    "style-src-elem 'self' 'unsafe-inline' https: http: data:",
    "img-src 'self' data: https: http: blob:",
    "connect-src 'self' https: http: ws: wss: data: blob:",
    "font-src 'self' data: https: http:",
    "object-src 'none'",
    "media-src 'self' https: http: blob:",
    "frame-src 'self' https: http:",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "base-uri 'self'"
].join('; ')

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

        // 设置 Content Security Policy
        customSession.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': CONTENT_SECURITY_POLICY
                }
            })
        })

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

export default new SessionManager() 