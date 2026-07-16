<template>
  <page-layout title="下载列表">
    <template #extra>
      <t-space size="small">
        <t-button theme="default" @click="loadRecords">刷新</t-button>
        <t-button theme="primary" @click="openPostDownloadDialog()">新建下载</t-button>
      </t-space>
    </template>
    <div class="home">
      <t-empty v-if="records.length === 0" description="暂无下载任务" />
      <div v-else class="task-list">
        <t-card v-for="item in records" :key="item.id" hover-shadow @click="goInfo(item.id)">
          <div class="task-card">
            <div class="task-card__main">
              <div class="task-card__title">{{ item.name }}</div>
              <div class="task-card__meta">{{ item.url }}</div>
              <t-progress :percentage="item.progress" size="small" />
            </div>
            <div class="task-card__side">
              <t-tag :theme="getDownloadStatusTheme(item.status)" variant="light">
                {{ getDownloadStatusText(item.status) }}
              </t-tag>
              <div class="task-card__count">{{ item.finished }}/{{ item.total }}</div>
              <div v-if="item.failed" class="task-card__failed">失败 {{ item.failed }}</div>
              <t-space size="small" @click.stop>
                <t-button v-if="item.status === 'downloading'" size="small" theme="default" @click="pauseTask(item.id)">
                  暂停
                </t-button>
                <t-button v-if="item.status === 'paused'" size="small" theme="primary" @click="startTask(item.id)">
                  继续
                </t-button>
                <t-button v-if="canCancel(item.status)" size="small" theme="warning" @click="cancelTask(item.id)">
                  取消
                </t-button>
                <t-button size="small" theme="danger" @click="removeTask(item.id)">删除</t-button>
              </t-space>
            </div>
          </div>
        </t-card>
      </div>
    </div>
  </page-layout>
</template>
<script lang="ts" setup>
import { downloadRecordStore } from '@/core/DownloadRecordStore'
import { downloadTaskService } from '@/core/DownloadTaskService'
import { DownloadRecordSummary } from '@/domain/DownloadRecord'
import { DownloadItemStatus } from '@/domain/DownloadItem'
import { openPostDownloadDialog } from '@/global/PostDownloadDialog'
import { getDownloadStatusText, getDownloadStatusTheme } from '@/utils/download/DownloadStatus'

const router = useRouter()
const records = ref<DownloadRecordSummary[]>([])

const loadRecords = async () => {
  records.value = (await downloadRecordStore.readIndex()).items
}

const goInfo = (id: string) => {
  router.push(`/info/${id}`)
}

const canCancel = (status: DownloadItemStatus) => {
  return ['waiting', 'downloading', 'paused', 'failed'].includes(status)
}

const startTask = async (id: string) => {
  void downloadTaskService.start(id)
  await loadRecords()
}

const pauseTask = async (id: string) => {
  await downloadTaskService.pause(id)
  await loadRecords()
}

const cancelTask = async (id: string) => {
  await downloadTaskService.cancel(id)
  await loadRecords()
}

const removeTask = async (id: string) => {
  await downloadTaskService.remove(id)
  await loadRecords()
}

onMounted(loadRecords)
useIntervalFn(loadRecords, 1000)

</script>
<style scoped lang="less">
.home {
  padding: 16px;

  .task-list {
    display: grid;
    gap: 12px;
  }

  .task-card {
    display: flex;
    justify-content: space-between;
    gap: 16px;

    &__main {
      flex: 1;
      min-width: 0;
    }

    &__title {
      font-size: 16px;
      font-weight: 600;
      color: var(--td-text-color-primary);
    }

    &__meta {
      margin: 6px 0 12px;
      overflow: hidden;
      color: var(--td-text-color-secondary);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__side {
      display: flex;
      min-width: 88px;
      align-items: flex-end;
      flex-direction: column;
      gap: 8px;
      color: var(--td-text-color-secondary);
    }

    &__failed {
      color: var(--td-error-color);
    }
  }
}
</style>
