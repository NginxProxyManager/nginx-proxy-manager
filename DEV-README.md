# Development

```bash
git clone nginxproxymanager
cd nginxproxymanager
./scripts/start-dev
# wait a minute or 2 for the package to build after container start
curl http://127.0.0.1:3081/api/
```

## Using Local Test Certificate Authorities

It's handy to use these instead of hitting production or staging acme servers
when testing lots of stuff.

Firstly create your first user using the api:

```bash
curl --request POST \
  --url http://127.0.0.1:3081/api/users \
  --header 'Content-Type: application/json' \
  --data '{
    "name": "Bobby Tables",
    "nickname": "Bobby",
    "email": "you@example.com",
    "roles": ["admin"],
    "is_disabled": false,
    "auth": {
      "type": "password",
      "secret": "changeme"
    }
}'
```

Then login in with those credentials to get your JWT token and set
that as an environment variable:

```bash
NPM_TOKEN=$(curl --request POST \
  --url http://127.0.0.1:3081/api/tokens \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "password",
    "identity": "you@example.com",
    "secret": "changeme"
}' | jq -r '.result.token')
```

Then choose one or both of the following CA's to set up.

### SmallStep Acme CA

[StepCA](https://github.com/smallstep/certificates) is SmallSteps's test CA server.

- ✅ HTTP Validation
- ✅ DNS Validation

Create a Certificate Authority that points to the Step CA:

```bash
curl --request POST \
  --url http://127.0.0.1:3081/api/certificate-authorities \
  --header "Authorization: Bearer ${NPM_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data '{
    "name": "Step CA",
    "acmesh_server": "https://ca.internal/acme/acme/directory",
    "ca_bundle": "/etc/ssl/certs/NginxProxyManager.crt",
    "max_domains": 2
}'
```

### Pebble Test Acme CA

[Pebble](https://github.com/letsencrypt/pebble) is Let's Encrypt's own test CA server.

- ✅ HTTP Validation
- ❌ DNS Validation

Create a Certificate Authority that points to the Pebble CA:

```bash
curl --request POST \
  --url http://127.0.0.1:3081/api/certificate-authorities \
  --header "Authorization: Bearer ${NPM_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data '{
    "name": "Pebble CA",
    "acmesh_server": "https://pebble/dir",
    "ca_bundle": "/etc/ssl/certs/pebble.minica.pem",
    "max_domains": 2
}'
```
