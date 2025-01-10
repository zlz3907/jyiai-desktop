import { ipcMain } from 'electron'
import store from '../main/utils/store.js'

export function setupStoreHandlers() {
    ipcMain.handle('store:set', (event, key, value) => {
        store.setItem(key, value)
    })
    ipcMain.handle('store:get', (event, key) => {
        return store.getItem(key)
    })

    ipcMain.handle('store:remove', (event, key) => {
        store.removeItem(key)
    })

    ipcMain.handle('store:clear', () => {
        store.clear()
    })
} 