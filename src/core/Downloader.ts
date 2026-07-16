// ============ 核心接口 ============

/**
 * 分片信息
 */
export interface Segment {
  /** 远程下载地址，由解析器生成，下载引擎使用 */
  url: string
  /** 本地落盘路径，解析阶段为空字符串，下载完成后由下载引擎回填 */
  path: string
  /** 分片序号，用于排序和文件命名 */
  index: number
  /** 媒体轨道，DASH 音视频分离时用于区分合并对象 */
  track?: 'video' | 'audio'
  /** 分片角色，init 段必须在同轨道 media 段之前合并 */
  role?: 'media' | 'init'
  /** 可选，分片大小 */
  size?: number
  /** 可选，时长(毫秒) */
  duration?: number
  /** 可选，通用文件分片起始字节 */
  offset?: number
  /** 可选，通用文件分片下载字节数 */
  bytes?: number
  /** 可选，HTTP Range 头，如 bytes=0-8388607 */
  range?: string
}

/**
 * 媒体资源信息
 */
export interface MediaResource {
  type: 'hls' | 'dash' | 'plain' // 协议类型
  segments: Segment[] // 所有分片列表
  metadata?: {
    // 额外信息
    title?: string
    duration?: number
    resolution?: string
    isAudioVideoSeparate?: boolean // DASH特有：是否音视频分离
    audioSegments?: Segment[] // DASH音频分片
    initSegment?: string // DASH初始化段
    audioInitSegment?: string // DASH音频初始化段
  }
}

export interface Downloader {
  /**
   * 解析URL，返回媒体资源信息
   * @param url 待解析的URL
   */
  parse(url: string): Promise<MediaResource>

  /**
   * 合并文件到指定目录
   * @param paths 文件路径列表
   * @param target 目标目录
   */
  merge(paths: Array<Segment>, target: string): Promise<void>
}
