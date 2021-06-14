# Full Setup Instructions

### Running the App

Via `docker-compose`:

```yml
version: "3"
services:
  app:
    image: 'jc21/nginx-proxy-manager:3'
    restart: always
    ports:
      # Public HTTP Port:
      - '80:80'
      # Public HTTPS Port:
      - '443:443'
      # Admin Web Port:
      - '81:81'
    environment:
      # Uncomment this if IPv6 is not enabled on your host
      # DISABLE_IPV6: 'true'
    volumes:
      - ./data:/data
```

Then:

```bash
docker-compose up -d
```

### Running on Raspberry PI / ARM devices

The docker images support the following architectures:
- amd64
- arm64
- armv7

The docker images are a manifest of all the architecture docker builds supported, so this means
you don't have to worry about doing anything special and you can follow the common instructions above.

Check out the [dockerhub tags](https://hub.docker.com/r/jc21/nginx-proxy-manager/tags)
for a list of supported architectures and if you want one that doesn't exist,
[create a feature request](https://github.com/jc21/nginx-proxy-manager/issues/new?assignees=&labels=enhancement&template=feature_request.md&title=).

Also, if you don't know how to already, follow [this guide to install docker and docker-compose](https://manre-universe.net/how-to-run-docker-and-docker-compose-on-raspbian/)
on Raspbian.


### Initial Run

After the app is running for the first time, the following will happen:

1. The database will initialize with table structures
2. GPG keys will be generated and saved in the configuration file

This process can take a couple of minutes depending on your machine.
