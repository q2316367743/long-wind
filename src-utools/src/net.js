const fs = require('node:fs')
const { pathToFileURL } = require('url')
const axios = require('axios')

const parseProxy = (proxy) => {
  if (!proxy) return false
  const url = new URL(proxy)
  const result = {
    protocol: url.protocol.replace(':', ''),
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'https:' ? 443 : 80))
  }
  if (url.username || url.password) {
    result.auth = {
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password)
    }
  }
  return result
}

module.exports = {
  /**
   * 从url下载一个文件
   * @param url 文件地址
   * @param path 保存的地址
   * @param options 下载选项
   * @param onProgress 下载进度回调
   * @return {Promise<void>}
   */
  downloadFileFromUrl: async (url, path, options, onProgress) => {
    const file = fs.createWriteStream(path)
    const cleanup = () => {
      file.close()
      if (fs.existsSync(path)) fs.unlinkSync(path)
    }

    try {
      const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: options?.headers || {},
        proxy: parseProxy(options?.proxy),
        validateStatus: (status) => status >= 200 && status < 300
      })
      const total = parseInt(response.headers['content-length'] || '0', 10)
      let loaded = 0
      response.data.on('data', (chunk) => {
        loaded += chunk.length
        if (typeof onProgress === 'function') {
          onProgress({
            total,
            loaded,
            percent: total > 0 ? Math.round((loaded / total) * 100) : 0
          })
        }
      })
      response.data.pipe(file)
      await new Promise((resolve, reject) => {
        file.on('finish', resolve)
        file.on('error', reject)
        response.data.on('error', reject)
      })
      file.close()
    } catch (error) {
      cleanup()
      throw error
    }
  },
  pathToHref: (path) => {
    return pathToFileURL(path).href
  }
}
