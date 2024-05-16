---
outline: deep
---

# Full Setup Instructions

## Running the App

Create a `docker-compose.yml` file:

```yml
services:
  npm:
    image: 'jc21/nginx-proxy-manager:3'
    restart: unless-stopped
    ports:
      # Public HTTP Port:
      - '80:8080'
      # Public HTTPS Port:
      - '443:8443'
      # Admin Web Port:
      - '81:8081'
    environment:
      # These run the processes and own the files
      # for a specific user/group
      - PUID=1000
      - PGID=1000
      # Uncomment this if IPv6 is not enabled on your host
      # NPM_DISABLE_IPV6: 'true'
    volumes:
      - ./data:/data
```

Then:

```bash
docker compose up -d
```

## Running on Raspberry PI / ARM devices

The docker images support the following architectures:
- amd64
- arm64
- armv7

The docker images are a manifest of all the architecture docker builds supported, so this means
you don't have to worry about doing anything special and you can follow the common instructions above.

Check out the [dockerhub tags](https://hub.docker.com/r/jc21/nginx-proxy-manager/tags)
for a list of supported architectures and if you want one that doesn't exist,
[create a feature request](https://github.com/NginxProxyManager/nginx-proxy-manager/issues/new?assignees=&labels=enhancement&template=feature_request.md&title=).


### Initial Run

After the app is running for the first time, the following will happen:

1. The database will initialize with table structures
2. GPG keys will be generated and saved in the configuration file

This process can take a couple of minutes depending on your machine.
