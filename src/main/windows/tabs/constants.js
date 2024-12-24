// 视图状态枚举
exports.ViewState = {
    LOADING: 'loading',
    READY: 'ready',
    ERROR: 'error'
}

// 消息类型常量
exports.MessageType = {
    TAB_TITLE_UPDATED: 'tab-title-updated',
    TAB_URL_UPDATED: 'tab-url-updated',
    TAB_LOADING_STATE: 'tab-loading-state',
    TAB_STATE_CHANGED: 'tab-state-changed',
    TAB_CREATED: 'tab-created',
    TAB_VIEW_STATE: 'tab-view-state',
    TAB_PROXY_STATUS: 'tab-proxy-status',
    TAB_REQUEST_ERROR: 'tab-request-error'
}

// Session 配置常量
exports.SessionConfig = {
    USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ALLOWED_PERMISSIONS: [
        'media',
        'mediaKeySystem',
        'geolocation',
        'notifications',
        'fullscreen',
        'pointerLock',
        'local-fonts'
    ]
} 