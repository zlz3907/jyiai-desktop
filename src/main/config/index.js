const path = require('path')
const fs = require('fs')
const os = require('os')

// 配置文件路径
const CONFIG_PATH = path.join(os.homedir(), '.jyiai', 'config.json')

// 默认配置
const defaultConfig = {
    proxy: {
        enabled: false,
        host: '',
        port: '',
        username: '',
        password: ''
    },
    // 其他配置项...
    theme: 'light',
    language: 'zh-CN',
    autoUpdate: true
}

// 确保配置目录存在
function ensureConfigDir() {
    const configDir = path.dirname(CONFIG_PATH)
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
    }
}

// 加载配置
function loadConfig() {
    try {
        ensureConfigDir()
        if (fs.existsSync(CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
            return { ...defaultConfig, ...config }
        }
        // 如果配置文件不存在，创建默认配置
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2))
        return defaultConfig
    } catch (error) {
        console.error('Failed to load config:', error)
        return defaultConfig
    }
}

// 保存配置
function saveConfig(config) {
    try {
        ensureConfigDir()
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
        return true
    } catch (error) {
        console.error('Failed to save config:', error)
        return false
    }
}

// 更新配置
function updateConfig(partialConfig) {
    const config = loadConfig()
    const newConfig = {
        ...config,
        ...partialConfig,
        proxy: {
            ...config.proxy,
            ...(partialConfig.proxy || {})
        }
    }
    return saveConfig(newConfig)
}

module.exports = {
    loadConfig,
    saveConfig,
    updateConfig,
    CONFIG_PATH
} 