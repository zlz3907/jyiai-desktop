import { MessageType } from './constants.js'

class TabStateManager {
    constructor(topView) {
        this.topView = topView
        this.tabStates = new Map()
    }

    // 更新标签状态
    updateState(tabId, newState, messageType = MessageType.TAB_STATE_CHANGED) {
        const currentState = this.tabStates.get(tabId) || {}
        const updatedState = {
            ...currentState,
            ...newState,
            id: tabId,
            lastUpdated: Date.now()
        }

        // 特殊处理导航页的 URL
        updatedState.url = updatedState?.navigate ? '' : updatedState?.url

        this.tabStates.set(tabId, updatedState)
        // console.log('updatedState', updatedState)
        this._sendMessage(messageType, updatedState)
    }

    // 获取标签状态
    getState(tabId) {
        return this.tabStates.get(tabId)
    }

    // 获取所有标签状态
    getAllStates() {
        return Array.from(this.tabStates.values())
    }

    // 删除标签状态
    removeState(tabId) {
        this.tabStates.delete(tabId)
    }

    // 发送消息到顶部视图
    _sendMessage(type, payload) {
        if (!this.topView?.webContents) {
            console.warn('TopView not available for message:', type)
            return
        }
        this.topView.webContents.send('ipc-msg', {type, payload})
    }

    // 清理所有状态
    clear() {
        this.tabStates.clear()
    }
}

export default TabStateManager 