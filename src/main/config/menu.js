import { app, Menu, shell, session } from 'electron'
import { getSystemConfig } from './index.js'

export function createApplicationMenu(mainWindow, tabManager) {
    const isDebug = process.argv.includes('--dev-tools')
    const isMac = process.platform === 'darwin'
    
    // 如果不是 macOS，不显示菜单
    if (!isMac) {
        Menu.setApplicationMenu(null)
        return
    }

    const template = [
        // macOS 主菜单
        {
            label: app.name,
            submenu: [
                { role: 'about', label: '关于简易AI-智能麦塔' },
                { type: 'separator' },
                { 
                    label: '清除缓存',
                    click: async () => {
                        try {
                            // 清除所有 session 的缓存
                            const sessions = [
                                session.defaultSession,
                                session.fromPartition('persist:tab_proxy'),
                                session.fromPartition('persist:tab_default')
                            ]
                            
                            await Promise.all(sessions.map(session => 
                                session.clearCache()
                            ))
                            
                            // 清除后重载当前页面
                            const activeTab = tabManager?.tabs.get(tabManager.activeTabId)
                            if (activeTab) {
                                activeTab.webContents.reload()
                            }
                        } catch (err) {
                            console.error('Failed to clear cache:', err)
                        }
                    }
                },
                { type: 'separator' },
                { 
                    label: '隐藏/显示窗口',
                    click: () => {
                        if (mainWindow.isVisible()) {
                            mainWindow.hide()
                        } else {
                            mainWindow.show()
                        }
                    }
                },
                { role: 'zoom', label: '最大化/还原' },
                { type: 'separator' },
                { role: 'quit', label: '退出' }
            ]
        },

        // Debug菜单（仅在debug模式下显示）
        ...(isDebug ? [{
            label: '调试',
            submenu: [
                {
                    label: 'Debug Tabs Bar',
                    click: () => {
                        if (tabManager?.topView) {
                            tabManager.topView.webContents.openDevTools({ mode: 'detach' })
                        }
                    }
                },
                {
                    label: 'Debug Main Content',
                    click: () => {
                        const activeTab = tabManager?.tabs.get(tabManager.activeTabId)
                        if (activeTab) {
                            activeTab.webContents.openDevTools({ mode: 'detach' })
                        }
                    }
                },
                {
                    label: 'Debug Sidebar',
                    click: () => {
                        if (tabManager?.sidebarPopup) {
                            tabManager.sidebarPopup.webContents.openDevTools({ mode: 'detach' })
                        }
                    }
                },
                {
                    label: 'Debug Tabs Popup Menu',
                    click: () => {
                        if (tabManager?.menuPopup) {
                            tabManager.menuPopup.webContents.openDevTools({ mode: 'detach' })
                        }
                    }
                }
            ]
        }] : [])
    ]

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
} 