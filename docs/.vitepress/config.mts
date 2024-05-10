import { defineConfig, type DefaultTheme } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
	title: "Nginx Proxy Manager",
	description: "Expose your services easily and securely",
	head: [
		["link", { rel: "icon", href: "/icon.png" }],
		["meta", { name: "description", content: "Docker container and built in Web Application for managing Nginx proxy hosts with a simple, powerful interface, providing free SSL support via Let's Encrypt" }],
		["meta", { property: "og:title", content: "Nginx Proxy Manager" }],
		["meta", { property: "og:description", content: "Docker container and built in Web Application for managing Nginx proxy hosts with a simple, powerful interface, providing free SSL support via Let's Encrypt"}],
		["meta", { property: "og:type", content: "website" }],
		["meta", { property: "og:url", content: "https://nginxproxymanager.com/" }],
		["meta", { property: "og:image", content: "https://nginxproxymanager.com/icon.png" }],
		["meta", { name: "twitter:card", content: "summary"}],
		["meta", { name: "twitter:title", content: "Nginx Proxy Manager"}],
		["meta", { name: "twitter:description", content: "Docker container and built in Web Application for managing Nginx proxy hosts with a simple, powerful interface, providing free SSL support via Let's Encrypt"}],
		["meta", { name: "twitter:image", content: "https://nginxproxymanager.com/icon.png"}],
		["meta", { name: "twitter:alt", content: "Nginx Proxy Manager"}],
		// GA
		['script', { async: 'true', src: 'https://www.googletagmanager.com/gtag/js?id=G-TXT8F5WY5B'}],
		['script', {}, "window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', 'G-TXT8F5WY5B');"],
	],
	sitemap: {
		hostname: 'https://nginxproxymanager.com'
	},
	metaChunk: true,
	srcDir: './src',
	outDir: './dist',
	themeConfig: {
		// https://vitepress.dev/reference/default-theme-config
		logo: { src: '/logo.svg', width: 24, height: 24 },
		nav: [
			{ text: 'Setup', link: '/setup/' },
		],
		sidebar: [
			{
				items: [
					// { text: 'Home', link: '/' },
					{ text: 'Guide', link: '/guide/' },
					{ text: 'Screenshots', link: '/screenshots/' },
					{ text: 'Setup Instructions', link: '/setup/' },
					{ text: 'Advanced Configuration', link: '/advanced-config/' },
					{ text: 'Upgrading', link: '/upgrading/' },
					{ text: 'Frequently Asked Questions', link: '/faq/' },
					{ text: 'Third Party', link: '/third-party/' },
				]
			}
		],
		socialLinks: [
			{ icon: 'github', link: 'https://github.com/NginxProxyManager/nginx-proxy-manager' }
		],
		search: {
			provider: 'local'
		},
		footer: {
			message: 'Released under the MIT License.',
			copyright: 'Copyright © 2016-present jc21.com'
		}
	}
});
