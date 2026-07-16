
interface UseLogOptions {
  name: string
}

export const useLog = (options: UseLogOptions) => {
  return {
    debug: (...data: unknown[]) => {
      console.debug(`[${options.name}] `, ...data)
    },
    info: (...data: unknown[]) => {
      console.log(`[${options.name}] `, ...data)
    },
    warn: (...data: unknown[]) => {
      console.warn(`[${options.name}] `, ...data)
    },
    error: (...data: unknown[]) => {
      console.error(`[${options.name}] `, ...data)
    }
  }
}
