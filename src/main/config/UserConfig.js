const fs = require('fs')
const { 
  USER_CONFIG_PATH, 
  DEFAULT_USER_CONFIG 
} = require('./constants')

class UserConfig {
  constructor() {
    this.config = DEFAULT_USER_CONFIG
  }

  async initialize() {
    await this.loadFromFile()
  }

  async loadFromFile() {
    try {
      if (fs.existsSync(USER_CONFIG_PATH)) {
        const fileContent = fs.readFileSync(USER_CONFIG_PATH, 'utf8')
        this.config = {
          ...DEFAULT_USER_CONFIG,
          ...JSON.parse(fileContent)
        }
      } else {
        // 如果配置文件不存在，创建默认配置
        await this.saveToFile()
      }
    } catch (error) {
      throw new Error(`Failed to load user config: ${error.message}`)
    }
  }

  async saveToFile() {
    try {
      fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(this.config, null, 2))
    } catch (error) {
      throw new Error(`Failed to save user config: ${error.message}`)
    }
  }

  get(key) {
    return key ? this.config[key] : this.config
  }

  async update(partialConfig) {
    this.config = {
      ...this.config,
      ...partialConfig
    }
    await this.saveToFile()
  }
}

module.exports = UserConfig 