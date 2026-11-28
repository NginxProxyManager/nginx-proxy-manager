<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

const container = ref<HTMLElement | null>(null);
let root: { unmount?: () => void } | null = null;

onMounted(async () => {
	if (!container.value) return;

	const spec = await fetch(`${import.meta.env.BASE_URL}openapi.json`).then((r) => {
		if (!r.ok) throw new Error(`Failed to load OpenAPI spec (${r.status})`);
		return r.json();
	});

	const { Redoc } = await import("redoc/bundles/redoc.standalone.js");
	Redoc.init(
		spec,
		{
			scrollYOffset: 60,
			hideDownloadButton: false,
			disableSearch: false,
		},
		container.value,
	);
});

onUnmounted(() => {
	root?.unmount?.();
	root = null;
});
</script>

<template>
	<div ref="container" class="api-reference-redoc" />
</template>
