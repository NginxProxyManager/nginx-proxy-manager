---
outline: deep
---

# Fork Features

These capabilities describe this repository, not the upstream Nginx Proxy Manager release line.

## Managed proxy configuration

Proxy hosts use a structured, versioned Nginx configuration model. The editor exposes supported proxy directives,
normalizes values and rejects invalid or runtime-incompatible settings. Preview responses include the generated
configuration, effective values, source information, diagnostics and a short-lived token used to prevent publishing
stale previews.

The renderer keeps desired and applied configuration state separate. Publication validates the candidate and Nginx
configuration before it becomes active. Existing legacy rows are migrated conservatively and retain review/backup
metadata when automatic conversion is not safe.

## Upstream groups

The **Upstreams** page manages named collections of backend targets. A group can contain multiple servers and proxy
hosts can reference it instead of a single forwarding host/port. Reference checks prevent deleting an upstream that
is still in use. Upstream configuration can also be previewed and published.

## Proxy-host monitoring

Monitoring is configured per proxy host. Active monitoring runs scheduled HTTP probes; passive monitoring derives
signals from proxy access logs. The dashboard and proxy-host table expose normalized health state and recent metrics.
Monitoring storage includes retention controls so historical observations remain bounded.

## Live Nginx logs

Proxy, redirect, stream and dead-host tables can open a bounded log viewer. The backend reads only supported Nginx log
files and uses protected cursors for incremental updates. The viewer retains at most 10,000 lines or 2 MiB in the
browser.

## Compatibility boundaries

- Supported container architectures are `linux/amd64` and `linux/arm64`.
- The image is built and runtime-checked against the Nginx/OpenResty capability profile stored in this repository.
- Upstream images, release notes and update notifications are not compatibility guarantees for this fork.
- Directly editing generated files under `/data/nginx` can be overwritten by a later managed publication. Use custom
  include files documented under [Advanced Configuration](/advanced-config/) for persistent manual snippets.
