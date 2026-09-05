import { defineConfig } from "vitepress";

export default defineConfig({
	title: "Nginx Proxy Manager — Lorwell Fork",
	description: "Documentation for the independently maintained Lorwell fork of Nginx Proxy Manager",
	head: [
		["link", { rel: "icon", href: "/icon.png" }],
		[
			"meta",
			{
				name: "description",
				content:
					"Managed Nginx proxy configuration, upstream groups, host monitoring, live logs and TLS in an independently maintained Docker image.",
			},
		],
		["meta", { property: "og:title", content: "Nginx Proxy Manager — Lorwell Fork" }],
		[
			"meta",
			{
				property: "og:description",
				content: "Documentation for the Lorwell fork and its independent release line.",
			},
		],
		["meta", { property: "og:type", content: "website" }],
	],
	metaChunk: true,
	srcDir: "./src",
	outDir: "./dist",
	themeConfig: {
		logo: { src: "/logo.svg", width: 24, height: 24 },
		nav: [
			{ text: "Setup", link: "/setup/" },
			{ text: "Docker Images", link: "https://hub.docker.com/r/moailaozi/nginx-proxy-manager/tags" },
		],
		sidebar: [
			{
				items: [
					{ text: "Guide", link: "/guide/" },
					{ text: "Fork Features", link: "/features/" },
					{ text: "Setup Instructions", link: "/setup/" },
					{ text: "Advanced Configuration", link: "/advanced-config/" },
					{ text: "Upgrading", link: "/upgrading/" },
					{ text: "Frequently Asked Questions", link: "/faq/" },
					{ text: "Certbot", link: "/certbot/" },
					{ text: "Third Party", link: "/third-party/" },
				],
			},
		],
		socialLinks: [{ icon: "github", link: "https://github.com/Lorwell/nginx-proxy-manager" }],
		search: { provider: "local" },
		footer: {
			message: "Released under the MIT License. Based on the original Nginx Proxy Manager project.",
			copyright: "Copyright © 2026 Lorwell fork contributors",
		},
	},
});
