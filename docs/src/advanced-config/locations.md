---
outline: deep
---

# Host Status and Nginx Errors

NPM checks every host config with nginx before it goes live. This page explains what happens when nginx rejects a
host, what the host statuses in the UI mean, and how one broken host config is kept from stopping nginx at startup.

## When nginx rejects a host

If nginx rejects the configuration of the host itself, for example because of an error in the host's advanced
configuration, the save fails with an error that names the problem and its line. **The previous configuration stays
active**, and so do the host's previous settings:

- a new host isn't created
- a change to an existing host isn't saved
- a host you try to enable stays disabled (when only the final nginx reload fails, the new config is in place and the
  host stays enabled)

When a new host asks for a new Let's Encrypt certificate, NPM first checks that nginx accepts the host without SSL.
If it doesn't, the host is not created and no certificate is requested, so a failed attempt doesn't leave an unused
certificate behind (and doesn't count against Let's Encrypt's rate limits).

The API answers `400` with the details:

```json
{
  "error": {
    "code": 400,
    "message": "Advanced configuration: unknown directive \"proxy_passs\" (line 3).",
    "details": {
      "kind": "nginx_config",
      "scope": "host",
      "host_type": "proxy_host",
      "host_id": 12,
      "file": "/data/nginx/proxy_host/12.conf",
      "line": 31,
      "nginx_output": "nginx: [emerg] unknown directive \"proxy_passs\" in /data/nginx/proxy_host/12.conf:31",
      "hint": "Check the spelling of the directive. If it comes from an nginx module, that module may not be available.",
      "hint_code": "unknown_directive",
      "area": "host_advanced",
      "relative_line": 3,
      "detail": "Unknown directive \"proxy_passs\"."
    }
  }
}
```

`scope` is `host` when this host's own configuration was rejected, and `global` when a file NPM doesn't manage was
rejected, for example one of your [custom configuration files](/advanced-config/#custom-nginx-configurations).

`message` is English. The UI words the error in its own language from the other fields: `area` and `relative_line`
say where it is (`host_advanced`: the host's advanced configuration), `reason` marks special cases (`conflict`,
`regenerated_conflict`, `too_many_broken_hosts`, `redacted`), `detail` is the humanised nginx error on its own and
`hint_code` names the hint. `detail` is shown as it is, it is not translated.

### Other broken hosts

nginx always checks the whole configuration. When the config file of *another* host breaks the check, for example
because a certificate file was deleted, NPM no longer refuses every change. NPM first checks the configuration again
without the host being saved. If the other host's file passes then, the change being saved is at fault (for example
the same `listen ... default_server` as another host, which nginx reports at the second definition, or an `include`
of another host's file): the save fails with scope `host` and the other host is not touched. Only a host whose file
fails on its own is repaired or taken out:

- an enabled host is regenerated from the database first (without a reload). That fixes files written by older
  versions and files that were changed behind NPM's back.
- only if the regenerated config still fails at host level (or the host is disabled), its file is moved to
  `<id>.conf.err` (which nginx ignores) and the host is shown as offline, with `nginx_err` starting with
  `Disabled automatically:`

Some errors don't name a config file at all, for example
`open() "/data/logs/proxy-host-5_access.log" failed (13: Permission denied)` or a missing certificate. Such an error
is blamed on the host being saved when its new config mentions the path. Otherwise the candidates are the hosts
whose config mentions the path (any directive). A mention alone is never enough: a candidate is only repaired or
taken out when the check still fails without the host being saved, **and** the error goes away when the candidate is
taken out as well. When several hosts mention the path, for example hosts that share a certificate that went
missing, and no single one of them makes the error go away, they are taken out together: if the error goes away
then, each of them is regenerated and, if it still fails, taken out. If nothing passes that test, the save fails
with scope `global`.

Regenerating another host never disables it because of the change being saved: when the regenerated config only
fails together with the new config of the host being saved (for example both claim `listen ... default_server`),
the save fails with scope `host` as a conflict and the other host keeps its file.

At most 10 rounds of repairs run per save or reload (each one blocks other saves while it runs). After that the
save fails with scope `global` and the message `Too many broken host configs to repair in one go`: regenerate all
host configs (Settings > Nginx Configuration, restart NPM, or run `backend/scripts/regenerate-config` in the container), then try again.

Save the affected host again once the cause is fixed.

### File directives in advanced configuration

Advanced configuration is trusted nginx configuration. Whoever may edit a host's advanced configuration can do
anything nginx and its modules can (Lua, `proxy_store`, ...), so only give that
permission to people you trust with the whole proxy. NPM checks a few file directives to catch accidental and
obvious damage to other hosts. **This check is not a security boundary.**

These are rejected with `400` (a validation error naming the directive):

- `access_log` / `error_log` writing into a configuration file nginx reads: any file in `/data/nginx/proxy_host/`,
  `redirection_host/`, `dead_host/`, `stream/`, `default_host/` or `temp/`, any `.conf` file elsewhere in
  `/data/nginx/` (for example `/data/nginx/custom/http.conf`), anything in `/etc/nginx/conf.d/`, and `.conf`,
  `.types` or `*_params` files in `/etc/nginx/`.
- `include` of a file in one of the generated directories above, also through a wildcard
  (`/data/nginx/*/1.conf`, `/data/nginx/proxy_hos[t]/1.conf`).
- For both: paths through `/proc/` or `/dev/fd/` (for example `/proc/self/root/...`), and in `access_log` a path
  whose fixed part before a variable could still lead to one of the files above (`/data/nginx/$name`).
- `access_log` paths that end with a variable when the fixed part is in `/data/nginx/` or `/etc/nginx/` or ends
  with `/` (`/data/nginx/custom/$http_x`, `/data/logs/$http_x`). Variables are filled in from the request and
  nginx doesn't strip `/` or `..` from them, so any client could pick the file: a header such as
  `X: /../proxy_host/1.conf` would append log lines to another host's config. Give the path a fixed ending
  instead, for example `/data/logs/$host.log`.
- `access_log` paths with a variable from the request (`$http_*`, `$arg_*`, `$cookie_*`, `$uri`, `$args`, regex
  captures such as `$1`, ...: anything but `$host`, `$server_name`, `$server_port`, `$server_addr`, `$remote_addr`,
  `$remote_port`, `$scheme`, `$status`, `$request_method`, `$msec`, `$pid` and `$connection`) that start with it
  (`$http_x`, `$http_x.log`, `$host$http_x`), don't end with a fixed file name extension after it
  (`/data/logs$http_x`, `/data/logs/$http_x.d/access`, `/data/logs/$http_x.conf`, `/data/logs/$http_x.npm-aside`), or have `..` after a
  variable. A variable that is `set` in the same advanced configuration counts as each value it is set to
  (`set $log /data/logs/$host.log; access_log $log;` is fine, `set $log $http_x; access_log $log;` is not); any
  other variable counts as one the request fills in.

Allowed are, for example: logs in `/data/logs/` or `/data/nginx/custom/*.log`, relative log paths such as
`logs/custom.log` (nginx resolves them in `/etc/nginx/nginx/`), `off`, `stderr`, `syslog:`, `/dev/stdout`,
`/data/logs/$http_x.log`, `root`, `alias` and `include` of your own snippets (`/data/nginx/custom/*.conf`,
`/snippets/*.conf`, `conf.d/include/*.conf`).

The directives are read the way nginx reads them: a quote or `#` in the middle of a word (`a"b`, `/#/x`) does not
start a string or a comment. The exception are `*_by_lua_block` bodies, which ngx_lua reads as Lua: a quote in a
Lua comment there can hide the directives after the block from this check. Hosts saved earlier keep working; the check runs when a host is created or saved.

## Status in the API

Every host type (proxy, redirection, 404 and stream) has these server-owned keys in `meta`. NPM ignores them in
requests and sets them when it writes the host's config:

| Key | Description |
| --- | --- |
| `nginx_online` | `false` only when the host's config is not active in nginx |
| `nginx_err` | Why the host is offline, otherwise `null` |
| `nginx_details` | The structured details of the failure (same shape as `error.details` above), otherwise `null` |
| `nginx_checked_at` | When the config was last written |

## Startup

Three steps keep one broken host from stopping nginx, every site, and the admin UI, when the container starts:

1. Before nginx starts, the container checks the configuration with `nginx -t`, as the user nginx runs as
   (`PUID`/`PGID`). It moves the host config file named in the error (warnings don't count) to `<id>.conf.err` and
   checks again, until nginx accepts the configuration. An error that names no config file, such as a missing
   certificate or a log file nginx can't open, is blamed on a host whose config mentions that file only if moving
   that host's config aside makes the error go away (each candidate is tried in turn, the others are put back; when
   none helps alone, all of them are tried together and, if that helps, all are moved to `.err`). This never stops
   the container from starting. Files left as `<id>.conf.npm-aside` by an interrupted check are put back first (or
   deleted when the `.conf` exists).
2. A few seconds after the backend is up, it regenerates host configs that are missing or were moved to `.err`. Then
   it reloads nginx once. Hosts that still fail are shown as offline with the reason.
3. Right after a host reboot, upstream containers may not be resolvable yet. Hosts that end offline because nginx
   could not find an upstream host (`host not found in upstream`, typical for streams) are tried again after 30
   seconds, 2 minutes and 5 minutes. A host that still fails after that stays offline until it is saved again.

To skip the second step:

```yml
    environment:
      NPM_RECONCILE_ON_START: 'false'
```

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `NPM_RECONCILE_ON_START` | `true` | Regenerate missing or broken host configs after the backend starts. When `false`, hosts whose config the startup check moved to `.err` are only shown as offline; save such a host again to bring it back. |
