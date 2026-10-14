# Cypress Test Suite

## Host Header Regression Test

Run `python3 test/host-header-smoke.py <built-image>` from the repository root.
The backend CI build runs this check against the image it builds. It creates a
disposable NPM container and renders a proxy host through the backend's normal
configuration generator, including a custom location. A synthetic HTTPS upstream
checks that the forwarded Host matches Origin and Referer, and echoes the request
method, path and body. Coverage includes HTTP and HTTPS, explicit default and
nonstandard ports, mixed-case names, IPv6 authorities, and HTTP/1.0 without Host.
All test traffic and published Docker ports use loopback; the container and its
anonymous volumes are removed on completion.

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

## Forwarded Host image test

Run `python3 test/host-header-smoke.py <built-image>` from the repository root.
The test waits for the manager, generated HTTP/HTTPS proxy host, both location
paths and its synthetic upstream. It verifies Host/Origin/Referer consistency,
request bodies and HTTP/1.0 fallback, then uses a dynamic upstream counter to
prove cache hits and isolation between client authorities on ports 232 and 233.
Requests run through `docker exec`, so a remote Docker daemon or containerized
CI agent needs no shared loopback interface or published ports. The CI image
build script invokes this test against the image it just built.
