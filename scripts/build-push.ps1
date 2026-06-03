# Build (and optionally push) the production Docker image for this fork.
# Defaults: docker.io/salexson/nginx-proxy-manager:develop
#
# Examples:
#   .\scripts\build-push.ps1
#   .\scripts\build-push.ps1 -Push
#   .\scripts\build-push.ps1 -Tag latest -Push -AlsoLatest
#   $env:SKIP_TESTS='1'; .\scripts\build-push.ps1 -SkipFrontendBuild  # image only, frontend already built

param(
	[string]$Image = "docker.io/salexson/nginx-proxy-manager",
	[string]$Tag = "develop",
	[switch]$Push,
	[switch]$AlsoLatest,
	[switch]$SkipTests,
	[switch]$SkipFrontendBuild,
	[switch]$NoCache
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$FrontendImage = "nginxproxymanager/nginx-full:certbot-node"

function Build-Frontend {
	Write-Host "Building frontend (dist) ..." -ForegroundColor Cyan
	docker pull $FrontendImage | Out-Null
	$frontendPath = Join-Path $Root "frontend"
	if ($SkipTests) {
		$inner = "yarn install && yarn locale-compile && yarn build"
	} else {
		$inner = "yarn install && yarn lint && yarn locale-compile && yarn vitest run --no-color && yarn build"
	}
	docker run --rm `
		-e CI=true `
		-e NODE_OPTIONS=--openssl-legacy-provider `
		-v "${frontendPath}:/app/frontend" `
		-w /app/frontend `
		$FrontendImage `
		sh -c $inner
	if (-not $LASTEXITCODE) { exit $LASTEXITCODE }
}

if (-not $SkipFrontendBuild) {
	Build-Frontend
	if ($LASTEXITCODE) { exit $LASTEXITCODE }
}

try {
	$commit = (git log -n 1 --format=%h 2>$null)
	if (-not $commit) { $commit = "unknown" }
} catch {
	$commit = "unknown"
}

$fullTag = "${Image}:${Tag}"
Write-Host "Building $fullTag ..." -ForegroundColor Cyan

$buildArgs = @(
	"build", "--pull",
	"-t", $fullTag,
	"-f", "docker/Dockerfile",
	"--build-arg", "TARGETPLATFORM=linux/amd64",
	"--build-arg", "BUILDPLATFORM=linux/amd64",
	"--build-arg", "BUILD_VERSION=$Tag",
	"--build-arg", "BUILD_COMMIT=$commit",
	"--build-arg", ("BUILD_DATE=" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss K"))
)
if ($NoCache) { $buildArgs += "--no-cache" }
$buildArgs += "."
& docker @buildArgs
if ($LASTEXITCODE) { exit $LASTEXITCODE }

Write-Host "Image ready: $fullTag" -ForegroundColor Green

if ($Push) {
	Write-Host "Pushing $fullTag ..." -ForegroundColor Cyan
	docker push $fullTag
	if ($LASTEXITCODE) { exit $LASTEXITCODE }
	if ($AlsoLatest -and $Tag -ne "latest") {
		$latest = "${Image}:latest"
		docker tag $fullTag $latest
		docker push $latest
		if ($LASTEXITCODE) { exit $LASTEXITCODE }
		Write-Host "Also pushed $latest" -ForegroundColor Green
	}
}

Write-Host @"

Next steps:
  docker login docker.io
  docker run --rm -p 80:80 -p 81:81 -p 443:443 -v `"`${PWD}/data:/data`" -v `"`${PWD}/letsencrypt:/etc/letsencrypt`" $fullTag

Or: docker compose -f docker/docker-compose.hub.yml up -d
"@ -ForegroundColor DarkGray
