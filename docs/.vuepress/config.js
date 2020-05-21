module.exports = {
	locales: {
		"/": {
			lang: "en-US",
			title: "Nginx Proxy Manager",
			description: "Expose your services easily and securely"
		}
	},
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
	],
	themeConfig: {
		logo: "/icon.png",
		// the GitHub repo path
		repo: "jc21/nginx-proxy-manager",
		// the label linking to the repo
		repoLabel: "GitHub",
		// if your docs are not at the root of the repo:
		docsDir: "docs",
		// defaults to false, set to true to enable
		editLinks: true,
		locales: {
			"/": {
				// text for the language dropdown
				selectText: "Languages",
				// label for this locale in the language dropdown
				label: "English",
				// Custom text for edit link. Defaults to "Edit this page"
				editLinkText: "Edit this page on GitHub",
				// Custom navbar values
				nav: [{ text: "Setup", link: "/setup/" }],
				// Custom sidebar values
				sidebar: [
					"/",
					["/guide/", "Guide"],
					["/screenshots/", "Screenshots"],
					["/setup/", "Setup Instructions"],
					["/advanced-config/", "Advanced Configuration"],
					["/faq/", "Frequently Asked Questions"],
					["/third-party/", "Third Party"]
				]
			}
		}
	},
	plugins: [
		[
			"@vuepress/google-analytics",
			{
				ga: "UA-99675467-4"
			}
		],
		[
			"sitemap",
			{
				hostname: "https://nginxproxymanager.com"
			}
		],
		[
			'vuepress-plugin-zooming',
			{
				selector: '.zooming',
				delay: 1000,
				options: {
					bgColor: 'black',
					zIndex: 10000,
				},
			},
		],
	]
};
