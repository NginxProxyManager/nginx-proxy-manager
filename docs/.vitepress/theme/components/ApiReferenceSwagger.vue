<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

const container = ref<HTMLElement | null>(null);
let ui: { destroy?: () => void } | null = null;

onMounted(async () => {
	if (!container.value) return;

	const SwaggerUIBundle = (await import("swagger-ui-dist/swagger-ui-es-bundle.js")).default;
	await import("swagger-ui-dist/swagger-ui.css");

	ui = SwaggerUIBundle({
		domNode: container.value,
		url: `${import.meta.env.BASE_URL}openapi.json`,
		persistAuthorization: true,
		displayRequestDuration: true,
		tryItOutEnabled: true,
	});
});

onUnmounted(() => {
	ui?.destroy?.();
	ui = null;
});
</script>

<template>
	<div ref="container" class="api-reference-swagger" />
</template>
