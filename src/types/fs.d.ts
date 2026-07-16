declare interface FileItem {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  size: number
  mtime: number
  ctime: number
  atime: number
  birthtime: number
}

declare interface FsApi {
  readDir: (path: string) => Promise<Array<FileItem>>
  ensureDir: (path: string) => Promise<void>
  writeTextFile: (path: string, text: string) => Promise<void>
  readTextFile: (path: string) => Promise<string>
  removeFile: (path: string) => Promise<void>
  removeDir: (path: string) => Promise<void>
  /** 按传入顺序二进制拼接本地文件 */
  mergeFiles: (paths: string[], target: string) => Promise<void>
  existsSync: (path: string) => boolean
}
