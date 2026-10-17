<template>
  <img
    :src="src"
    :alt="alt"
    :title="title"
    :width="width"
    :class="imgClass"
    :style="imgStyle"
    @click="openGallery"
  />
</template>

<script setup lang="ts">
const props = defineProps<{
  src: string
  alt: string
  title: string
  width?: number
  group: 'light' | 'dark'
  index: number
  imgClass?: string
  imgStyle?: string
}>()

const openGallery = () => {
  window.dispatchEvent(new CustomEvent('open-gallery', {
    detail: { group: props.group, index: props.index }
  }))
}
</script>
