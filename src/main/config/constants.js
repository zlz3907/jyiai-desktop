/**
 * @fileoverview 配置模块的常量定义
 * @module config/constants
 */

const path = require('path')

/**
 * 环境类型枚举
 * @enum {string}
 */
const ENV = {
  /** 开发环境 */
  DEV: 'development',
  /** 生产环境 */
  PROD: 'production',
  /** 测试环境 */
  TEST: 'test'
}

/**
 * 获取当前运行环境
 * @returns {string} 当前环境标识
 */
function getCurrentEnv() {
  // 优先使用命令行参数
  if (process.argv.includes('--dev')) return ENV.DEV
  if (process.argv.includes('--prod')) return ENV.PROD
  if (process.argv.includes('--test')) return ENV.TEST
  
  // 其次使用环境变量
  return process.env.NODE_ENV || ENV.PROD
}

// 路径相关常量
const ROOT_DIR = path.resolve(__dirname, '../../..')
const CONFIG_DIR = path.join(ROOT_DIR, '.jyiai')

/**
 * 系统配置文件路径映射
 * @type {Object.<string, string>}
 */
const SYSTEM_CONFIG_PATH = {
  [ENV.DEV]: path.join(CONFIG_DIR, 'system.dev.json'),
  [ENV.PROD]: path.join(CONFIG_DIR, 'system.prod.json'),
  [ENV.TEST]: path.join(CONFIG_DIR, 'system.test.json')
}

/** 用户配置文件路径 */
const USER_CONFIG_PATH = path.join(CONFIG_DIR, 'user.json')

/**
 * 默认系统配置
 * @type {Object}
 */
const DEFAULT_SYSTEM_CONFIG = {
  proxy: {
    enabled: false,
    host: 'localhost',
    port: '7890'
  },
  theme: {
    mode: 'system',
    primary: '#1890ff',
    accent: '#13c2c2'
  },
  language: 'zh-CN',
  autoUpdate: true,
  baseUrl: 'http://localhost:59001'
}

/**
 * 默认用户配置
 * @type {Object}
 */
const DEFAULT_USER_CONFIG = {
  preferences: {},
  customSettings: {}
}

module.exports = {
  ENV,
  getCurrentEnv,
  ROOT_DIR,
  CONFIG_DIR,
  SYSTEM_CONFIG_PATH,
  USER_CONFIG_PATH,
  DEFAULT_SYSTEM_CONFIG,
  DEFAULT_USER_CONFIG
} 