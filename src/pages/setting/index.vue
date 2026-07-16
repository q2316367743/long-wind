<template>
  <page-layout title="设置">
    <div class="p-16px pt-0">
      <t-form ref="formRef" :data="state" label-width="140px" layout="vertical" label-align="top">
        <!-- 下载设置 -->
        <div class="setting-section">
          <h3 class="section-title">下载设置</h3>
          <t-form-item label="默认下载路径" name="downloadPath">
            <t-input v-model="state.downloadPath" placeholder="请选择下载路径" readonly>
              <template #suffix>
                <t-button theme="primary" variant="text" size="small" @click="selectDownloadPath">
                  选择
                </t-button>
              </template>
            </t-input>
          </t-form-item>
          <t-form-item
            label="自定义 ffmpeg 路径"
            name="ffmpeg"
            help="不建议修改，会使用自带的 ffmpeg "
          >
            <t-input v-model="state.ffmpeg" placeholder="请选择自定义 ffmpeg 路径" readonly>
              <template #suffix>
                <t-button theme="primary" variant="text" size="small" @click="selectFfmpegPath">
                  选择
                </t-button>
                <t-button theme="danger" variant="text" size="small" @click="state.ffmpeg = ''">
                  清空
                </t-button>
              </template>
            </t-input>
          </t-form-item>
        </div>

        <!-- 传输设置 -->
        <div class="setting-section">
          <h3 class="section-title">传输设置</h3>
          <t-form-item label="下载限制 (MB/s)" name="downloadLimit" help="0 代表不限制">
            <t-input-number
              v-model="state.downloadLimit"
              :min="0"
              theme="normal"
            />
          </t-form-item>
        </div>

        <!-- 任务设置 -->
        <div class="setting-section">
          <h3 class="section-title">任务设置</h3>
          <t-form-item label="同时下载的最大任务数" name="maxDownloadTasks" label-align="top">
            <t-input-number
              v-model="state.maxDownloadTasks"
              :min="1"
              :max="20"
              placeholder="5"
              theme="normal"
            />
          </t-form-item>
          <t-form-item label="同时下载的最大分片数" name="maxDownloadSlices" label-align="top">
            <t-input-number
              v-model="state.maxDownloadSlices"
              :min="1"
              :max="256"
              placeholder="64"
              theme="normal"
            />
          </t-form-item>
          <t-form-item name="downloadCompleteNotification" label-align="top">
            <t-checkbox v-model="state.downloadCompleteNotification"> 下载完成后通知 </t-checkbox>
          </t-form-item>
          <t-form-item name="downloadCompleteOpenFolder" label-align="top">
            <t-checkbox v-model="state.downloadCompleteOpenFolder">
              下载完成后自动打开文件夹
            </t-checkbox>
          </t-form-item>
        </div>

        <!-- 代理设置 -->
        <div class="setting-section">
          <h3 class="section-title">代理设置</h3>
          <t-form-item name="useProxy" label-align="top">
            <t-checkbox v-model="state.useProxy"> 使用代理 </t-checkbox>
          </t-form-item>
          <t-form-item v-if="state.useProxy" label="代理地址" name="proxy">
            <t-input v-model="state.proxy" placeholder="例如: http://127.0.0.1:7890" />
            <template #tips> 格式: [http://][USER:PASSWORD@]HOST[:PORT] </template>
          </t-form-item>
          <t-form-item v-if="state.useProxy" label="忽略主机与域名" name="ignoreHosts">
            <t-tag-input v-model="state.ignoreHosts" placeholder="输入域名后按回车添加" clearable />
            <template #tips> 不使用代理的域名列表，例如: localhost, 127.0.0.1 </template>
          </t-form-item>
        </div>
        <!-- User-Agent 设置 -->
        <div class="setting-section">
          <h3 class="section-title">请求设置</h3>
          <t-form-item label="User-Agent" name="userAgent">
            <t-textarea
              v-model="state.userAgent"
              :maxlength="500"
              placeholder="用户代理字符串"
              :autosize="{ minRows: 2, maxRows: 4 }"
            />
            <template #tips> HTTP请求的User-Agent标识，影响部分网站的访问 </template>
          </t-form-item>

          <!-- 预设 User-Agent 选择 -->
          <t-form-item label="预设 User-Agent">
            <t-select
              v-model="selectedPresetUA"
              placeholder="选择预设的User-Agent"
              clearable
              @change="handlePresetUAChange"
            >
              <t-option
                v-for="preset in presetUserAgents"
                :key="preset.label"
                :value="preset.value"
                :label="preset.label"
              />
            </t-select>
          </t-form-item>
        </div>
      </t-form>
    </div>
  </page-layout>
</template>
<script lang="ts" setup>
import { useSettingStore } from '@/store'
import { MessageUtil } from '@/utils/modal'

const { state } = toRefs(useSettingStore())

/**
 * 选择下载路径
 */
const selectDownloadPath = async () => {
  try {
    // 使用 utools API 选择目录
    // 检查是否在 utools 环境中
    const selectedPath = window.preload.inject.dialog.open({
      title: '选择下载目录',
      buttonLabel: '选择',
      properties: ['openDirectory', 'createDirectory']
    })
    if (!selectedPath || !selectedPath[0]) return
    state.value.downloadPath = selectedPath[0]
    MessageUtil.success('下载路径设置成功')
  } catch (error) {
    console.warn('用户取消选择下载路径')
  }
}

const selectFfmpegPath = () => {
  try {
    // 使用 utools API 选择目录
    // 检查是否在 utools 环境中
    const selectedPath = window.preload.inject.dialog.open({
      title: '选择自定义 ffmpeg 路径',
      buttonLabel: '选择',
      properties: ['openFile', 'createDirectory']
    })
    if (!selectedPath || !selectedPath[0]) return
    state.value.ffmpeg = selectedPath[0]
    MessageUtil.success('自定义 ffmpeg 路径设置成功')
  } catch (error) {
    console.warn('用户取消选择自定义 ffmpeg 路径')
  }
}

// 预设 User-Agent 选择
const selectedPresetUA = ref('')

// 预设 User-Agent 列表
const presetUserAgents = [
  {
    label: 'Chrome (Windows)',
    value:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  },
  {
    label: 'Chrome (macOS)',
    value:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  },
  {
    label: 'Firefox (Windows)',
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'
  },
  {
    label: 'Safari (macOS)',
    value:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
  },
  {
    label: 'aria2',
    value: 'aria2/1.36.0'
  },
  {
    label: 'Transmission',
    value: 'Transmission/3.00'
  },
  {
    label: '百度网盘',
    value: 'netdisk;6.0.0.12;PC;PC-Windows;10.0.16299;WindowsBaiduYunGuanJia'
  },
  {
    label: 'utools-downloader',
    value: 'utools-downloader/1.0.0'
  }
]
/**
 * 处理预设 User-Agent 选择
 */
const handlePresetUAChange = (value: any) => {
  if (value && typeof value === 'string') {
    state.value.userAgent = value
    MessageUtil.success('User-Agent 已更新')
  }
}
</script>
<style scoped lang="less"></style>
