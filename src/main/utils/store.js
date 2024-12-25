import Store from 'electron-store'

const store = new Store()

// 导出存储实例和常用方法
export default {
  store,
  
  // 设置数据
  setItem(key, value) {
    store.set(key, value)
  },

  // 获取数据
  getItem(key) {
    return store.get(key)
  },

  // 删除数据
  removeItem(key) {
    store.delete(key)
  },

  // 清空所有数据
  clear() {
    store.clear()
  }
} 