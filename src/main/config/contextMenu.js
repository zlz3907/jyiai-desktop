import { Menu, MenuItem } from 'electron'

export function createContextMenu(i18n) {
  if (!i18n) {
    console.error('i18n is not initialized')
    return null
  }

  const contextMenu = new Menu()

  contextMenu.append(new MenuItem({
    label: i18n.t('menu:copy'),
    role: 'copy'
  }))

  contextMenu.append(new MenuItem({
    label: i18n.t('menu:paste'),
    role: 'paste'
  }))

  contextMenu.append(new MenuItem({
    label: i18n.t('menu:cut'),
    role: 'cut'
  }))

  contextMenu.append(new MenuItem({
    label: i18n.t('menu:selectAll'),
    role: 'selectAll'
  }))

  // 添加更多自定义菜单项
  contextMenu.append(new MenuItem({
    type: 'separator'
  }))

  return contextMenu
} 