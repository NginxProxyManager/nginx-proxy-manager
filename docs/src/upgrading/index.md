---
outline: deep
---

# Upgrading

This fork has an independent `1.x` release line. Do not switch the Compose image to
`jc21/nginx-proxy-manager`, and do not apply upstream version numbers as if they were releases of this project.

## Before upgrading

1. Check the target tag in the [fork's Docker Hub repository](https://hub.docker.com/r/moailaozi/nginx-proxy-manager/tags).
2. Read repository release notes or commit notes for the versions being crossed.
3. Stop configuration changes and back up both persistent mounts:
   - `/data`, including the SQLite database or database connection configuration
   - `/etc/letsencrypt`, including certificates and account material
4. If using MySQL/MariaDB or PostgreSQL, take a database-native backup as well.

## Upgrade procedure

Use a full version tag in `docker-compose.yml`, for example:

```yaml
image: docker.io/moailaozi/nginx-proxy-manager:1.4.0
```

Change it to the intended newer tag, then run:

```bash
docker compose pull
docker compose up -d
docker compose logs --tail=200 app
```

Wait for database migration and Nginx validation to complete. Then verify the UI version, proxy-host health, one HTTP
route, one HTTPS route and any critical stream/upstream routes.

## Database and configuration migrations

Database migrations run automatically when the backend starts. This fork also stores versioned Nginx configuration
artifacts. Legacy proxy-host options are normalized to the current schema where they can be represented safely; rows
that require review retain migration status/backup information instead of being silently discarded.

Product versions such as `1.4.0`, database migration filenames and Nginx configuration schema/profile versions are
separate version domains. Do not edit migration filenames or stored schema versions to match the product release.

## Rollback

Container rollback is safe only when the newer release did not migrate persistent data. Once a migration has run,
restore the pre-upgrade `/data` and database backup before starting the older image. Restoring only the old image while
keeping a newer database is unsupported.

The `latest` tag is convenient for testing but makes rollback and change review harder. Pin full versions in
production.
