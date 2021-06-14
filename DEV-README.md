# Nginx Proxy Manager 3

WIP


## Usage

environment variables


## Building

### Backend API Server

```bash
go build -ldflags="-X main.commit=$(git log -n 1 --format=%h)" -o bin/server ./cmd/server/main.go
```


## Development

```bash
git clone nginxproxymanager
cd nginxproxymanager
./scripts/start-dev
curl http://127.0.0.1:3000/api/
```
