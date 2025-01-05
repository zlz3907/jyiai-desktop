import { ipcMain } from 'electron'

export function setupTabHandlers(tabManager) {
    ipcMain.handle('create-tab', (event, url, options = {}) => {
        return tabManager.createTab(url, options)
    })

    ipcMain.handle('switch-tab', (event, tabId) => {
        tabManager.switchTab(tabId)
    })

    ipcMain.handle('close-tab', (event, tabId) => {
        tabManager.closeTab(tabId)
    })

    ipcMain.handle('get-tab-info', (event, tabId) => {
        return tabManager.stateManager.getState(tabId)
    })

    ipcMain.handle('show-tabs-menu', (event, { postion, menuUrl, payload }) => {
        if (!menuUrl) {
            console.error('Menu URL is required')
            return Promise.reject(new Error('Menu URL is required'))
        }
        return tabManager.createTabsMenu(postion, menuUrl, payload)
    })

    ipcMain.on('menu-close', () => {
        if (tabManager.menuView) {
            tabManager.closeTabsMenu()
        }
    })

    ipcMain.on('tab-command', (event, command) => {
        tabManager.topView.webContents.send('tab-command', command)
    })
} 