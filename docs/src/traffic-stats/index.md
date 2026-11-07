---
outline: deep
---

# Traffic Statistics

Nginx Proxy Manager can turn the access logs it already writes for every host into
request statistics, and show them on the dashboard. It is **off by default**.

## Turning it on

An administrator can enable it under **Settings > Traffic Statistics**. When it is switched on
for the first time, all existing host access logs (including the rotated and compressed ones)
are imported, so the dashboard has history straight away. After that the logs are read as
new lines are written.

Switching it off stops reading the logs. The statistics already collected are kept, and
reading carries on from where it stopped if you switch it back on.

## What is collected

For every proxy, redirection, 404 and stream host, in 5 minute buckets:

- number of requests
- responses by class (2xx, 3xx, 4xx, 5xx)
- bytes sent

and, per hour, the busiest client IPs, request paths and (optionally) countries.
Stream hosts have no paths. Only the aggregated numbers are stored, never the log lines.

The dashboard shows a chart, totals, the busiest hosts and the lists above, with
1 hour to 30 day ranges. **Statistics** in a host's actions menu shows the same for just that host.
Users who can only see their own hosts only see the numbers for those hosts.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Keep history for (days) | 30 | Older data is deleted. Log lines older than this are skipped when importing. |
| Default dashboard range (hours) | 24 | The range shown when the dashboard opens. |
| Record client countries | off | See below. |
| Record exact status codes | off | See below. |
| InfluxDB | empty | See below. |

## Exact status codes

The dashboard always breaks responses down by class (2xx, 3xx, 4xx, 5xx). If you also switch on
**Record exact status codes**, each exact code (200, 404, 502 and so on) is counted per hour, and the
dashboard gains a **By status code** section with a card for each of the busiest codes.

- The per-code trends have hourly resolution, unlike the 5 minute class charts.
- Codes are only counted for log lines read after the setting is switched on.
- With InfluxDB storage they are written to their own measurement, see below.

## Client countries

When enabled, the country of each client IP is looked up in a local database. No IP address
leaves your server for this.

- If you put your own `.mmdb` country database (for example MaxMind GeoLite2) in `/data/geoip`, it is used.
- Otherwise the free [DB-IP Lite](https://db-ip.com) country database is downloaded into `/data/geoip`
  and refreshed monthly. It is licensed CC BY 4.0, which is why the dashboard links to DB-IP.

Countries are only recorded for log lines read after the setting is switched on.

## Storing the statistics in InfluxDB

By default the statistics are kept in Nginx Proxy Manager's own database. If you would rather graph
them in Grafana, fill in **all four** InfluxDB fields (URL, organization, bucket and an API token that
can write to and read from the bucket) and save. The statistics are then written to the
`npm_traffic` measurement of an InfluxDB 2.x bucket instead.

- Points are tagged with `host_type`, `host_id` and `host`, with the fields `requests`, `s2xx`, `s3xx`,
  `s4xx`, `s5xx` and `bytes`. Add up the fields over a time window to get totals.
- With **Record exact status codes** on, per-code counts are written to the `npm_traffic_status` measurement
  (tags `host_type`, `host_id`, `host` and `code`, field `hits`, one point per hour). The dashboard's
  per-code cards are read back from it.
- Retention is then controlled by the InfluxDB bucket, not by the setting above.
- Client IPs, paths and countries are not written to InfluxDB. As tags they would create an unbounded
  number of series.
- Switching storage re-imports the existing logs into the new place. Clear the fields to go back to the local database.
- The token is stored in the database and is never sent back to the browser.

## Notes

- Only the per-host access logs under `/data/logs` are read. `/data` must therefore be a persistent volume,
  which it already needs to be.
- The logs are read every 10 seconds. A busy proxy costs very little CPU, since only new bytes are parsed.
- The statistics tables are kept in the same database as everything else (SQLite, MySQL/MariaDB or Postgres).
- The API is documented as `GET /api/reports/traffic`.
