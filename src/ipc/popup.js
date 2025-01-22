import { ipcMain } from 'electron'

export function setupSidebarHandlers(tabManager) {
    // 显示侧边栏
    ipcMain.handle('popup:show', (event, { url, options }) => {
        console.log('popup:show', url, options)
        return tabManager.createPopupWindow(url, options)
    })

    // 关闭侧边栏
    ipcMain.handle('popup:close', () => {
        tabManager.closePopupWindow()
    })

    // 更新侧边栏大小
    ipcMain.handle('popup:resize', (event, { width }) => {
        if (tabManager.popupWindow) {
            const bounds = tabManager.popupWindow.getBounds()
            tabManager.createPopupWindow(tabManager.popupWindow.webContents.getURL(), {
                ...bounds,
                width
            })
        }
    })
} 