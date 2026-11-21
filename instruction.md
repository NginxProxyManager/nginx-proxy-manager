# Corrections to the Existing CrowdSec NPM Integration

The previous implementation is a starting point, but I want to change two important parts of its design. Modify the existing implementation rather than rebuilding the project from scratch.

## 1. Automatic updates from BOTH upstream projects

I want my custom NPM image to stay updated with changes from:

**Nginx Proxy Manager:**
https://github.com/NginxProxyManager/nginx-proxy-manager

**CrowdSec OpenResty Bouncer:**
https://github.com/crowdsecurity/cs-openresty-bouncer

Also track its Lua dependency:
https://github.com/crowdsecurity/lua-cs-bouncer

Requirements:

- Automatically check all three repositories for upstream changes.
- Track their stable branches and releases.
- Detect newly merged pull requests, commits, and releases.
- When upstream changes are available, update my fork's NPM code and the pinned CrowdSec components as appropriate.
- Preserve all custom CrowdSec integration changes.
- Create an update PR in my repository summarizing what changed upstream.
- Avoid duplicate update PRs.
- Automatically build and publish a new custom GHCR image after the update is accepted and merged.
- Allow manual triggering of update checks and builds.

I do not want to manually update commit hashes, release versions, or source archive checksums every time CrowdSec or NPM updates.

Use a safe update process. Do not consume arbitrary unmerged upstream PRs as production updates. Use merged upstream changes, and review proposed dependency/version changes before publishing.

The purpose is for my custom image to stay current with both projects without me manually maintaining their source versions.

## 2. Put ALL CrowdSec configuration in Docker Compose

This is especially important.

I do NOT want to create or mount a separate `.local` configuration file to configure CrowdSec.

I want to configure the entire bouncer through environment variables in my existing NPM Compose service.

That includes:

- Enable/disable bouncer.
- CrowdSec LAPI URL.
- CrowdSec bouncer API key.
- Authentication settings.
- Live or stream mode.
- Cache expiration.
- Update frequency.
- Remediation types.
- Fallback remediation.
- Request timeout.
- Internal request handling.
- SSL verification.
- AppSec settings.
- CAPTCHA settings, including provider and keys.
- Other supported options from the official bouncer configuration.

Inspect the actual pinned upstream bouncer configuration and expose its supported settings. Do not invent unsupported options.

Use clear, namespaced environment variables, for example:

- `CROWDSEC_ENABLED`
- `CROWDSEC_API_URL`
- `CROWDSEC_API_KEY`
- `CROWDSEC_MODE`
- `CROWDSEC_BOUNCING_ON_TYPE`
- `CROWDSEC_FALLBACK_REMEDIATION`

Map these variables to the exact configuration keys expected by the official bouncer.

### How configuration should work

At container startup:

1. Read the CrowdSec environment variables supplied through Docker Compose.
2. Generate `/etc/crowdsec/bouncers/crowdsec-openresty-bouncer.conf`.
3. Use sensible defaults for optional settings.
4. Keep credentials out of the Docker image itself.
5. Start NPM normally with the generated configuration.

Integrate this into NPM's existing startup lifecycle. Inspect its existing s6-overlay services and ensure the configuration is generated before Nginx starts.

Do not overwrite the configuration on every Nginx reload unnecessarily. It should be generated when the container starts.

The bouncer should default to disabled if `CROWDSEC_ENABLED` is not set or is false.

When enabled, it should use the supplied API URL and key.

Do not require:
- A `.local` configuration file.
- An additional bind mount for CrowdSec configuration.
- Manual editing inside the running container.
- Rebuilding the image to change CrowdSec settings.

### Expected Compose configuration

The final implementation should let me configure the NPM service approximately like this:

```yaml
services:
  npm:
    image: ghcr.io/OWNER/REPOSITORY:latest
    container_name: nginxproxymanager
    restart: unless-stopped

    environment:
      TZ: America/Denver

      CROWDSEC_ENABLED: "true"
      CROWDSEC_API_URL: "http://crowdsec:8080"
      CROWDSEC_API_KEY: "YOUR_BOUNCER_API_KEY"

      CROWDSEC_MODE: "live"
      CROWDSEC_BOUNCING_ON_TYPE: "all"
      CROWDSEC_FALLBACK_REMEDIATION: "ban"
      CROWDSEC_CACHE_EXPIRATION: "1"
      CROWDSEC_UPDATE_FREQUENCY: "10"
      CROWDSEC_REQUEST_TIMEOUT: "3000"
      CROWDSEC_SSL_VERIFY: "true"

    # Preserve the rest of my existing NPM Compose configuration.
```

This is an example of the desired interface, not a replacement for my existing Compose file.

Do not modify my actual server Compose deployment.

Make sure the environment variables are documented, including their defaults and accepted values.

Do not log or expose the API key in container logs.

## 3. Preserve the existing implementation

The current implementation already includes:

- CrowdSec bouncer v1.2.5.
- Lua CrowdSec bouncer v1.0.19.
- Vendored lua-resty-http v0.18.0.
- Custom Dockerfile at `docker/Dockerfile`.
- Nginx configuration at `docker/rootfs/etc/nginx/conf.d/crowdsec_openresty.conf`.
- Bouncer configuration at `docker/rootfs/etc/crowdsec/bouncers/crowdsec-openresty-bouncer.conf`.
- GHCR publishing workflow.
- `CROWDSEC.md`.

Inspect these files and preserve working functionality wherever possible.

Remove the requirement for the `.local` override approach and replace it with Compose environment-based configuration.

## 4. Validation

Verify that:

- The image still builds.
- All upstream dependencies are correctly installed.
- The generated configuration contains the correct values.
- The API key is not baked into the image.
- The container starts with CrowdSec disabled.
- The container starts with CrowdSec enabled and valid configuration.
- Missing optional environment variables receive sensible defaults.
- The Nginx configuration remains valid.
- Upstream update workflows preserve my custom changes.
- A successful update produces a new GHCR image.
- Existing NPM functionality is preserved.

Update `CROWDSEC.md` with the new Compose configuration and environment variable reference.

Do not commit, push, publish, or deploy anything without my approval.

## 5. Final report

Tell me:
- What files were modified.
- How updates from NPM and CrowdSec are detected.
- How the automatic rebuild and publishing process works.
- Every supported Compose environment variable and its default.
- How I configure the bouncer key and LAPI URL.
- What remains for me to do.

Make the actual changes rather than just describing them.