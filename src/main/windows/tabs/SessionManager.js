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
    // 特殊网站的配置
    static SPECIAL_SITES = {
        'whatsapp.com': {
            removeCSP: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
            headers: {
                'Accept-Language': 'en-US,en;q=0.9',
                'Sec-CH-UA': '"Not A(Brand";v="99", "Google Chrome";v="116", "Chromium";v="116"',
                'Sec-CH-UA-Mobile': '?0',
                'Sec-CH-UA-Platform': '"Windows"'
            }
        }
    }

    /**
     * 处理特殊网站的请求头和响应
     * @param {string} url - 请求URL
     * @param {Object} headers - 请求头或响应头
     * @returns {Object} 处理后的头部
     */
    _handleSpecialSites(url, headers) {
        // 获取域名
        let hostname
        try {
            hostname = new URL(url).hostname
        } catch (e) {
            return headers
        }

        // 查找匹配的特殊网站配置
        const siteConfig = Object.entries(SessionManager.SPECIAL_SITES)
            .find(([domain]) => hostname.indexOf(domain) !== -1)?.[1]

        if (!siteConfig) {
            return headers
        }

        // 应用特殊网站的配置
        const modifiedHeaders = { ...headers }

        if (siteConfig.removeCSP) {
            delete modifiedHeaders['content-security-policy']
            delete modifiedHeaders['Content-Security-Policy']
        }

        if (siteConfig.removeBrowserVersion) {
            // 处理逻辑
        }

        if (siteConfig.headers) {
            Object.assign(modifiedHeaders, siteConfig.headers)
        }

        return modifiedHeaders
    }

    createSession(url, options) {
        const sessionId = `persist:tab_${options.useProxy ? 'proxy' : 'default'}`
        const customSession = session.fromPartition(sessionId)
        
        // 只配置基本必需的设置
        if (!customSession._configured) {
            this._configureSession(url, customSession)
            customSession._configured = true
        }
        
        return customSession
    }

    _configureSession(url, customSession) {
        try {
            const hostname = new URL(url).hostname
            const siteConfig = Object.entries(SessionManager.SPECIAL_SITES)
                .find(([domain]) => hostname.indexOf(domain) !== -1)?.[1]
            
            if (siteConfig?.userAgent) {
                customSession.setUserAgent(siteConfig.userAgent)
            }
        } catch (e) {
            console.warn('Invalid URL:', url)
        }

        customSession.webRequest.onBeforeSendHeaders((details, callback) => {
            const modifiedHeaders = this._handleSpecialSites(details.url, details.requestHeaders)
            // delete modifiedHeaders['electron-version']
            callback({ requestHeaders: modifiedHeaders })
        })

        customSession.webRequest.onHeadersReceived((details, callback) => {
            const responseHeaders = this._handleSpecialSites(details.url, details.responseHeaders)
            callback({ responseHeaders })
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