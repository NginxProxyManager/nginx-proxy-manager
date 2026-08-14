[CmdletBinding()]
param(
	[Alias("f")]
	[switch]$Follow,
	[switch]$Pull
)

$ErrorActionPreference = "Stop"
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = (Resolve-Path (Join-Path $scriptDirectory "..")).Path

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
	throw "docker command is not available"
}

$previousProjectName = $env:COMPOSE_PROJECT_NAME
$previousComposeFile = $env:COMPOSE_FILE
$previousPathSeparator = $env:COMPOSE_PATH_SEPARATOR

try {
	$env:COMPOSE_PROJECT_NAME = "npm2dev"
	$env:COMPOSE_PATH_SEPARATOR = ";"
	$env:COMPOSE_FILE = @(
		(Join-Path $repositoryRoot "docker/docker-compose.dev.yml")
		(Join-Path $repositoryRoot "docker/docker-compose.dev.sqlite.yml")
	) -join $env:COMPOSE_PATH_SEPARATOR

	Push-Location $repositoryRoot
	try {
		Write-Host "Starting SQLite Single-Instance Dev Stack ..." -ForegroundColor Cyan
		Write-Host "Only the fullstack container will be started; database and supporting services are not started." -ForegroundColor Yellow

		& docker compose config --quiet
		if ($LASTEXITCODE -ne 0) { throw "docker compose config failed with exit code $LASTEXITCODE" }

		$buildArguments = @("compose", "build")
		if ($Pull) { $buildArguments += "--pull" }
		$buildArguments += @("--parallel", "fullstack")
		& docker @buildArguments
		if ($LASTEXITCODE -ne 0) { throw "docker compose build failed with exit code $LASTEXITCODE" }

		& docker compose up -d --no-deps --force-recreate fullstack
		if ($LASTEXITCODE -ne 0) { throw "docker compose up failed with exit code $LASTEXITCODE" }

		$containerId = (& docker compose ps --all -q fullstack | Select-Object -Last 1).Trim()
		if (-not $containerId) { throw "fullstack container was not created" }

		Write-Host "Waiting for healthy: $containerId" -ForegroundColor Cyan
		$healthy = $false
		$lastHealthStatus = $null
		for ($attempt = 1; $attempt -le 120; $attempt++) {
			$status = (& docker inspect -f "{{.State.Health.Status}}" $containerId 2>$null).Trim()
			if ($status -eq "healthy") {
				$healthy = $true
				break
			}
			if ($status -ne $lastHealthStatus) {
				Write-Host "Health status: $status" -ForegroundColor $(if ($status -eq "unhealthy") { "Yellow" } else { "DarkGray" })
				$lastHealthStatus = $status
			}
			Start-Sleep -Seconds 1
		}
		if (-not $healthy) {
			& docker logs --tail 100 $containerId
			throw "Timed out waiting for fullstack container health"
		}

		Write-Host "Healthy!" -ForegroundColor Green
		Write-Host ""
		Write-Host "Admin UI:     http://127.0.0.1:3081" -ForegroundColor Cyan
		Write-Host "Nginx:        http://127.0.0.1:3080" -ForegroundColor Cyan
		Write-Host "SQLite file:  /data/database.sqlite (inside npm2dev.core)" -ForegroundColor Cyan
		Write-Host ""

		if ($Follow) {
			& docker logs -f npm2dev.core
		} else {
			Write-Host "Hint: docker logs -f npm2dev.core" -ForegroundColor Yellow
		}
	} finally {
		Pop-Location
	}
} finally {
	$env:COMPOSE_PROJECT_NAME = $previousProjectName
	$env:COMPOSE_FILE = $previousComposeFile
	$env:COMPOSE_PATH_SEPARATOR = $previousPathSeparator
}
