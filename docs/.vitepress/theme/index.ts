import DefaultTheme from 'vitepress/theme'
import './custom.css'
import GalleryLightbox from './components/gallery-lightbox.vue'
import ScreenshotImg from './components/screenshot-img.vue'

export default {
	extends: DefaultTheme,
	enhanceApp({ app }) {
		app.component('GalleryLightbox', GalleryLightbox)
		app.component('ScreenshotImg', ScreenshotImg)
	}
}
