import { DownloadItemStatus } from '@/domain/DownloadItem'

export const getDownloadStatusText = (status: DownloadItemStatus): string => {
  const textMap: Record<DownloadItemStatus, string> = {
    waiting: '等待中',
    downloading: '下载中',
    paused: '已暂停',
    batch_merging: '分批合并中',
    final_merging: '合并中',
    finished: '下载完成',
    failed: '下载失败',
    cancelled: '已取消'
  }
  return textMap[status]
}

export const getDownloadStatusTheme = (status: DownloadItemStatus) => {
  if (status === 'finished') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'danger'
  if (status === 'downloading' || status === 'final_merging' || status === 'batch_merging') return 'primary'
  if (status === 'paused') return 'warning'
  return 'default'
}
