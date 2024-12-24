/**
 * @fileoverview 系统配置管理类
 * @module config/SystemConfig
 */

const fs = require('fs')
const axios = require('axios')
const { 
  ENV,
  getCurrentEnv,
  SYSTEM_CONFIG_PATH, 
  DEFAULT_SYSTEM_CONFIG 
} = require('./constants')

/**
 * 系统配置管理类
 * @class
 */
class SystemConfig {
  /**
   * 创建系统配置实例
   * @constructor
   */
  constructor() {
    this.config = DEFAULT_SYSTEM_CONFIG
    this.configApiUrl = null
    this.env = getCurrentEnv()
  }

  /**
   * 初始化配置
   * @param {Object} options - 初始化选项
   * @param {string} [options.env] - 运行环境
   * @param {string} [options.configApiUrl] - 配置API地址
   * @returns {Promise<void>}
   */
  initialize(options = {}) {
    const {
      env = this.env,
      configApiUrl = null
    } = options

    this.env = env
    this.configApiUrl = configApiUrl
    
    if (this.configApiUrl) {
      return this.loadFromApi()
        .catch(error => {
          console.error('Failed to load config from API:', error)
          return this.loadFromFile()
        })
    }
    
    return this.loadFromFile()
  }

  /**
   * 从API加载配置
   * @private
   * @returns {Promise<void>}
   */
  loadFromApi() {
    return axios.get(this.configApiUrl)
      .then(response => {
        this.config = {
          ...DEFAULT_SYSTEM_CONFIG,
          ...response.data
        }
      })
      .catch(error => {
        throw new Error(`Failed to fetch config from API: ${error.message}`)
      })
  }

  /**
   * 从文件加载配置
   * @private
   * @returns {Promise<void>}
   */
  loadFromFile() {
    return new Promise((resolve, reject) => {
      const configPath = SYSTEM_CONFIG_PATH[this.env]
      
      try {
        if (fs.existsSync(configPath)) {
          const fileContent = fs.readFileSync(configPath, 'utf8')
          this.config = {
            ...DEFAULT_SYSTEM_CONFIG,
            ...JSON.parse(fileContent)
          }
          console.log(`Loaded ${this.env} configuration from: ${configPath}`)
          resolve()
        } else {
          console.log(`No configuration file found for ${this.env}, creating default config`)
          this.saveToFile().then(resolve).catch(reject)
        }
      } catch (error) {
        reject(new Error(`Failed to load config from file: ${error.message}`))
      }
    })
  }

  /**
   * 保存配置到文件
   * @private
   * @returns {Promise<void>}
   */
  saveToFile() {
    return new Promise((resolve, reject) => {
      const configPath = SYSTEM_CONFIG_PATH[this.env]
      try {
        fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2))
        resolve()
      } catch (error) {
        reject(new Error(`Failed to save config to file: ${error.message}`))
      }
    })
  }

  /**
   * 获取配置值
   * @param {string} [key] - 配置键名
   * @returns {*} 配置值
   */
  get(key) {
    return key ? this.config[key] : this.config
  }

  /**
   * 获取代理配置
   * @returns {Object} 代理配置对象
   */
  getProxy() {
    return this.config.proxy
  }

  /**
   * 获取当前环境
   * @returns {string} 环境标识
   */
  getEnv() {
    return this.env
  }

  /**
   * 判断是否为开发环境
   * @returns {boolean}
   */
  isDev() {
    return this.env === ENV.DEV
  }

  /**
   * 判断是否为生产环境
   * @returns {boolean}
   */
  isProd() {
    return this.env === ENV.PROD
  }
}

module.exports = SystemConfig 