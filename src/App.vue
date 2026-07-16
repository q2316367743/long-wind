<template>
  <t-layout class="main">
    <t-aside style="z-index: 50" width="64px">
      <t-menu v-model="path" :collapsed="true" style="height: 100vh">
        <template #operations>
          <t-button theme="primary" variant="text" shape="square" @click="openPostDownloadDialog()">
            <template #icon>
              <add-icon />
            </template>
          </t-button>
        </template>
        <t-menu-item value="/" to="/">
          <template #icon>
            <view-list-icon />
          </template>
          下载列表
        </t-menu-item>
        <t-menu-item value="/setting" to="/setting">
          <template #icon>
            <setting-icon />
          </template>
          设置
        </t-menu-item>
      </t-menu>
    </t-aside>
    <t-content class="main-container">
      <router-view />
    </t-content>
  </t-layout>
</template>
<script lang="ts" setup>
import { useRoute, useRouter } from 'vue-router'
import { AddIcon, SettingIcon, ViewListIcon } from 'tdesign-icons-vue-next'
import { openPostDownloadDialog } from '@/global/PostDownloadDialog'
import { getAppData } from '@/global/Constant'
import { useSettingStore } from '@/store'

const route = useRoute()
const router = useRouter()
const path = ref('/')

watch(path, (value) => router.push(value))

watch(
  () => route.path,
  (value) => {
    if (value !== path.value) {
      path.value = value
    }
  }
)

window.preload.inject.onPluginEnter((action) => {
  // 对关键字进行处理
  console.log(action)
  if (action.code === 'link') {
    openPostDownloadDialog(`${action.payload}`)
  }
})

onMounted(() => {
  useSettingStore().init()
  console.log('App mounted, launch on', getAppData())
})
</script>
<style scoped lang="less">
.main {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  color: var(--td-text-color-primary);

  & > .main-container {
    position: relative;
    height: 100%;
    width: 100%;
    background-color: var(--td-bg-color-container);
    border-radius: var(--td-radius-medium);
    overflow: hidden;
  }
}
</style>
