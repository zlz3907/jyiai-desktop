# JyiAI Desktop Client

基于 Electron 的桌面客户端应用，提供代理访问和窗口管理功能。

## 项目结构

src/
├── main/                 # 主进程相关代码
│   ├── app.js           # 主进程入口文件
│   ├── config/          # 配置文件目录
│   │   └── proxy.js     # 代理配置
│   └── windows/         # 窗口管理
│       └── browser.js   # 浏览器窗口管理器
└── preload/             # 预加载脚本
    └── sdk.js           # 预加载SDK定义

### 主要功能模块

1. **窗口管理**
   - 主窗口创建和管理
   - 多窗口会话控制
   - 代理窗口配置
   - CSP 安全策略设置

2. **代理访问**
   - HTTP 代理配置
   - 会话级别的代理设置
   - 代理请求监控和错误处理

3. **预加载 SDK**
   - 安全的 IPC 通信接口
   - 窗口操作 API
   - 系统信息获取

### 技术栈

- Electron: 跨平台桌面应用框架
- Node.js: JavaScript 运行时
- IPC: 进程间通信机制
- Session API: Electron 会话管理
- CSP: 内容安全策略

### 开发环境要求

- Node.js >= 14.0.0
- npm >= 6.0.0
- Electron >= 12.0.0







