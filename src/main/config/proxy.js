/**
 * @fileoverview 代理配置管理模块
 * @module config/proxy
 */

import { getSystemConfig } from './index.js'

/**
 * 获取代理配置
 * @returns {Object} 代理配置对象
 */
export function getProxyConfig() {
    const systemConfig = getSystemConfig()
    return systemConfig.getProxy()
}

export default { 
    getProxyConfig,
    // 为了兼容性保留原来的导出
    get proxyConfig() {
        return getProxyConfig()
    }
} 