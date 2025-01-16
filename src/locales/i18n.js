import i18next from 'i18next'
import Backend from 'i18next-fs-backend'
import path from 'path'
import { fileURLToPath } from 'url'

// 获取 __dirname 的等价物
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class I18nConfiguration {
  static init(callback) {
    i18next
      .use(Backend)
      .init({
        backend: {
          loadPath: path.join(__dirname, '{{lng}}/{{ns}}.json')
        },
        lng: 'zh', // 默认语言
        fallbackLng: 'en',
        ns: ['app', 'menu'], // 使用的命名空间
        defaultNS: 'app' // 默认命名空间
      }, (err, t) => {
        if (err) {
          console.error('i18next init failed:', err)
        } else {
          console.log('i18next initialized successfully')
          if (callback) callback(i18next)
        }
      })
  }

  static changeLanguage(lng, callback) {
    i18next.changeLanguage(lng, (err, t) => {
      if (err) {
        console.error('Failed to change language:', err)
      } else {
        console.log('Language changed to:', lng)
        if (callback) callback(i18next)
      }
    })
  }
}

export default I18nConfiguration