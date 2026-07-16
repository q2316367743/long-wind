<template>
  <sub-page-layout title="下载详情">
    <template #extra>
      <t-space v-if="task" size="small">
        <t-button theme="default" @click="loadTask">刷新</t-button>
        <t-button v-if="task.base.status === 'downloading'" theme="default" @click="pauseTask">暂停</t-button>
        <t-button v-if="task.base.status === 'paused'" theme="primary" @click="startTask">继续</t-button>
        <t-button v-if="canRetry" theme="warning" @click="retryAll">全部重试</t-button>
        <t-button v-if="canMerge" theme="primary" :loading="merging" @click="mergeTask">手动合并</t-button>
        <t-button v-if="canForceMerge" theme="danger" :loading="merging" @click="forceMergeTask">强制合并</t-button>
        <t-button v-if="canCancel" theme="warning" @click="cancelTask">取消</t-button>
        <t-button theme="danger" @click="removeTask">删除</t-button>
      </t-space>
    </template>
    <div class="info">
      <t-empty v-if="!task" description="未找到下载任务" />
      <template v-else>
        <t-card>
          <div class="summary">
            <div>
              <div class="summary__title">{{ task.base.name }}</div>
              <div class="summary__url">{{ task.base.url }}</div>
            </div>
            <t-tag :theme="statusTheme" variant="light">{{ getDownloadStatusText(task.base.status) }}</t-tag>
          </div>
          <t-progress :percentage="progress" />
          <div class="stats">
            <span>全部 {{ task.segments.length }}</span>
            <span>完成 {{ successCount }}</span>
            <span>失败 {{ failedCount }}</span>
            <span>速度 {{ formatDownloadSpeed(task.base.speed) }}</span>
            <span>
              保存到
              <t-link theme="primary" hover="color" @click="showTargetInFolder">
                {{ task.targetPath }}
              </t-link>
            </span>
          </div>
        </t-card>
        <t-card class="segments" title="分片状态">
          <segment-grid :segments="task.segments" :readonly="readonly" @retry="retrySegment" />
        </t-card>
      </template>
    </div>
  </sub-page-layout>
</template>
<script lang="ts" setup>
import { downloadTaskService } from '@/core/DownloadTaskService'
import { DownloadTaskRecord } from '@/domain/DownloadRecord'
import { DownloadItemStatus } from '@/domain/DownloadItem'
import { formatDownloadSpeed, getDownloadStatusText, getDownloadStatusTheme } from '@/utils/download/DownloadStatus'
import { MessageBoxUtil, MessageUtil } from '@/utils/modal'
import SegmentGrid from './components/SegmentGrid.vue'

const route = useRoute()
const router = useRouter()
const task = ref<DownloadTaskRecord | null>(null)
const merging = ref(false)
const taskId = computed(() => String(route.params.key ?? ''))

const successCount = computed(() => task.value?.segments.filter((segment) => segment.status === 'success').length ?? 0)
const failedCount = computed(() => task.value?.segments.filter((segment) => segment.status === 'failed').length ?? 0)
const progress = computed(() => {
  const total = task.value?.segments.length ?? 0
  return total ? Math.round((successCount.value / total) * 100) : 0
})
const readonly = computed(() => task.value?.base.status === 'finished')
const canRetry = computed(() => {
  if (!task.value || readonly.value) return false
  return failedCount.value > 0 && ['downloading', 'failed'].includes(task.value.base.status)
})
const canCancel = computed(() => {
  if (!task.value || readonly.value) return false
  return ['waiting', 'downloading', 'paused', 'failed'].includes(task.value.base.status)
})
const canMerge = computed(() => {
  if (!task.value || readonly.value) return false
  return task.value.segments.length > 0 && task.value.segments.every((segment) => segment.status === 'success')
})
const canForceMerge = computed(() => {
  if (!task.value || readonly.value) return false
  const isVideo = task.value.resource.type === 'hls' || task.value.resource.type === 'dash'
  const noPending = task.value.segments.every((segment) => segment.status !== 'pending' && segment.status !== 'downloading')
  return task.value.base.status === 'failed' && isVideo && noPending && failedCount.value > 0 && successCount.value > 0
})
const statusTheme = computed(() => getStatusTheme(task.value?.base.status ?? 'waiting'))

const getStatusTheme = (status: DownloadItemStatus) => getDownloadStatusTheme(status)

const loadTask = async () => {
  task.value = await downloadTaskService.getTask(taskId.value)
}

const retryAll = async () => {
  await downloadTaskService.retryAll(taskId.value)
  MessageUtil.success('已开始重试失败分片')
  await loadTask()
}

const startTask = async () => {
  void downloadTaskService.start(taskId.value)
  MessageUtil.success('已继续下载')
  await loadTask()
}

const pauseTask = async () => {
  await downloadTaskService.pause(taskId.value)
  MessageUtil.success('已暂停下载')
  await loadTask()
}

const cancelTask = async () => {
  await downloadTaskService.cancel(taskId.value)
  MessageUtil.success('已取消下载')
  await loadTask()
}

const removeTask = async () => {
  await downloadTaskService.remove(taskId.value)
  task.value = null
  MessageUtil.success('已删除下载记录')
  await router.replace('/')
}

const showTargetInFolder = () => {
  if (!task.value) return
  window.preload.inject.shell.showItemInFolder(task.value.targetPath)
}

const retrySegment = async (index: number) => {
  if (!canRetry.value) return
  await downloadTaskService.retrySegment(taskId.value, index)
  MessageUtil.success('分片重试完成')
  await loadTask()
}

const mergeTask = async () => {
  if (merging.value) return
  merging.value = true
  try {
    await downloadTaskService.merge(taskId.value)
    MessageUtil.success('合并完成')
    await loadTask()
  } finally {
    merging.value = false
  }
}

const forceMergeTask = async () => {
  if (merging.value) return
  try {
    await MessageBoxUtil.confirm(
      '当前存在下载失败的分片，强制合并会忽略这些分片，生成的视频可能内容不完整或出现跳帧。是否继续？',
      '强制合并确认',
      { confirmButtonText: '继续合并', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  merging.value = true
  try {
    await downloadTaskService.forceMerge(taskId.value)
    MessageUtil.warning('已强制合并，视频可能内容不完整')
    await loadTask()
  } finally {
    merging.value = false
  }
}

onMounted(loadTask)
useIntervalFn(loadTask, 1000)
</script>
<style scoped lang="less">
.info {
  display: grid;
  gap: 16px;
  padding: 16px;

  .summary {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;

    &__title {
      font-size: 18px;
      font-weight: 600;
      color: var(--td-text-color-primary);
    }

    &__url {
      margin-top: 6px;
      color: var(--td-text-color-secondary);
      word-break: break-all;
    }
  }

  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 12px;
    color: var(--td-text-color-secondary);
  }

  .segments {
    min-height: 160px;
  }
}

</style>
