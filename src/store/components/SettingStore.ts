import { defineStore } from 'pinia'
import { buildSetting, Setting } from '@/domain/Setting'
import { getFromOneByAsync, saveOneByAsync } from '@/utils/native'
import { LocalNameEnum } from '@/global/LocalNameEnum'
import { useLog } from '@/hooks'

export const useSettingStore = defineStore('setting', () => {
  const logger = useLog({ name: 'store/setting' })
  const state = ref<Setting>(buildSetting())
  const rev = ref<string>()

  const initFunc = async () => {
    const res = await getFromOneByAsync<Setting>(LocalNameEnum.ITEM_SETTING)
    if (res.record) {
      state.value = res.record
      rev.value = res.rev
    }

    throttledWatch(
      state,
      async () => {
        logger.info('state changed, saving...')
        rev.value = await saveOneByAsync(LocalNameEnum.ITEM_SETTING, state.value, rev.value)
      },
      { deep: true, throttle: 1000 }
    )
  }
  const init = () => {
    initFunc()
      .then(() => logger.debug('初始化设置成功'))
      .catch((e) => logger.error('初始化设置失败', e))
  }

  const runFfmpeg = async (
    args: string[],
    onProgress?: (progress: InjectFfmpegProgress) => void
  ) => {
    if (state.value.ffmpeg) {
      // 使用自定义的 ffmpeg
      return
    }
    if (window.preload.inject.getPlatform() === 'utools') {
      await window.preload.inject.ffmpeg.run(args, onProgress)
      return
    }
    return Promise.reject(new Error('FFmpeg not found'))
  }

  return {
    state,
    init,
    runFfmpeg
  }
})
