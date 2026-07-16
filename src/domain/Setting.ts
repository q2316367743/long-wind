export interface Setting {
  // 默认下载位置
  downloadPath: string
  // 下载限速，0不显示，单位 mb/s
  downloadLimit: number
  // 同时下载的最大任务数
  maxDownloadTasks: number
  // 同时下载的最大分片数
  maxDownloadSlices: number
  // 下载完成后通知
  downloadCompleteNotification: boolean
  // 下载完成后是否打开文件夹
  downloadCompleteOpenFolder: boolean
  // 是否使用代理
  useProxy: boolean
  // 代理地址，格式：[http://][USER:PASSWORD@]HOST[:PORT]
  proxy: string
  // 忽略的主机与域名，逗号隔开
  ignoreHosts: string
  // User-Agent
  userAgent: string
  // 自定义 ffmpeg 路径
  ffmpeg: string
}

export function buildSetting(): Setting {
  return {
    downloadPath: window.preload.inject.os.getPath('downloads'),
    downloadLimit: 0,
    maxDownloadTasks: 0,
    maxDownloadSlices: 0,
    downloadCompleteNotification: false,
    downloadCompleteOpenFolder: false,
    useProxy: false,
    proxy: 'http://127.0.0.1:7890',
    ignoreHosts: 'localhost,127.0.0.1',
    userAgent: 'utools-downloader/1.0.0',
    ffmpeg: ''
  }
}
