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
            lastUpdated: Date.now() // 更新最后更新时间
        }

        // 特殊处理导航页的 URL
        updatedState.url = updatedState?.navigate ? '' : updatedState?.url

        this.tabStates.set(tabId, updatedState) // 更新 Map 中的状态
        // console.log('updatedState', updatedState)
        this._sendMessage(messageType, updatedState) // 发送消息通知状态更新
    }

    // 获取标签状态
    getState(tabId) {
        return this.tabStates.get(tabId) // 返回指定标签的状态
    }

    // 获取所有标签状态
    getAllStates() {
        return Array.from(this.tabStates.values()) // 返回所有标签状态的数组
    }

    // 删除标签状态
    removeState(tabId) {
        this.tabStates.delete(tabId) // 从 Map 中删除指定标签的状态
    }

    // 发送消息到顶部视图
    _sendMessage(type, payload) {
        if (!this.topView?.webContents) {
            console.warn('TopView not available for message:', type) // 如果顶部视图不可用，输出警告
            return
        }
        this.topView.webContents.send('ipc-msg', {type, payload}) // 通过 webContents 发送消息
    }

    // 清理所有状态
    clear() {
        this.tabStates.clear() // 清空所有标签状态
    }
}

export default TabStateManager