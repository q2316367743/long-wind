export const Constant = {
  // 插件的ID
  uid: '',
  // 项目名称，英文名称
  id: 'long-wind',
  // 项目中文名称
  name: '长风寄锦',
  // 版本
  version: '1.0.0',
  // 作者
  author: '落雨不悔',
  // 仓库
  repo: ''
}

export const getAppData = () => {
  return window.preload.path.join(
    window.preload.inject.os.getPath('appData'),
    window.preload.inject.getPlatform(),
    'app',
    Constant.id
  )
}

export const getRecordPath = () => {
  return window.preload.path.join(getAppData(), 'record.json')
}
