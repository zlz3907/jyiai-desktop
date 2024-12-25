/**
 * @fileoverview 配置加载器
 * @module config/ConfigLoader
 */

import SystemConfig from './SystemConfig.js'
import UserConfig from './UserConfig.js'

/**
 * 配置加载器类
 * @class
 */
export default class ConfigLoader {
  constructor() {
    this.systemConfig = new SystemConfig()
    this.userConfig = new UserConfig()
  }

  /**
   * 初始化配置
   * @param {Object} options - 初始化选项
   * @returns {Promise<void>}
   */
  initialize(options = {}) {
    return Promise.all([
      this.systemConfig.initialize(options),
      this.userConfig.initialize()
    ])
  }

  /**
   * 获取系统配置
   * @returns {SystemConfig}
   */
  getSystemConfig() {
    return this.systemConfig
  }

  /**
   * 获取用户配置
   * @returns {UserConfig}
   */
  getUserConfig() {
    return this.userConfig
  }
} 