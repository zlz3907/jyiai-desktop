import { ipcMain } from 'electron'

export function setupNavigationHandlers(tabManager) {
    ipcMain.handle('navigate-back', () => {
        const activeTab = tabManager.tabs.get(tabManager.activeTabId)
        if (activeTab?.webContents.canGoBack()) {
            activeTab.webContents.goBack()
        }
    })

    ipcMain.handle('navigate-forward', () => {
        const activeTab = tabManager.tabs.get(tabManager.activeTabId)
        if (activeTab?.webContents.canGoForward()) {
            activeTab.webContents.goForward()
        }
    })

    ipcMain.handle('navigate-reload', () => {
        const activeTab = tabManager.tabs.get(tabManager.activeTabId)
        if (activeTab) {
            activeTab.webContents.reload()
        }
    })

    ipcMain.handle('navigate-to-url', (event, url) => {
        const activeTab = tabManager.tabs.get(tabManager.activeTabId)
        if (activeTab) {
            activeTab.webContents.loadURL(url)
        }
    })
} 