import { ipcMain } from 'electron'

export function setupSidebarHandlers(tabManager) {
    // 显示侧边栏
    ipcMain.handle('sidebar:show', (event, { url, options }) => {
        console.log('sidebar:show', url, options)
        return tabManager.createSidebar(url, options)
    })

    // 关闭侧边栏
    ipcMain.handle('sidebar:close', () => {
        tabManager.closeSidebar()
    })

    // 更新侧边栏大小
    ipcMain.handle('sidebar:resize', (event, { width }) => {
        if (tabManager.sidebarPopup) {
            const bounds = tabManager.sidebarPopup.getBounds()
            tabManager.createSidebar(tabManager.sidebarPopup.webContents.getURL(), {
                ...bounds,
                width
            })
        }
    })
} 