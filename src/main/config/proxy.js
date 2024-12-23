/**
 * @fileoverview 代理配置管理模块
 * @module config/proxy
 */

const { getSystemConfig } = require('./index')

/**
 * 获取代理配置
 * @returns {Object} 代理配置对象
 */
function getProxyConfig() {
    const systemConfig = getSystemConfig()
    return systemConfig.getProxy()
}

module.exports = { 
    getProxyConfig,
    // 为了兼容性保留原来的导出
    get proxyConfig() {
        return getProxyConfig()
    }
} 