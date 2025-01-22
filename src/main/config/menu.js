import { app, Menu, shell, session } from 'electron'
// import i18n from '../../locales/i18n.js'

// 其他代码...

export function createApplicationMenu(mainWindow, tabManager, i18n) {

    const isDebug = process.argv.includes('--dev-tools')
    const isMac = process.platform === 'darwin'
    Menu.setApplicationMenu(null)
    if (!isMac) {
        return
    }



    if (!i18n) {
        console.error('i18n is not initialized')
        return
    } 

    const languageMenu = {
        label: i18n.t('menu:language'),
        submenu: [
            {
                label: 'English',
                type: 'radio',
                checked: i18n.language === 'en',
                click: () => {
                    i18n.changeLanguage('en', () => {
                        createApplicationMenu(mainWindow, tabManager, i18n)
                    })
                }
            },
            {
                label: '中文',
                type: 'radio',
                checked: i18n.language === 'zh',
                click: () => {
                    i18n.changeLanguage('zh', () => {
                        createApplicationMenu(mainWindow, tabManager, i18n)
                    })
                }
            }
        ]
    }

    const editMenu = {
        // i18n.setName
        label: i18n.t('menu:edit'),
        submenu: [
            { role: 'undo', label: i18n.t('menu:undo') },
            { role: 'redo', label: i18n.t('menu:redo') },
            { type: 'separator' },
            { role: 'cut', label: i18n.t('menu:cut') },
            { role: 'copy', label: i18n.t('menu:copy') },
            { role: 'paste', label: i18n.t('menu:paste') },
            { role: 'selectAll', label: i18n.t('menu:selectAll') }
        ]
    }

    const template = [
        {
            label: app.name,
            submenu: [
                { role: 'about', label: i18n.t('menu:about') + app.name },
                languageMenu,
                { type: 'separator' },
                { 
                    label: i18n.t('menu:clearCache'),
                    click: async () => {
                        try {
                            const sessions = [
                                session.defaultSession,
                                session.fromPartition('persist:tab_proxy'),
                                session.fromPartition('persist:tab_default')
                            ]
                            
                            await Promise.all(sessions.map(session => 
                                session.clearCache()
                            ))
                            
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
                    label: i18n.t('menu:toggleWindow'),
                    click: () => {
                        if (mainWindow.isVisible()) {
                            mainWindow.hide()
                        } else {
                            mainWindow.show()
                        }
                    }
                },
                { role: 'zoom', label: i18n.t('menu:zoom') },
                { type: 'separator' },
                { role: 'quit', label: i18n.t('menu:quit') }
            ]
        },
        editMenu,
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
                        if (tabManager?.popupWindow) {
                            tabManager.popupWindow.webContents.openDevTools({ mode: 'detach' })
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

    return menu
} 