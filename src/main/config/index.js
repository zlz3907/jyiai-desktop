/**
 * @fileoverview 配置模块入口
 * @module config
 */

import ConfigLoader from './ConfigLoader.js'

/**
 * 配置加载器单例
 * @type {ConfigLoader}
 */
let configLoader = null

/**
 * 获取或创建配置加载器实例
 * @param {Object} [options] - 初始化选项
 * @returns {Promise<ConfigLoader>}
 */
export function getConfigLoader(options = {}) {
  if (!configLoader) {
    configLoader = new ConfigLoader()
    return configLoader.initialize(options)
      .then(() => configLoader)
      .catch(error => {
        configLoader = null
        throw error
      })
  }
  return Promise.resolve(configLoader)
}

/**
 * 获取系统配置
 * @returns {SystemConfig}
 */
export function getSystemConfig() {
  if (!configLoader) {
    throw new Error('Config loader not ready')
  }
  return configLoader.getSystemConfig()
}

/**
 * 获取用户配置
 * @returns {UserConfig}
 */
export function getUserConfig() {
  if (!configLoader) {
    throw new Error('Config loader not ready')
  }
  return configLoader.getUserConfig()
} 