<template>
  <!-- Lightbox Overlay -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isOpen"
        class="lightbox-overlay"
        @click.self="closeGallery"
      >
        <!-- Close Button -->
        <button class="lightbox-close" @click="closeGallery" aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <!-- Left Arrow -->
        <button
          class="lightbox-nav lightbox-prev"
          @click="prevImage"
          :disabled="currentIndex === 0"
          aria-label="Previous image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>

        <!-- Main Image -->
        <div class="lightbox-image-container">
          <Transition name="slide" mode="out-in">
            <img
              :key="currentIndex"
              :src="currentImagePath"
              :alt="screenshots[currentIndex]?.name || ''"
              class="lightbox-image"
            />
          </Transition>
        </div>

        <!-- Right Arrow -->
        <button
          class="lightbox-nav lightbox-next"
          @click="nextImage"
          :disabled="currentIndex === screenshots.length - 1"
          aria-label="Next image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>

        <!-- Image Counter -->
        <div class="lightbox-counter">
          {{ currentIndex + 1 }} / {{ screenshots.length }}
        </div>

        <!-- Dot Indicators (Mobile) -->
        <div class="lightbox-dots">
          <button
            v-for="(_, index) in screenshots"
            :key="index"
            @click="currentIndex = index"
            :class="['dot', { active: index === currentIndex }]"
            :aria-label="`Go to image ${index + 1}`"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

interface Screenshot {
  name: string
  file: string
}

const screenshots: Screenshot[] = [
  { name: 'Setup', file: '01_first-user.png' },
  { name: 'Login', file: '02_login.png' },
  { name: 'Dashboard', file: '03_dashboard.png' },
  { name: 'Proxy Hosts', file: '04_proxy-hosts.png' },
  { name: 'Redirection Hosts', file: '05_redirection_hosts.png' },
  { name: 'Streams', file: '06_streams.png' },
  { name: '404 Hosts', file: '07_404_hosts.png' },
  { name: 'Access Lists', file: '08_access-lists.png' },
  { name: 'Certificates', file: '09_certificates.png' },
  { name: 'Users', file: '10_users.png' },
  { name: 'Audit Logs', file: '11_audit-logs.png' },
  { name: 'Settings', file: '12_settings.png' },
  { name: 'Add Proxy Host', file: '13_add-proxy_host.png' },
  { name: 'Add Proxy Host with DNS', file: '14_add_proxy_host_dns.png' },
]

const isOpen = ref(false)
const currentIndex = ref(0)
const currentGroup = ref<'light' | 'dark'>('light')
const touchStartX = ref(0)
const touchStartY = ref(0)

const currentImagePath = computed(() => {
  return `/screenshots/${currentGroup.value}/${screenshots[currentIndex.value].file}`
})

const openGallery = (group: 'light' | 'dark', index: number) => {
  currentGroup.value = group
  currentIndex.value = index
  isOpen.value = true
  document.body.style.overflow = 'hidden'
}

const closeGallery = () => {
  isOpen.value = false
  document.body.style.overflow = ''
}

const nextImage = () => {
  if (currentIndex.value < screenshots.length - 1) {
    currentIndex.value++
  }
}

const prevImage = () => {
  if (currentIndex.value > 0) {
    currentIndex.value--
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (!isOpen.value) return
  switch (e.key) {
    case 'ArrowLeft':
      prevImage()
      break
    case 'ArrowRight':
      nextImage()
      break
    case 'Escape':
      closeGallery()
      break
  }
}

// Touch/Swipe handlers
const handleTouchStart = (e: TouchEvent) => {
  touchStartX.value = e.touches[0].clientX
  touchStartY.value = e.touches[0].clientY
}

const handleTouchEnd = (e: TouchEvent) => {
  if (!isOpen.value) return

  const touchEndX = e.changedTouches[0].clientX
  const touchEndY = e.changedTouches[0].clientY

  const deltaX = touchEndX - touchStartX.value
  const deltaY = touchEndY - touchStartY.value

  // Only trigger if horizontal swipe is greater than vertical swipe
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    const swipeThreshold = 50
    if (deltaX > swipeThreshold) {
      // Swipe right - previous
      prevImage()
    } else if (deltaX < -swipeThreshold) {
      // Swipe left - next
      nextImage()
    }
  }
}

// Custom event handler
const handleOpenGallery = (e: Event) => {
  const customEvent = e as CustomEvent<{ group: 'light' | 'dark'; index: number }>
  openGallery(customEvent.detail.group, customEvent.detail.index)
}

watch(isOpen, (newValue) => {
  if (newValue) {
    document.addEventListener('keydown', handleKeydown)
    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })
  } else {
    document.removeEventListener('keydown', handleKeydown)
    document.removeEventListener('touchstart', handleTouchStart)
    document.removeEventListener('touchend', handleTouchEnd)
  }
})

onMounted(() => {
  window.addEventListener('open-gallery', handleOpenGallery as EventListener)
})

onUnmounted(() => {
  window.removeEventListener('open-gallery', handleOpenGallery as EventListener)
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('touchstart', handleTouchStart)
  document.removeEventListener('touchend', handleTouchEnd)
  if (isOpen.value) {
    document.body.style.overflow = ''
  }
})
</script>

<style scoped>
/* Lightbox Overlay */
.lightbox-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 40px;
}

/* Close Button */
.lightbox-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
  z-index: 10;
}

.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.25);
}

/* Navigation Buttons */
.lightbox-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 52px;
  height: 52px;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
  z-index: 10;
}

.lightbox-nav:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.25);
}

.lightbox-nav:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.lightbox-prev {
  left: 20px;
}

.lightbox-next {
  right: 20px;
}

/* Image Container */
.lightbox-image-container {
  max-width: calc(100% - 160px);
  max-height: calc(100vh - 140px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.lightbox-image {
  max-width: 100%;
  max-height: calc(100vh - 140px);
  object-fit: contain;
  border-radius: 8px;
}

/* Counter */
.lightbox-counter {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  color: white;
  font-size: 14px;
  font-weight: 500;
  background: rgba(0, 0, 0, 0.6);
  padding: 8px 18px;
  border-radius: 20px;
  z-index: 10;
}

/* Dot Indicators */
.lightbox-dots {
  display: none;
  position: absolute;
  bottom: 70px;
  left: 50%;
  transform: translateX(-50%);
  gap: 8px;
  z-index: 10;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
}

.dot:hover {
  background: rgba(255, 255, 255, 0.6);
}

.dot.active {
  background: white;
  transform: scale(1.2);
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

/* Mobile Optimizations */
@media (max-width: 768px) {
  .lightbox-overlay {
    padding: 0;
    align-items: center;
  }

  /* Hide navigation arrows on mobile */
  .lightbox-nav {
    display: none;
  }

  /* Show dots on mobile */
  .lightbox-dots {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    max-width: 90%;
    gap: 6px;
    bottom: 80px;
  }

  .dot {
    width: 8px;
    height: 8px;
  }

  .lightbox-image-container {
    max-width: 100%;
    max-height: calc(100vh - 140px);
    padding: 0;
  }

  .lightbox-image {
    max-width: 100%;
    max-height: calc(100vh - 140px);
    border-radius: 0;
  }

  .lightbox-close {
    width: 44px;
    height: 44px;
    top: 16px;
    right: 16px;
    background: rgba(0, 0, 0, 0.5);
  }

  .lightbox-counter {
    bottom: 16px;
    font-size: 13px;
    padding: 6px 14px;
  }
}

@media (max-width: 480px) {
  .lightbox-dots {
    gap: 4px;
    bottom: 75px;
  }

  .dot {
    width: 7px;
    height: 7px;
  }
}
</style>
