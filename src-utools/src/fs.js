const { createReadStream, createWriteStream, statSync, existsSync } = require('node:fs')
const { mkdir, readdir, readFile, rm, unlink, writeFile } = require('node:fs/promises')
const { join } = require('node:path')

const appendFile = (writer, path) => {
  return new Promise((resolve, reject) => {
    const reader = createReadStream(path)
    reader.on('error', reject)
    reader.on('end', resolve)
    reader.pipe(writer, { end: false })
  })
}

module.exports = {
  readDir: async (path) => {
    const names = await readdir(path)
    const paths = []
    for (const name of names) {
      const stat = statSync(join(path, name))
      paths.push({
        name,
        path: join(path, name),
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        size: stat.size,
        mtime: stat.mtime,
        ctime: stat.ctime,
        atime: stat.atime,
        birthtime: stat.birthtime
      })
    }
    return paths
  },
  ensureDir: (path) => {
    return mkdir(path, { recursive: true })
  },
  writeTextFile: (path, text) => {
    return writeFile(path, text, 'utf-8')
  },
  readTextFile: (path) => {
    return readFile(path, 'utf-8')
  },
  removeFile: async (path) => {
    if (!existsSync(path)) return
    await unlink(path)
  },
  removeDir: async (path) => {
    if (!existsSync(path)) return
    await rm(path, { recursive: true, force: true })
  },
  mergeFiles: async (paths, target) => {
    const writer = createWriteStream(target)
    return new Promise(async (resolve, reject) => {
      writer.on('finish', resolve)
      writer.on('error', reject)
      try {
        for (const path of paths) {
          await appendFile(writer, path)
        }
        writer.end()
      } catch (error) {
        writer.destroy()
        reject(error)
      }
    })
  },
  existsSync: (path) => {
    return existsSync(path)
  }
}
