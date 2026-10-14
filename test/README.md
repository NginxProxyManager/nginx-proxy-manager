# Cypress Test Suite

## Running Locally

```
cd nginxproxymanager/test
yarn install
yarn run cypress
```

## VS Code

Editor settings are not committed to the repository, typically because each developer has their own settings. Below is a list of common setting that may help,
so feel free to try them or ignore them, you are a strong independent developer. You can add settings to either "user" or "workspace" but we recommend using
"workspace" as each project is different.

### ESLint

The ESLint extension only works on JavaScript files by default, so add the following to your workspace settings and reload VSCode.

```
"eslint.autoFixOnSave": true,
"eslint.validate": [
	{ "language": "javascript", "autoFix": true },
	"html"
]
```

> NOTE: If you've also set the editor.formatOnSave option to true in your settings.json, you'll need to add the following config to prevent running 2 formatting
> commands on save for JavaScript and TypeScript files:

```
"editor.formatOnSave": true,
"[javascript]": {
	"editor.formatOnSave": false,
},
"[javascriptreact]": {
	"editor.formatOnSave": false,
},
"[typescript]": {
	"editor.formatOnSave": false,
},
"[typescriptreact]": {
	"editor.formatOnSave": false,
},
```

## Public-port image smoke test

Run `python3 test/public-ports-smoke.py <built-image>` from the repository root.
It starts disposable containers for standard ports, custom 232/233, and `__FILE`
configuration. It checks the live health response against the API schema, Force SSL
and SSL-listener redirects, ACME/trusted-protocol exceptions, and generated proxy,
redirection and 404 hosts with unrelated server-level error pages (custom and
Let's Encrypt certificates). `scripts/ci/test-and-build` runs it after building
that same image. Requests run inside the tested container via `docker exec`, and
`__FILE` inputs are copied into it before startup. This also works with a remote
Docker daemon or a containerized CI agent; no published ports or shared temporary
directory are needed. Python 3 and access to a Docker daemon are required.
