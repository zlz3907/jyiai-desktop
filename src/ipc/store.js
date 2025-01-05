import { ipcMain } from 'electron'
import store from '../main/utils/store.js'

export function setupStoreHandlers() {
    ipcMain.handle('store:set', async (event, key, value) => {
        store.setItem(key, value)
    })
    ipcMain.handle('store:get', async (event, key) => {
        return store.getItem(key)
    })

    ipcMain.handle('store:remove', async (event, key) => {
        store.removeItem(key)
    })

    ipcMain.handle('store:clear', async () => {
        store.clear()
    })
} 