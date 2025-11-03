import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import prisma, { nowIso } from "./db";
import { config } from "./config";
import { getCloudflareSettings, getGeneralSettings, setSetting } from "./settings";

const CERTS_DIR = process.env.CERTS_DIRECTORY || join(process.cwd(), "data", "certs");
mkdirSync(CERTS_DIR, { recursive: true, mode: 0o700 });
try {
  chmodSync(CERTS_DIR, 0o700);
} catch (error) {
  console.warn("Unable to enforce restrictive permissions on certificate directory:", error);
}

const DEFAULT_AUTHENTIK_HEADERS = [
  "X-Authentik-Username",
  "X-Authentik-Groups",
  "X-Authentik-Entitlements",
  "X-Authentik-Email",
  "X-Authentik-Name",
  "X-Authentik-Uid",
  "X-Authentik-Jwt",
  "X-Authentik-Meta-Jwks",
  "X-Authentik-Meta-Outpost",
  "X-Authentik-Meta-Provider",
  "X-Authentik-Meta-App",
  "X-Authentik-Meta-Version"
];

const DEFAULT_AUTHENTIK_TRUSTED_PROXIES = ["private_ranges"];

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

type ProxyHostMeta = {
  custom_reverse_proxy_json?: string;
  custom_pre_handlers_json?: string;
  authentik?: ProxyHostAuthentikMeta;
};

type ProxyHostAuthentikMeta = {
  enabled?: boolean;
  outpost_domain?: string;
  outpost_upstream?: string;
  auth_endpoint?: string;
  copy_headers?: string[];
  trusted_proxies?: string[];
  set_outpost_host_header?: boolean;
};

type AuthentikRouteConfig = {
  enabled: boolean;
  outpostDomain: string;
  outpostUpstream: string;
  authEndpoint: string;
  copyHeaders: string[];
  trustedProxies: string[];
  setOutpostHostHeader: boolean;
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

type CertificateUsage = {
  certificate: CertificateRow;
  domains: Set<string>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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

function parseOptionalJson(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn("Failed to parse custom JSON", error);
    return null;
  }
}

function mergeDeep(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      mergeDeep(existing, value);
    } else {
      target[key] = value;
    }
  }
}

function parseCustomHandlers(value: string | null | undefined): Record<string, unknown>[] {
  const parsed = parseOptionalJson(value);
  if (!parsed) {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const handlers: Record<string, unknown>[] = [];
  for (const item of list) {
    if (isPlainObject(item)) {
      handlers.push(item);
    } else {
      console.warn("Ignoring custom handler entry that is not an object", item);
    }
  }
  return handlers;
}

function writeCertificateFiles(cert: CertificateRow) {
  if (cert.type !== "imported" || !cert.certificate_pem || !cert.private_key_pem) {
    return null;
  }
  const certPath = join(CERTS_DIR, `certificate-${cert.id}.pem`);
  const keyPath = join(CERTS_DIR, `certificate-${cert.id}.key.pem`);
  writeFileSync(certPath, cert.certificate_pem, { encoding: "utf-8", mode: 0o600 });
  writeFileSync(keyPath, cert.private_key_pem, { encoding: "utf-8", mode: 0o600 });
  try {
    chmodSync(certPath, 0o600);
    chmodSync(keyPath, 0o600);
  } catch (error) {
    console.warn("Unable to enforce restrictive permissions on certificate files:", error);
  }
  return { certificate_file: certPath, key_file: keyPath };
}

function collectCertificateUsage(rows: ProxyHostRow[], certificates: Map<number, CertificateRow>) {
  const usage = new Map<number, CertificateUsage>();

  for (const row of rows) {
    if (!row.enabled || !row.certificate_id) {
      continue;
    }

    const cert = certificates.get(row.certificate_id);
    if (!cert) {
      continue;
    }

    const domains = parseJson<string[]>(row.domains, []).map((domain) => domain?.trim().toLowerCase());
    const filteredDomains = domains.filter((domain): domain is string => Boolean(domain));
    if (filteredDomains.length === 0) {
      continue;
    }

    if (!usage.has(cert.id)) {
      usage.set(cert.id, {
        certificate: cert,
        domains: new Set()
      });
    }

    const entry = usage.get(cert.id)!;
    for (const domain of filteredDomains) {
      entry.domains.add(domain);
    }
  }

  return usage;
}

function buildProxyRoutes(
  rows: ProxyHostRow[],
  accessAccounts: Map<number, AccessListEntryRow[]>,
  tlsReadyCertificates: Set<number>
): CaddyHttpRoute[] {
  const routes: CaddyHttpRoute[] = [];

  for (const row of rows) {
    if (!row.enabled) {
      continue;
    }

    if (!row.certificate_id || !tlsReadyCertificates.has(row.certificate_id)) {
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
    const meta = parseJson<ProxyHostMeta>(row.meta, {});
    const authentik = parseAuthentikConfig(meta.authentik);
    const hostRoutes: CaddyHttpRoute[] = [];

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

    if (row.ssl_forced) {
      hostRoutes.push({
        match: [
          {
            host: domains,
            expression: '{http.request.scheme} == "http"'
          }
        ],
        handle: [
          {
            handler: "static_response",
            status_code: 308,
            headers: {
              Location: ["https://{http.request.host}{http.request.uri}"]
            }
          }
        ],
        terminal: true
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

    // Parse upstream URLs to extract host:port for Caddy's dial field
    const parsedUpstreams = upstreams.map((upstream) => {
      try {
        const url = new URL(upstream);
        // Use default ports if not specified: 443 for https, 80 for http
        const port = url.port || (url.protocol === "https:" ? "443" : "80");
        const dial = `${url.hostname}:${port}`;
        return { dial };
      } catch {
        // If URL parsing fails, use the upstream as-is
        return { dial: upstream };
      }
    });

    const hasHttpsUpstream = upstreams.some((upstream) => upstream.startsWith("https://"));

    const reverseProxyHandler: Record<string, unknown> = {
      handler: "reverse_proxy",
      upstreams: parsedUpstreams
    };

    if (authentik) {
      const outpostHandler: Record<string, unknown> = {
        handler: "reverse_proxy",
        upstreams: [
          {
            dial: authentik.outpostUpstream
          }
        ]
      };

      if (authentik.setOutpostHostHeader) {
        outpostHandler.headers = {
          request: {
            set: {
              Host: ["{http.reverse_proxy.upstream.host}"]
            }
          }
        };
      }

      hostRoutes.push({
        match: [
          {
            host: domains,
            path: [`/${authentik.outpostDomain}/*`]
          }
        ],
        handle: [outpostHandler],
        terminal: true
      });
    }

    if (row.preserve_host_header) {
      reverseProxyHandler.headers = {
        request: {
          set: {
            Host: ["{http.request.host}"]
          }
        }
      };
    }

    // Configure TLS transport for HTTPS upstreams
    if (hasHttpsUpstream) {
      reverseProxyHandler.transport = {
        protocol: "http",
        tls: row.skip_https_hostname_validation
          ? {
              insecure_skip_verify: true
            }
          : {}
      };
    }

    const customReverseProxy = parseOptionalJson(meta.custom_reverse_proxy_json);
    if (customReverseProxy) {
      if (isPlainObject(customReverseProxy)) {
        mergeDeep(reverseProxyHandler, customReverseProxy as Record<string, unknown>);
      } else {
        console.warn("Ignoring custom reverse proxy JSON because it is not an object", customReverseProxy);
      }
    }

    const customHandlers = parseCustomHandlers(meta.custom_pre_handlers_json);
    if (customHandlers.length > 0) {
      handlers.push(...customHandlers);
    }

    if (authentik) {
      handlers.push({
        handler: "forward_auth",
        upstreams: [
          {
            dial: authentik.outpostUpstream
          }
        ],
        uri: authentik.authEndpoint,
        copy_headers: authentik.copyHeaders,
        trusted_proxies: authentik.trustedProxies
      });
    }

    handlers.push(reverseProxyHandler);

    const route: CaddyHttpRoute = {
      match: [
        {
          host: domains
        }
      ],
      handle: handlers,
      terminal: true
    };

    hostRoutes.push(route);
    routes.push(...hostRoutes);
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

function buildTlsConnectionPolicies(
  usage: Map<number, CertificateUsage>,
  managedCertificatesWithAutomation: Set<number>
) {
  const policies: Record<string, unknown>[] = [];
  const readyCertificates = new Set<number>();

  for (const [id, entry] of usage.entries()) {
    const domains = Array.from(entry.domains);
    if (domains.length === 0) {
      continue;
    }

    if (entry.certificate.type === "imported") {
      const files = writeCertificateFiles(entry.certificate);
      if (!files) {
        continue;
      }
      policies.push({
        match: {
          sni: domains
        },
        certificates: [files]
      });
      readyCertificates.add(id);
      continue;
    }

    if (entry.certificate.type === "managed") {
      if (!managedCertificatesWithAutomation.has(id)) {
        continue;
      }
      policies.push({
        match: {
          sni: domains
        }
      });
      readyCertificates.add(id);
    }
  }

  return {
    policies,
    readyCertificates
  };
}

async function buildTlsAutomation(
  usage: Map<number, CertificateUsage>,
  options: { acmeEmail?: string }
) {
  const managedEntries = Array.from(usage.values()).filter(
    (entry) => entry.certificate.type === "managed" && Boolean(entry.certificate.auto_renew)
  );

  if (managedEntries.length === 0) {
    return {
      managedCertificateIds: new Set<number>()
    };
  }

  const cloudflare = await getCloudflareSettings();
  const hasCloudflare = cloudflare && cloudflare.apiToken;

  const managedCertificateIds = new Set<number>();
  const policies: Record<string, unknown>[] = [];

  for (const entry of managedEntries) {
    const subjects = Array.from(entry.domains);
    if (subjects.length === 0) {
      continue;
    }

    managedCertificateIds.add(entry.certificate.id);

    // Build issuer configuration
    const issuer: Record<string, unknown> = {
      module: "acme"
    };

    if (options.acmeEmail) {
      issuer.email = options.acmeEmail;
    }

    // Use DNS-01 challenge if Cloudflare is configured, otherwise use HTTP-01
    if (hasCloudflare) {
      // The caddy-dns/cloudflare module only accepts api_token
      // See: https://github.com/caddy-dns/cloudflare
      const providerConfig: Record<string, string> = {
        name: "cloudflare",
        api_token: cloudflare.apiToken
      };
      // Note: zone_id and account_id are not supported by caddy-dns/cloudflare module

      issuer.challenges = {
        dns: {
          provider: providerConfig
        }
      };
    }
    // If no Cloudflare, Caddy will use HTTP-01 challenge by default

    policies.push({
      subjects,
      issuers: [issuer]
    });
  }

  if (policies.length === 0) {
    return {
      managedCertificateIds
    };
  }

  return {
    tlsApp: {
      automation: {
        policies
      }
    },
    managedCertificateIds
  };
}

async function buildCaddyDocument() {
  const [proxyHosts, redirectHosts, deadHosts, certRows, accessListEntries] = await Promise.all([
    prisma.proxyHost.findMany({
      select: {
        id: true,
        name: true,
        domains: true,
        upstreams: true,
        certificateId: true,
        accessListId: true,
        sslForced: true,
        hstsEnabled: true,
        hstsSubdomains: true,
        allowWebsocket: true,
        preserveHostHeader: true,
        skipHttpsHostnameValidation: true,
        meta: true,
        enabled: true
      }
    }),
    prisma.redirectHost.findMany({
      select: {
        id: true,
        name: true,
        domains: true,
        destination: true,
        statusCode: true,
        preserveQuery: true,
        enabled: true
      }
    }),
    prisma.deadHost.findMany({
      select: {
        id: true,
        name: true,
        domains: true,
        statusCode: true,
        responseBody: true,
        enabled: true
      }
    }),
    prisma.certificate.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        domainNames: true,
        certificatePem: true,
        privateKeyPem: true,
        autoRenew: true,
        providerOptions: true
      }
    }),
    prisma.accessListEntry.findMany({
      select: {
        accessListId: true,
        username: true,
        passwordHash: true
      }
    })
  ]);

  // Map Prisma results to expected types
  const proxyHostRows: ProxyHostRow[] = proxyHosts.map((h: typeof proxyHosts[0]) => ({
    id: h.id,
    name: h.name,
    domains: h.domains,
    upstreams: h.upstreams,
    certificate_id: h.certificateId,
    access_list_id: h.accessListId,
    ssl_forced: h.sslForced ? 1 : 0,
    hsts_enabled: h.hstsEnabled ? 1 : 0,
    hsts_subdomains: h.hstsSubdomains ? 1 : 0,
    allow_websocket: h.allowWebsocket ? 1 : 0,
    preserve_host_header: h.preserveHostHeader ? 1 : 0,
    skip_https_hostname_validation: h.skipHttpsHostnameValidation ? 1 : 0,
    meta: h.meta,
    enabled: h.enabled ? 1 : 0
  }));

  const redirectHostRows: RedirectHostRow[] = redirectHosts.map((h: typeof redirectHosts[0]) => ({
    id: h.id,
    name: h.name,
    domains: h.domains,
    destination: h.destination,
    status_code: h.statusCode,
    preserve_query: h.preserveQuery ? 1 : 0,
    enabled: h.enabled ? 1 : 0
  }));

  const deadHostRows: DeadHostRow[] = deadHosts.map((h: typeof deadHosts[0]) => ({
    id: h.id,
    name: h.name,
    domains: h.domains,
    status_code: h.statusCode,
    response_body: h.responseBody,
    enabled: h.enabled ? 1 : 0
  }));

  const certRowsMapped: CertificateRow[] = certRows.map((c: typeof certRows[0]) => ({
    id: c.id,
    name: c.name,
    type: c.type as "managed" | "imported",
    domain_names: c.domainNames,
    certificate_pem: c.certificatePem,
    private_key_pem: c.privateKeyPem,
    auto_renew: c.autoRenew ? 1 : 0,
    provider_options: c.providerOptions
  }));

  const accessListEntryRows: AccessListEntryRow[] = accessListEntries.map((e: typeof accessListEntries[0]) => ({
    access_list_id: e.accessListId,
    username: e.username,
    password_hash: e.passwordHash
  }));

  const certificateMap = new Map(certRowsMapped.map((cert) => [cert.id, cert]));
  const accessMap = accessListEntryRows.reduce<Map<number, AccessListEntryRow[]>>((map, entry) => {
    if (!map.has(entry.access_list_id)) {
      map.set(entry.access_list_id, []);
    }
    map.get(entry.access_list_id)!.push(entry);
    return map;
  }, new Map());

  const certificateUsage = collectCertificateUsage(proxyHostRows, certificateMap);
  const generalSettings = await getGeneralSettings();
  const { tlsApp, managedCertificateIds } = await buildTlsAutomation(certificateUsage, {
    acmeEmail: generalSettings?.acmeEmail
  });
  const { policies: tlsConnectionPolicies, readyCertificates } = buildTlsConnectionPolicies(
    certificateUsage,
    managedCertificateIds
  );

  const httpRoutes: CaddyHttpRoute[] = [
    ...buildProxyRoutes(proxyHostRows, accessMap, readyCertificates),
    ...buildRedirectRoutes(redirectHostRows),
    ...buildDeadRoutes(deadHostRows)
  ];

  const hasTls = tlsConnectionPolicies.length > 0;

  const httpApp =
    httpRoutes.length > 0
      ? {
          http: {
            servers: {
              cpm: {
                listen: hasTls ? [":80", ":443"] : [":80"],
                routes: httpRoutes,
                // Only disable automatic HTTPS if we have TLS automation policies
                // This allows Caddy to handle HTTP-01 challenges for managed certificates
                ...(tlsApp ? {} : { automatic_https: { disable: true } }),
                ...(hasTls ? { tls_connection_policies: tlsConnectionPolicies } : {})
              }
            }
          }
        }
      : {};

  return {
    admin: {
      listen: "0.0.0.0:2019"
    },
    apps: {
      ...httpApp,
      ...(tlsApp ? { tls: tlsApp } : {})
    }
  };
}

export async function applyCaddyConfig() {
  const document = await buildCaddyDocument();
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

    // Check if it's a fetch error with ECONNREFUSED or ENOTFOUND
    const err = error as { cause?: NodeJS.ErrnoException };
    const causeCode = err?.cause?.code;

    if (causeCode === "ENOTFOUND" || causeCode === "ECONNREFUSED") {
      throw new Error(`Unable to reach Caddy API at ${config.caddyApiUrl}. Ensure Caddy is running and accessible.`);
    }

    throw error;
  }
}

function parseAuthentikConfig(meta: ProxyHostAuthentikMeta | undefined | null): AuthentikRouteConfig | null {
  if (!meta || !meta.enabled) {
    return null;
  }

  const outpostDomain = typeof meta.outpost_domain === "string" ? meta.outpost_domain.trim() : "";
  const outpostUpstream = typeof meta.outpost_upstream === "string" ? meta.outpost_upstream.trim() : "";
  if (!outpostDomain || !outpostUpstream) {
    return null;
  }

  const authEndpointRaw = typeof meta.auth_endpoint === "string" ? meta.auth_endpoint.trim() : "";
  const authEndpoint = authEndpointRaw || `/${outpostDomain}/auth/caddy`;

  const copyHeaders =
    Array.isArray(meta.copy_headers) && meta.copy_headers.length > 0
      ? meta.copy_headers.map((header) => header?.trim()).filter((header): header is string => Boolean(header))
      : DEFAULT_AUTHENTIK_HEADERS;

  const trustedProxies =
    Array.isArray(meta.trusted_proxies) && meta.trusted_proxies.length > 0
      ? meta.trusted_proxies.map((item) => item?.trim()).filter((item): item is string => Boolean(item))
      : DEFAULT_AUTHENTIK_TRUSTED_PROXIES;

  const setOutpostHostHeader =
    meta.set_outpost_host_header !== undefined ? Boolean(meta.set_outpost_host_header) : true;

  return {
    enabled: true,
    outpostDomain,
    outpostUpstream,
    authEndpoint,
    copyHeaders,
    trustedProxies,
    setOutpostHostHeader
  };
}
