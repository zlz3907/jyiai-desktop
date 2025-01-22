import { setupNavigationHandlers } from './navigation.js'
import { setupTabHandlers } from './tabs.js'
import { setupStoreHandlers } from './store.js'
import { setupSidebarHandlers } from './popup.js'

export function setupIPC(tabManager) {
    setupNavigationHandlers(tabManager)
    setupTabHandlers(tabManager)
    setupStoreHandlers()
    setupSidebarHandlers(tabManager)
} 