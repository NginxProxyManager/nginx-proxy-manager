# Real Nginx configuration verification

Run from `backend`:

```sh
npm run test:nginx-live
```

Requires a Linux Docker engine. The runner creates a disposable container with current backend sources and current Nginx configuration templates. It builds checksum-pinned OpenResty **1.31.1.1**, verifies the actual binary against the capability profile, starts local origins, and uses the production renderer, mirror validator and deployment coordinator. Nginx commands are not mocked. No application data volumes or host listening ports are used. Only the results directory is mounted; JSON results are written to `backend/coverage/nginx-live/results.json`. Failed assertions fail the command and the image publication quality gate.

`NPM_TEST_IMAGE` optionally selects the dependency base image. The installer still builds the pinned OpenResty version. The default base contains the application's Linux Node dependencies; the repository's current renderer and templates overwrite its application sources.

Coverage is measured as named request scenarios, not an inferred percentage of all possible Nginx behaviors. The suite distinguishes behavior assertions (routing, rewriting, access control, TLS, failure handling) from transport acceptance tests (a non-default tuning combination accepts and forwards a real request). Passing transport acceptance does not establish performance, disk-spill thresholds, TCP keepalive timing, or behavior under resource exhaustion.

The JSON report maps each of the 42 proxy catalog options to passing scenarios and their verification level. A final inventory assertion requires every catalog option to be explicitly configured and exercised by a real request; adding a catalog option without a test fails this assertion. Coverage also includes domain/port listeners, all five Location matching modes and three URI modes, all four upstream algorithms, disabled/down/backup behavior, HTTP/2, HTTPS and upstream certificate validation, WebSocket frames, HTTP trailers, caching, access rules, redirects, default sites, TCP/UDP, and deployment rejection/rollback.

The live suite exposed and now guards three renderer regressions: missing default Locations in redirect/dead hosts, escaped regex end anchors, and a shared HSTS map that let one host's subdomain policy affect another host. The golden fixture intentionally includes the host-specific HSTS variable.

The suite is separate from Node unit tests so an unavailable Docker engine cannot silently skip real-request verification. The runtime and source checksum are shared by production, development and integration Docker builds. Local verification reports its architecture; amd64 success does not establish arm64 behavior.
