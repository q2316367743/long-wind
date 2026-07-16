import { defineStore } from 'pinia'
import { buildSetting, Setting } from '@/domain/Setting'
import { getFromOneByAsync, saveOneByAsync } from '@/utils/native'
import { LocalNameEnum } from '@/global/LocalNameEnum'

export const useSettingStore = defineStore('setting', () => {
  const state = ref<Setting>(buildSetting())
  const rev = ref<string>()

  const init = async () => {
    const res = await getFromOneByAsync<Setting>(LocalNameEnum.ITEM_SETTING)
    if (!res.record) return
    state.value = res.record
    rev.value = res.rev

    throttledWatch(
      state,
      async () => {
        rev.value = await saveOneByAsync(LocalNameEnum.ITEM_SETTING, state.value, rev.value)
      },
      { deep: true, throttle: 1000 }
    )
  }

  init()

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
    runFfmpeg
  }
})
