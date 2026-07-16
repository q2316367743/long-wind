/**
 * 下载任务类型
 * http - HTTP/HTTPS下载
 * m3u8 - M3U8视频下载
 * torrent - 种子/磁力链接下载
 * ftp - FTP下载
 */
export type DownloadTaskType = 'http' | 'm3u8' | 'torrent' | 'ftp';

/**
 * 下载项状态
 * waiting - 等待中
 * downloading - 下载中
 * paused - 暂停中
 * batch_merging - 分批合并中
 * final_merging - 最终合并中
 * finished - 完成
 * failed - 失败
 * cancelled - 已取消
 */
export type DownloadItemStatus = 'waiting' | 'downloading' | 'paused' | 'batch_merging' | 'final_merging' | 'finished' | 'failed' | 'cancelled';

/**
 * 下载项
 */
export interface DownloadItem {

  id: string;
  created_at: string;

  /**
   * 任务类型
   */
  taskType: DownloadTaskType;
  name: string;
  url: string;
  path: string;

  /**
   * 状态
   */
  status: DownloadItemStatus;
  logs: string[];
  /**
   * 进度
   */
  progress: number;
  /**
   * 总大小
   */
  total: number;
  /**
   * 速度，kb/s
   */
  speed: number;


  /**
   * 分片数
   */
  threads: number;
  /**
   * 存储路径
   */
  folder: string;
  /**
   * User-Agent
   */
  userAgent: string;
  /**
   * Authorization
   */
  authorization: string;
  /**
   * Referer
   */
  referer: string;
  /**
   * Cookie
   */
  cookie: string;
  /**
   * 代理
   * [http://][USER:PASSWORD@]HOST[:PORT]
   * @example http://127.0.0.1:7890
   */
  proxy: string;
  /**
   * 跳转到下载页面
   */
  jump: boolean;


  /**
   * 合并进度（FFmpeg 合并时使用）
   */
  mergeProgress?: number;

  /**
   * 分批进度（分批合并时使用）
   */
  batchProgress?: number;

  /**
   * 当前批次
   */
  currentBatch?: number;

  /**
   * 总批次数
   */
  totalBatches?: number;

}
