/**
 * @fileoverview 配置模块的常量定义
 * @module config/constants
 */

import path from 'path'
import { fileURLToPath } from 'url'

// 获取 __dirname 等价物
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 环境类型枚举
 * @enum {string}
 */
export const ENV = {
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
export function getCurrentEnv() {
  // 优先使用命令行参数
  if (process.argv.includes('--dev')) return ENV.DEV
  if (process.argv.includes('--prod')) return ENV.PROD
  if (process.argv.includes('--test')) return ENV.TEST
  
  // 其次使用环境变量
  return process.env.NODE_ENV || ENV.PROD
}

// 路径相关常量
export const ROOT_DIR = path.resolve(__dirname, '../../..')
export const CONFIG_DIR = path.join(ROOT_DIR, '.jyiai')

/**
 * 系统配置文件路径映射
 * @type {Object.<string, string>}
 */
export const SYSTEM_CONFIG_PATH = {
  [ENV.DEV]: path.join(CONFIG_DIR, 'system.dev.json'),
  [ENV.PROD]: path.join(CONFIG_DIR, 'system.prod.json'),
  [ENV.TEST]: path.join(CONFIG_DIR, 'system.test.json')
}

/** 用户配置文件路径 */
export const USER_CONFIG_PATH = path.join(CONFIG_DIR, 'user.json')

/**
 * 默认系统配置
 * @type {Object}
 */
export const DEFAULT_SYSTEM_CONFIG = {
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
export const DEFAULT_USER_CONFIG = {
  preferences: {},
  customSettings: {}
} 