const path = require('path')
const fs = require('fs')

// 获取项目根目录路径
const ROOT_DIR = path.resolve(__dirname, '../../..')

// 配置目录和文件路径
const CONFIG_DIR = path.join(ROOT_DIR, '.jyiai')
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')

// 默认配置
const defaultConfig = {
    proxy: {
        enabled: false,
        host: 'localhost',
        port: '7890',
        username: '',
        password: ''
    },
    // 其他配置项...
    theme: 'light',
    language: 'zh-CN',
    autoUpdate: true
}

// 确保配置文件存在
function ensureConfig() {
    // 确保配置目录存在
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true })
        console.log('Created config directory at:', CONFIG_DIR)
    }

    // 确保配置文件存在
    if (!fs.existsSync(CONFIG_PATH)) {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2))
        console.log('Created default config at:', CONFIG_PATH)
    }
}

// 加载配置
function loadConfig() {
    try {
        ensureConfig()
        const fileContent = fs.readFileSync(CONFIG_PATH, 'utf8')
        const config = JSON.parse(fileContent)
        
        // 合并默认配置，确保所有必要的字段都存在
        const mergedConfig = {
            ...defaultConfig,
            ...config,
            proxy: {
                ...defaultConfig.proxy,
                ...(config.proxy || {})
            }
        }
        
        return mergedConfig
    } catch (error) {
        console.error('Failed to load config:', error)
        // 如果出错，返回默认配置
        return defaultConfig
    }
}

// 保存配置
function saveConfig(config) {
    try {
        ensureConfig()
        const mergedConfig = {
            ...loadConfig(),  // 加载现有配置
            ...config,        // 合并新配置
            proxy: {
                ...loadConfig().proxy,  // 保留现有代理配置
                ...(config.proxy || {}) // 合并新的代理配置
            }
        }
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(mergedConfig, null, 2))
        console.log('Config saved successfully')
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