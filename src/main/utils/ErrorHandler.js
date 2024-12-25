import { app } from 'electron'
import path from 'path'
import fs from 'fs'

class BrowserErrorHandler {
    constructor() {
        // 定义错误类型常量
        this.ErrorTypes = {
            PROXY: {
                CONNECTION_FAILED: 'ERR_PROXY_CONNECTION_FAILED',
                TUNNEL_FAILED: 'ERR_TUNNEL_CONNECTION_FAILED',
                AUTH_FAILED: 'ERR_PROXY_AUTH_FAILED'
            },
            NETWORK: {
                TIMEOUT: 'ERR_CONNECTION_TIMED_OUT',
                REFUSED: 'ERR_CONNECTION_REFUSED',
                RESET: 'ERR_CONNECTION_RESET',
                DNS_FAILED: 'ERR_NAME_NOT_RESOLVED'
            },
            SECURITY: {
                CERT_INVALID: 'ERR_CERT_INVALID',
                CERT_AUTHORITY_INVALID: 'ERR_CERT_AUTHORITY_INVALID',
                SSL_PROTOCOL_ERROR: 'ERR_SSL_PROTOCOL_ERROR'
            },
            CONTENT: {
                FAILED_TO_LOAD: 'ERR_FAILED_TO_LOAD',
                ABORTED: 'ERR_ABORTED',
                FILE_NOT_FOUND: 'ERR_FILE_NOT_FOUND'
            }
        }

        // 初始化日志文件路径
        this.logPath = path.join(app.getPath('userData'), 'logs')
        this.errorLogFile = path.join(this.logPath, 'browser-errors.log')
        this.proxyLogFile = path.join(this.logPath, 'proxy-errors.log')

        // 确保日志目录存在
        this._ensureLogDirectory()
    }

    // 确保日志目录存在
    _ensureLogDirectory() {
        if (!fs.existsSync(this.logPath)) {
            fs.mkdirSync(this.logPath, { recursive: true })
        }
    }

    // 写入日志
    _writeToLog(filePath, logEntry) {
        const timestamp = new Date().toISOString()
        const logLine = `[${timestamp}] ${JSON.stringify(logEntry)}\n`
        
        fs.appendFile(filePath, logLine, (err) => {
            if (err) {
                console.error('Failed to write to log file:', err)
            }
        })
    }

    // 处理代理错误
    handleProxyError(details) {
        const errorEntry = {
            type: 'PROXY_ERROR',
            url: details.url,
            error: details.error,
            statusCode: details.statusCode,
            statusLine: details.statusLine,
            timestamp: new Date().toISOString()
        }

        // 写入代理错误日志
        this._writeToLog(this.proxyLogFile, errorEntry)

        // 返回错误分析结果
        return {
            isProxyError: true,
            errorType: this._categorizeProxyError(details.error),
            details: errorEntry
        }
    }

    // 处理一般浏览器错误
    handleBrowserError(details) {
        const errorEntry = {
            type: 'BROWSER_ERROR',
            url: details.url,
            error: details.error,
            errorCode: details.errorCode,
            errorDescription: details.errorDescription,
            timestamp: new Date().toISOString()
        }

        // 写入浏览器错误日志
        this._writeToLog(this.errorLogFile, errorEntry)

        return {
            isProxyError: false,
            errorType: this._categorizeBrowserError(details.error),
            details: errorEntry
        }
    }

    // 分类代理错误
    _categorizeProxyError(error) {
        if (error.includes(this.ErrorTypes.PROXY.CONNECTION_FAILED)) {
            return 'CONNECTION_FAILED'
        }
        if (error.includes(this.ErrorTypes.PROXY.TUNNEL_FAILED)) {
            return 'TUNNEL_FAILED'
        }
        if (error.includes(this.ErrorTypes.PROXY.AUTH_FAILED)) {
            return 'AUTH_FAILED'
        }
        return 'UNKNOWN_PROXY_ERROR'
    }

    // 分类浏览器错误
    _categorizeBrowserError(error) {
        // 网络错误
        if (error.includes('TIMED_OUT')) return 'TIMEOUT'
        if (error.includes('REFUSED')) return 'CONNECTION_REFUSED'
        if (error.includes('RESET')) return 'CONNECTION_RESET'
        
        // 安全错误
        if (error.includes('CERT_')) return 'CERTIFICATE_ERROR'
        if (error.includes('SSL_')) return 'SSL_ERROR'
        
        // 内容错误
        if (error.includes('FILE_NOT_FOUND')) return 'NOT_FOUND'
        if (error.includes('ABORTED')) return 'ABORTED'
        
        return 'UNKNOWN_ERROR'
    }

    // 获取错误统计
    getErrorStats(timeRange = '24h') {
        try {
            const stats = {
                proxy: {
                    total: 0,
                    byType: {}
                },
                browser: {
                    total: 0,
                    byType: {}
                }
            }

            // 读取并分析日志文件
            const proxyLogs = fs.readFileSync(this.proxyLogFile, 'utf8').split('\n')
            const browserLogs = fs.readFileSync(this.errorLogFile, 'utf8').split('\n')

            const timeLimit = this._getTimeLimit(timeRange)

            // 分析代理错误
            proxyLogs.forEach(line => {
                if (!line) return
                const log = JSON.parse(line.substring(line.indexOf('{')))
                if (new Date(log.timestamp) >= timeLimit) {
                    stats.proxy.total++
                    const errorType = this._categorizeProxyError(log.error)
                    stats.proxy.byType[errorType] = (stats.proxy.byType[errorType] || 0) + 1
                }
            })

            // 分析浏览器错误
            browserLogs.forEach(line => {
                if (!line) return
                const log = JSON.parse(line.substring(line.indexOf('{')))
                if (new Date(log.timestamp) >= timeLimit) {
                    stats.browser.total++
                    const errorType = this._categorizeBrowserError(log.error)
                    stats.browser.byType[errorType] = (stats.browser.byType[errorType] || 0) + 1
                }
            })

            return stats
        } catch (error) {
            console.error('Error getting error stats:', error)
            return null
        }
    }

    // 获取时间范围限制
    _getTimeLimit(timeRange) {
        const now = new Date()
        switch (timeRange) {
            case '1h':
                return new Date(now - 3600000)
            case '24h':
                return new Date(now - 86400000)
            case '7d':
                return new Date(now - 604800000)
            case '30d':
                return new Date(now - 2592000000)
            default:
                return new Date(now - 86400000) // 默认24小时
        }
    }

    // 清理旧日志
    cleanOldLogs(daysToKeep = 30) {
        const timeLimit = new Date()
        timeLimit.setDate(timeLimit.getDate() - daysToKeep)

        const cleanFile = (filePath) => {
            if (!fs.existsSync(filePath)) return

            const logs = fs.readFileSync(filePath, 'utf8')
                .split('\n')
                .filter(line => {
                    if (!line) return false
                    const timestamp = line.match(/\[(.*?)\]/)?.[1]
                    return timestamp && new Date(timestamp) >= timeLimit
                })
                .join('\n')

            fs.writeFileSync(filePath, logs)
        }

        cleanFile(this.errorLogFile)
        cleanFile(this.proxyLogFile)
    }

    // 获取最近的错误
    getRecentErrors(count = 10) {
        try {
            const recentErrors = []

            // 读取两个日志文件的最后几行
            const readRecentLogs = (filePath, type) => {
                if (!fs.existsSync(filePath)) return []
                
                const logs = fs.readFileSync(filePath, 'utf8')
                    .split('\n')
                    .filter(Boolean)
                    .slice(-count)
                    .map(line => {
                        const log = JSON.parse(line.substring(line.indexOf('{')))
                        return { ...log, errorType: type }
                    })

                return logs
            }

            const proxyErrors = readRecentLogs(this.proxyLogFile, 'PROXY')
            const browserErrors = readRecentLogs(this.errorLogFile, 'BROWSER')

            // 合并并按时间排序
            return [...proxyErrors, ...browserErrors]
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, count)

        } catch (error) {
            console.error('Error getting recent errors:', error)
            return []
        }
    }
}

export default new BrowserErrorHandler() 