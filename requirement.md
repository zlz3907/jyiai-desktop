# 项目需求描述

## 项目名称
AIMetar

## 项目概述
AIMetar 是一个基于 Electron 的桌面应用程序，旨在提供一个集成的浏览体验，支持标签管理、自动更新和自定义布局。

## 功能需求

### 1. 主窗口
- 使用 `BaseWindow` 创建主窗口，支持以下配置：
  - 宽度：1215px
  - 高度：751px
  - 最小宽度：800px
  - 最小高度：600px
  - 深色主题
  - 自动隐藏菜单栏

BaseWindow 分为上下两个部分，上部分是程序的工具栏、标签栏、搜索框、地址栏、返回/前进按钮、刷新、收藏夹、设置按钮等，下部分是浏览器视图。

上部分默认高度为 72px，下部分默认高度为 679px。
下部分是使用 `BrowserView` 创建的视图，支持标签管理。 `TabManager` 负责标签的管理，包括标签的创建、切换、关闭等操作。

### 2. 标签管理
#### 2.1 基础功能
- 实现标签管理器，支持以下操作：
  - 创建新标签
  - 切换标签
  - 关闭标签
  - 导航操作（前进、后退、重新加载、加载指定 URL）

#### 2.2 标签管理弹出菜单
##### 功能概述
实现一个自定义的标签管理弹出菜单，用于展示和管理当前所有打开的标签页。

##### 详细功能
- **基础功能**
  - 显示所有打开的标签列表
  - 标识当前活动标签
  - 支持标签切换
  - 支持标签关闭
  - 支持批量操作（关闭其他、关闭左侧、关闭右侧）
  - 支持新建标签

- **交互设计**
  - 点击触发按钮时在指定位置显示菜单
  - 点击菜单外部区域自动关闭
  - 选择菜单项后自动关闭
  - 支持键盘导航和快捷键
  - 支持鼠标悬停预览
  - 菜单位置自适应（防止超出窗口边界）

- **视觉设计**
  - 遵循应用整体视觉风格
  - 支持亮色/暗色主题
  - 包含图标、标题、URL 等信息
  - 提供视觉反馈（悬停、选中状态）
  - 支持动画过渡效果

##### 技术实现
- **组件结构**
  ```
  src/
    renderer/
      components/
        TabMenu/
          index.js        // 主组件
          MenuItem.js     // 菜单项组件
          MenuGroup.js    // 分组组件
          styles.css      // 样式文件
      hooks/
        useTabMenu.js    // 菜单逻辑钩子
    main/
      windows/
        tabs.js          // 标签管理类
      ipc/
        menu.js          // IPC 通信处理
  ```

- **数据流设计**
  1. 触发显示菜单：Renderer -> IPC -> Main
  2. 获取标签数据：Main -> TabManager
  3. 发送数据到渲染进程：Main -> IPC -> Renderer
  4. 更新菜单状态：Renderer useState
  5. 执行菜单操作：Renderer -> IPC -> Main

##### 性能优化
- 使用虚拟列表处理大量标签
- 优化动画性能
- 减少不必要的渲染
- 实现延迟加载
- 添加状态缓存

##### 安全考虑
- 防止 XSS 注入
- 验证 IPC 消息
- 限制菜单操作权限

### 3. 视图布局
- 创建顶部视图（工具栏和标签栏）和底部视图区域。
- 支持窗口大小调整时，自动更新视图大小。
- 顶部视图默认加载url：http://localhost:59001/desktop

### 4. 自动更新
- 配置自动更新功能，支持检查更新和通知用户。

### 5. IPC 处理
- 设置 IPC 处理程序，支持与渲染进程的通信，包括标签页操作和布局相关操作。

### 6. 菜单
- 创建应用程序菜单，包含以下选项：
  - 应用菜单（关于、退出）
  - 编辑菜单（撤销、重做、剪切、复制、粘贴）
  - 查看菜单（刷新、强制重新加载、开发者工具）

## 技术栈
- **前端**: Electron
- **后端**: Node.js
- **其他**: 使用 `electron-updater` 进行自动更新

## 依赖
- `electron`
- `electron-updater`
- `path`

## 开发环境
- Node.js 版本：14.x 或更高
- Electron 版本：最新稳定版

## 其他信息
- 代码存储在 GitHub 上，使用 GitHub Actions 进行 CI/CD。
- 详细的更新日志记录在 `CHANGELOG.md` 文件中。

# 标签管理弹出菜单实现方案

## 1. 数据结构设计

### 1.1 标签状态数据
```typescript
interface TabState {
    id: string;          // 标签ID
    title: string;       // 标签标题
    url: string;         // 标签URL
    loading: boolean;    // 加载状态
    useProxy?: boolean;  // 是否使用代理
    navigate?: boolean;  // 是否是导航操作
}
```

### 1.2 消息类型常量
```javascript
const MessageType = {
    TAB_TITLE_UPDATED: 'tab-title-updated',
    TAB_URL_UPDATED: 'tab-url-updated',
    TAB_LOADING_STATE: 'tab-loading-state',
    TAB_STATE_CHANGED: 'tab-state-changed',
    TAB_CREATED: 'tab-created',
    TAB_VIEW_STATE: 'tab-view-state'
}
```

## 2. 核心功能实现

### 2.1 TabManager 扩展
```javascript
class TabManager {
    // 创建标签菜单
    createTabsMenu(x, y) {
        const template = this._buildMenuTemplate()
        const menu = Menu.buildFromTemplate(template)
        return new Promise((resolve) => {
            menu.popup({
                x,
                y,
                callback: () => resolve()
            })
        })
    }

    // 构建菜单模板
    _buildMenuTemplate() {
        const template = []
        
        // 添加标签列表
        for (const [tabId, state] of this.tabStates) {
            template.push({
                label: state.title || 'Untitled',
                type: 'checkbox',
                checked: tabId === this.activeTabId,
                click: () => this.switchTab(tabId),
                toolTip: state.url,
                sublabel: state.url
            })
        }

        // 添加管理选项
        if (template.length > 0) {
            template.push({ type: 'separator' })
        }

        // 批量操作选项
        template.push(
            {
                label: '关闭其他标签',
                enabled: this.tabs.size > 1,
                click: () => this._closeOtherTabs()
            },
            {
                label: '关闭左侧标签',
                enabled: this._hasTabsToLeft(),
                click: () => this._closeTabsToLeft()
            },
            {
                label: '关闭右侧标签',
                enabled: this._hasTabsToRight(),
                click: () => this._closeTabsToRight()
            },
            { type: 'separator' },
            {
                label: '新建标签',
                click: () => this.createTab('about:blank')
            }
        )

        return template
    }

    // 批量操作辅助方法
    _closeOtherTabs() {
        const activeId = this.activeTabId
        Array.from(this.tabs.keys())
            .filter(id => id !== activeId)
            .forEach(id => this.closeTab(id))
    }

    _hasTabsToLeft() {
        const tabIds = Array.from(this.tabs.keys())
        const activeIndex = tabIds.indexOf(this.activeTabId)
        return activeIndex > 0
    }

    _hasTabsToRight() {
        const tabIds = Array.from(this.tabs.keys())
        const activeIndex = tabIds.indexOf(this.activeTabId)
        return activeIndex < tabIds.length - 1
    }
}
```

### 2.2 IPC 通信
```javascript
// 主进程 (app.js)
setupIPC() {
    // ... 现有代码 ...
    
    // 标签菜单相关
    ipcMain.handle('show-tabs-menu', (event, { x, y }) => {
        return this.tabManager.createTabsMenu(x, y)
    })
}

// 预加载脚本 (sdk.js)
contextBridge.exposeInMainWorld('jyiaiSDK', {
    browser: {
        // ... 现有方法 ...
        
        // 标签菜单
        showTabsMenu: (x, y) => ipcRenderer.invoke('show-tabs-menu', { x, y }),
        
        // 标签状态监听
        onTabStateChanged: (callback) => {
            ipcRenderer.on('tab-state-changed', (event, data) => callback(data))
        }
    }
})
```

## 3. 状态管理

### 3.1 标签状态更新
```javascript
_updateTabState(tabId, newState, messageType = this.MessageType.TAB_STATE_CHANGED) {
    const currentState = this.tabStates.get(tabId) || {}
    const updatedState = {
        ...currentState,
        ...newState,
        id: tabId
    }
    this.tabStates.set(tabId, updatedState)
    this._sendMessage(messageType, updatedState)
}
```

### 3.2 消息通信
```javascript
_sendMessage(type, payload) {
    if (!this.topView?.webContents) {
        console.warn('TopView not available for message:', type)
        return
    }
    this.topView.webContents.send(this.MessageType.TAB_STATE_CHANGED, {
        type,
        payload
    })
}
```

## 4. 安全性考虑

### 4.1 IPC 通信安全
- 使用 contextIsolation
- 限制暴露的 API
- 验证传入参数

### 4.2 菜单操作安全
- 验证标签 ID 有效性
- 确保操作权限
- 防止重复操作

## 5. 性能优化

### 5.1 菜单构建优化
- 缓存菜单模板
- 延迟加载菜单项
- 限制菜单项数量

### 5.2 状态更新优化
- 批量更新机制
- 防抖动处理
- 状态变更比较

## 6. 错误处理

### 6.1 异常捕获
```javascript
createTabsMenu(x, y) {
    try {
        const template = this._buildMenuTemplate()
        const menu = Menu.buildFromTemplate(template)
        return new Promise((resolve) => {
            menu.popup({
                x,
                y,
                callback: () => resolve()
            })
        })
    } catch (error) {
        console.error('Failed to create tabs menu:', error)
        return Promise.reject(error)
    }
}
```

### 6.2 错误恢复
- 菜单创建失败时的回退机制
- 状态同步错误处理
- 异常状态清理
