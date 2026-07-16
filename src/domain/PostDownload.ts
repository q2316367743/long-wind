import { DownloadTaskType } from './DownloadItem';

export interface PostDownload {

  /**
   * 任务类型
   * http - HTTP/HTTPS下载
   * m3u8 - M3U8视频下载
   * torrent - 种子/磁力链接下载
   * ftp - FTP下载
   */
  taskType: DownloadTaskType;

  /**
   * 下载链接或文件路径
   */
  url: string;
  /**
   * 重命名，选填
   */
  name: string;
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

}