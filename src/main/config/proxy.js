const { loadConfig } = require('./index')

// 获取代理配置
function getProxyConfig() {
    const config = loadConfig()
    return config.proxy
}

module.exports = { 
    getProxyConfig,
    // 为了兼容性保留原来的导出
    get proxyConfig() {
        return getProxyConfig()
    }
} 