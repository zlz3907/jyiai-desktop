const { getSystemConfig } = require('../../config')

class ProxyManager {
    constructor() {
        this.proxyConfigs = new Map()
    }

    getProxyConfig() {
        try {
            const config = getSystemConfig().getProxy()
            return {
                enabled: true,
                host: config.host || 'localhost',
                port: config.port || '7890',
                username: config.username || '',
                password: config.password || '',
                ...config
            }
        } catch (error) {
            console.warn('Failed to get proxy config:', error)
            return {
                enabled: false,
                host: 'localhost',
                port: '7890',
                username: '',
                password: ''
            }
        }
    }

    configureProxy(session) {
        const proxyConfig = this.getProxyConfig()
        if (!proxyConfig.enabled) {
            console.log('Proxy is disabled')
            return
        }

        const proxySettings = {
            mode: 'fixed_servers',
            proxyRules: `http://${proxyConfig.host}:${proxyConfig.port}`,
            proxyBypassRules: '<local>;localhost;127.0.0.1;*.local'
        }

        this._setupProxyAuth(session, proxyConfig)
        this._applyProxySettings(session, proxySettings)
    }

    _setupProxyAuth(session, proxyConfig) {
        session.webRequest.onBeforeSendHeaders((details, callback) => {
            const headers = {...details.requestHeaders}
            if (proxyConfig.username && proxyConfig.password) {
                const auth = Buffer.from(`${proxyConfig.username}:${proxyConfig.password}`).toString('base64')
                headers['Proxy-Authorization'] = `Basic ${auth}`
            }
            callback({ requestHeaders: headers })
        })
    }

    _applyProxySettings(session, proxySettings) {
        session.setProxy(proxySettings)
            .then(() => console.log('Proxy configured successfully'))
            .catch(err => console.error('Failed to set proxy:', err))
    }
}

module.exports = new ProxyManager() 