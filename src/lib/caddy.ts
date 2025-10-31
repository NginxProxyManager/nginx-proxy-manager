import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import db, { nowIso } from "./db";
import { config } from "./config";
import { getCloudflareSettings, setSetting } from "./settings";

const CERTS_DIR = process.env.CERTS_DIRECTORY || join(process.cwd(), "data", "certs");
mkdirSync(CERTS_DIR, { recursive: true });

type ProxyHostRow = {
  id: number;
  name: string;
  domains: string;
  upstreams: string;
  certificate_id: number | null;
  access_list_id: number | null;
  ssl_forced: number;
  hsts_enabled: number;
  hsts_subdomains: number;
  allow_websocket: number;
  preserve_host_header: number;
  skip_https_hostname_validation: number;
  meta: string | null;
  enabled: number;
};

type RedirectHostRow = {
  id: number;
  name: string;
  domains: string;
  destination: string;
  status_code: number;
  preserve_query: number;
  enabled: number;
};

type DeadHostRow = {
  id: number;
  name: string;
  domains: string;
  status_code: number;
  response_body: string | null;
  enabled: number;
};

type StreamHostRow = {
  id: number;
  name: string;
  listen_port: number;
  protocol: string;
  upstream: string;
  enabled: number;
};

type AccessListEntryRow = {
  access_list_id: number;
  username: string;
  password_hash: string;
};

type CertificateRow = {
  id: number;
  name: string;
  type: string;
  domain_names: string;
  certificate_pem: string | null;
  private_key_pem: string | null;
  auto_renew: number;
  provider_options: string | null;
};

type CaddyHttpRoute = Record<string, unknown>;

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn("Failed to parse JSON value", value, error);
    return fallback;
  }
}

function writeCertificateFiles(cert: CertificateRow) {
  if (cert.type !== "imported" || !cert.certificate_pem || !cert.private_key_pem) {
    return null;
  }
  const certPath = join(CERTS_DIR, `certificate-${cert.id}.pem`);
  const keyPath = join(CERTS_DIR, `certificate-${cert.id}.key.pem`);
  writeFileSync(certPath, cert.certificate_pem, { encoding: "utf-8" });
  writeFileSync(keyPath, cert.private_key_pem, { encoding: "utf-8" });
  return { certificate_file: certPath, key_file: keyPath };
}

function buildProxyRoutes(
  rows: ProxyHostRow[],
  certificates: Map<number, CertificateRow>,
  accessAccounts: Map<number, AccessListEntryRow[]>
): CaddyHttpRoute[] {
  const routes: CaddyHttpRoute[] = [];

  for (const row of rows) {
    if (!row.enabled) {
      continue;
    }

    const domains = parseJson<string[]>(row.domains, []);
    if (domains.length === 0) {
      continue;
    }
    const upstreams = parseJson<string[]>(row.upstreams, []);
    if (upstreams.length === 0) {
      continue;
    }

    const handlers: Record<string, unknown>[] = [];

    if (row.hsts_enabled) {
      const value = row.hsts_subdomains ? "max-age=63072000; includeSubDomains" : "max-age=63072000";
      handlers.push({
        handler: "headers",
        response: {
          set: {
            "Strict-Transport-Security": [value]
          }
        }
      });
    }

    if (row.access_list_id) {
      const accounts = accessAccounts.get(row.access_list_id) ?? [];
      if (accounts.length > 0) {
        handlers.push({
          handler: "authentication",
          providers: {
            http_basic: {
              accounts: accounts.map((entry) => ({
                username: entry.username,
                password: entry.password_hash
              }))
            }
          }
        });
      }
    }

    handlers.push({
      handler: "reverse_proxy",
      upstreams: upstreams.map((dial) => ({ dial })),
      preserve_host: Boolean(row.preserve_host_header),
      ...(row.skip_https_hostname_validation
        ? {
            transport: {
              http: {
                tls: {
                  insecure_skip_verify: true
                }
              }
            }
          }
        : {})
    });

    const route: CaddyHttpRoute = {
      match: [
        {
          host: domains
        }
      ],
      handle: handlers,
      terminal: true
    };

    if (row.certificate_id) {
      const cert = certificates.get(row.certificate_id);
      if (cert) {
        const files = writeCertificateFiles(cert);
        if (files) {
          (route as Record<string, unknown>).tls = {
            certificates: [
              {
                certificate_file: files.certificate_file,
                key_file: files.key_file
              }
            ]
          };
        }
      }
    }

    routes.push(route);
  }

  return routes;
}

function buildRedirectRoutes(rows: RedirectHostRow[]): CaddyHttpRoute[] {
  return rows
    .filter((row) => Boolean(row.enabled))
    .map((row) => {
      const domains = parseJson<string[]>(row.domains, []);
      const preserveQuery = Boolean(row.preserve_query);
      const location = preserveQuery ? `${row.destination}{uri}` : row.destination;
      return {
        match: [{ host: domains }],
        handle: [
          {
            handler: "static_response",
            status_code: row.status_code,
            headers: {
              Location: [location],
              "Strict-Transport-Security": ["max-age=63072000"]
            }
          }
        ],
        terminal: true
      };
    });
}

function buildDeadRoutes(rows: DeadHostRow[]): CaddyHttpRoute[] {
  return rows
    .filter((row) => Boolean(row.enabled))
    .map((row) => ({
      match: [{ host: parseJson<string[]>(row.domains, []) }],
      handle: [
        {
          handler: "static_response",
          status_code: row.status_code,
          body: row.response_body ?? "Service unavailable",
          headers: {
            "Strict-Transport-Security": ["max-age=63072000"]
          }
        }
      ],
      terminal: true
    }));
}

function buildStreamServers(rows: StreamHostRow[]) {
  if (rows.length === 0) {
    return undefined;
  }

  const servers: Record<string, unknown> = {};
  for (const row of rows) {
    if (!row.enabled) {
      continue;
    }
    const key = `stream_${row.id}`;
    servers[key] = {
      listen: [`:${row.listen_port}`],
      routes: [
        {
          match: [
            {
              protocol: [row.protocol]
            }
          ],
          handle: [
            {
              handler: "proxy",
              upstreams: [{ dial: row.upstream }]
            }
          ]
        }
      ]
    };
  }
  if (Object.keys(servers).length === 0) {
    return undefined;
  }
  return servers;
}

function buildTlsAutomation(certificates: Map<number, CertificateRow>) {
  const managedDomains = new Set<string>();
  for (const cert of certificates.values()) {
    if (cert.type === "managed") {
      const domains = parseJson<string[]>(cert.domain_names, []);
      domains.forEach((domain) => managedDomains.add(domain));
    }
  }

  const cloudflare = getCloudflareSettings();
  if (!cloudflare) {
    return undefined;
  }

  const subjects = Array.from(managedDomains);
  if (subjects.length === 0) {
    return undefined;
  }

  return {
    automation: {
      policies: [
        {
          subjects,
          issuers: [
            {
              module: "acme",
              challenges: {
                dns: {
                  provider: {
                    name: "cloudflare",
                    api_token: cloudflare.apiToken
                  }
                }
              }
            }
          ]
        }
      ]
    }
  };
}

function buildCaddyDocument() {
  const proxyHosts = db
    .prepare(
      `SELECT id, name, domains, upstreams, certificate_id, access_list_id, ssl_forced, hsts_enabled,
              hsts_subdomains, allow_websocket, preserve_host_header, skip_https_hostname_validation, meta, enabled
       FROM proxy_hosts`
    )
    .all() as ProxyHostRow[];
  const redirectHosts = db
    .prepare(
      `SELECT id, name, domains, destination, status_code, preserve_query, enabled
       FROM redirect_hosts`
    )
    .all() as RedirectHostRow[];
  const deadHosts = db
    .prepare(
      `SELECT id, name, domains, status_code, response_body, enabled
       FROM dead_hosts`
    )
    .all() as DeadHostRow[];
  const streamHosts = db
    .prepare(
      `SELECT id, name, listen_port, protocol, upstream, enabled
       FROM stream_hosts`
    )
    .all() as StreamHostRow[];
  const certRows = db
    .prepare(
      `SELECT id, name, type, domain_names, certificate_pem, private_key_pem, auto_renew, provider_options
       FROM certificates`
    )
    .all() as CertificateRow[];

  const accessListEntries = db
    .prepare(
      `SELECT access_list_id, username, password_hash
       FROM access_list_entries`
    )
    .all() as AccessListEntryRow[];

  const certificateMap = new Map(certRows.map((cert) => [cert.id, cert]));
  const accessMap = accessListEntries.reduce<Map<number, AccessListEntryRow[]>>((map, entry) => {
    if (!map.has(entry.access_list_id)) {
      map.set(entry.access_list_id, []);
    }
    map.get(entry.access_list_id)!.push(entry);
    return map;
  }, new Map());

  const httpRoutes: CaddyHttpRoute[] = [
    ...buildProxyRoutes(proxyHosts, certificateMap, accessMap),
    ...buildRedirectRoutes(redirectHosts),
    ...buildDeadRoutes(deadHosts)
  ];

  const tlsSection = buildTlsAutomation(certificateMap);

  const httpApp =
    httpRoutes.length > 0
      ? {
          http: {
            servers: {
              cpm: {
                listen: [":80", ":443"],
                routes: httpRoutes
              }
            }
          }
        }
      : {};

  const layer4Servers = buildStreamServers(streamHosts);
  const layer4App = layer4Servers
    ? {
        layer4: {
          servers: layer4Servers
        }
      }
    : {};

  return {
    apps: {
      ...httpApp,
      ...(tlsSection ? { tls: tlsSection } : {}),
      ...layer4App
    }
  };
}

export async function applyCaddyConfig() {
  const document = buildCaddyDocument();
  const payload = JSON.stringify(document);
  const hash = crypto.createHash("sha256").update(payload).digest("hex");
  setSetting("caddy_config_hash", { hash, updated_at: nowIso() });

  try {
    const response = await fetch(`${config.caddyApiUrl}/load`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: payload
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Caddy config load failed: ${response.status} ${text}`);
    }
  } catch (error) {
    console.error("Failed to apply Caddy config", error);
    throw error;
  }
}
