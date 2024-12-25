# AIMetar Browser

AIMetar is a modern, Electron-based web browser with advanced tab management and proxy support.

## Features

- **Advanced Tab Management**
  - Multi-tab browsing with dynamic tab creation and switching
  - Tab state management and persistence
  - Custom tab menu system
  - Tab-specific proxy settings

- **Proxy Support**
  - Per-tab proxy configuration
  - Proxy authentication support
  - Automatic proxy error handling

- **Security Features**
  - Sandboxed web contents
  - Context isolation
  - Secure content handling
  - Custom session management

- **Developer Tools**
  - Built-in error handling and logging
  - Development mode with enhanced debugging
  - Memory usage monitoring
  - Performance optimization

## Architecture

### Core Components

1. **Application Layer**
   - Main application initialization
   - Window management
   - IPC communication setup

2. **Configuration System**
   - System configuration management
   - User preferences handling
   - Environment-specific settings

3. **Tab Management**
   - TabManager: Core tab handling
   - TabStateManager: Tab state management
   - TabEventHandler: Event handling for tabs

4. **Browser Features**
   - Custom session management
   - Proxy configuration
   - Error handling system
   - Resource loading optimization

## Development

### Prerequisites

- Node.js (version X.X.X or higher)
- npm or yarn
- Electron

### Setup







