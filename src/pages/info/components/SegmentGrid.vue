<template>
  <div class="segment-grid">
    <t-button
      v-for="segment in segments"
      :key="segment.index"
      variant="outline"
      shape="square"
      size="small"
      class="segment-grid__item"
      :class="`segment-grid__item--${segment.status}`"
      :title="getTitle(segment)"
      :disabled="readonly || segment.status !== 'failed'"
      @click="emit('retry', segment.index)"
    />
  </div>
</template>

<script lang="ts" setup>
import { SegmentRecord } from '@/domain/DownloadRecord'

defineProps<{
  segments: SegmentRecord[]
  readonly: boolean
}>()

const emit = defineEmits<{
  retry: [index: number]
}>()

const getTitle = (segment: SegmentRecord) => {
  return `#${segment.index} ${segment.status}${segment.error ? `: ${segment.error}` : ''}`
}
</script>

<style scoped lang="less">
.segment-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12px, 1fr));
  gap: 6px;

  &__item {
    aspect-ratio: 1;
    min-width: 12px;
    width: auto;
    height: auto;
    padding: 0;
    cursor: pointer;
    border: 1px solid var(--td-border-level-1-color);
    border-radius: var(--td-radius-small);
    transition: transform 0.16s ease, box-shadow 0.16s ease;

    &:not(:disabled):hover {
      transform: translateY(-1px);
      box-shadow: var(--td-shadow-1);
    }

    &:disabled {
      cursor: default;
    }

    &--pending {
      background: var(--td-bg-color-component);
    }

    &--downloading {
      background: var(--td-brand-color);
    }

    &--success {
      background: var(--td-success-color);
    }

    &--failed {
      background: var(--td-error-color);
    }
  }
}
</style>
