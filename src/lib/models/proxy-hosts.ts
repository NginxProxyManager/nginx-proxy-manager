import prisma, { nowIso } from "../db";
import { applyCaddyConfig } from "../caddy";
import { logAuditEvent } from "../audit";

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

export type ProxyHostAuthentikConfig = {
  enabled: boolean;
  outpostDomain: string | null;
  outpostUpstream: string | null;
  authEndpoint: string | null;
  copyHeaders: string[];
  trustedProxies: string[];
  setOutpostHostHeader: boolean;
};

export type ProxyHostAuthentikInput = {
  enabled?: boolean;
  outpostDomain?: string | null;
  outpostUpstream?: string | null;
  authEndpoint?: string | null;
  copyHeaders?: string[] | null;
  trustedProxies?: string[] | null;
  setOutpostHostHeader?: boolean | null;
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

type ProxyHostMeta = {
  custom_reverse_proxy_json?: string;
  custom_pre_handlers_json?: string;
  authentik?: ProxyHostAuthentikMeta;
};

export type ProxyHost = {
  id: number;
  name: string;
  domains: string[];
  upstreams: string[];
  certificate_id: number | null;
  access_list_id: number | null;
  ssl_forced: boolean;
  hsts_enabled: boolean;
  hsts_subdomains: boolean;
  allow_websocket: boolean;
  preserve_host_header: boolean;
  skip_https_hostname_validation: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  custom_reverse_proxy_json: string | null;
  custom_pre_handlers_json: string | null;
  authentik: ProxyHostAuthentikConfig | null;
};

export type ProxyHostInput = {
  name: string;
  domains: string[];
  upstreams: string[];
  certificate_id?: number | null;
  access_list_id?: number | null;
  ssl_forced?: boolean;
  hsts_enabled?: boolean;
  hsts_subdomains?: boolean;
  allow_websocket?: boolean;
  preserve_host_header?: boolean;
  skip_https_hostname_validation?: boolean;
  enabled?: boolean;
  custom_reverse_proxy_json?: string | null;
  custom_pre_handlers_json?: string | null;
  authentik?: ProxyHostAuthentikInput | null;
};

type ProxyHostRow = {
  id: number;
  name: string;
  domains: string;
  upstreams: string;
  certificateId: number | null;
  accessListId: number | null;
  ownerUserId: number | null;
  sslForced: boolean;
  hstsEnabled: boolean;
  hstsSubdomains: boolean;
  allowWebsocket: boolean;
  preserveHostHeader: boolean;
  meta: string | null;
  skipHttpsHostnameValidation: boolean;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function normalizeMetaValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeAuthentikMeta(meta: ProxyHostAuthentikMeta | undefined): ProxyHostAuthentikMeta | undefined {
  if (!meta) {
    return undefined;
  }

  const normalized: ProxyHostAuthentikMeta = {};

  if (meta.enabled !== undefined) {
    normalized.enabled = Boolean(meta.enabled);
  }

  const domain = normalizeMetaValue(meta.outpost_domain ?? null);
  if (domain) {
    normalized.outpost_domain = domain;
  }

  const upstream = normalizeMetaValue(meta.outpost_upstream ?? null);
  if (upstream) {
    normalized.outpost_upstream = upstream;
  }

  const authEndpoint = normalizeMetaValue(meta.auth_endpoint ?? null);
  if (authEndpoint) {
    normalized.auth_endpoint = authEndpoint;
  }

  if (Array.isArray(meta.copy_headers)) {
    const headers = meta.copy_headers.map((header) => header?.trim()).filter((header): header is string => Boolean(header));
    if (headers.length > 0) {
      normalized.copy_headers = headers;
    }
  }

  if (Array.isArray(meta.trusted_proxies)) {
    const proxies = meta.trusted_proxies.map((proxy) => proxy?.trim()).filter((proxy): proxy is string => Boolean(proxy));
    if (proxies.length > 0) {
      normalized.trusted_proxies = proxies;
    }
  }

  if (meta.set_outpost_host_header !== undefined) {
    normalized.set_outpost_host_header = Boolean(meta.set_outpost_host_header);
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function serializeMeta(meta: ProxyHostMeta | null | undefined) {
  if (!meta) {
    return null;
  }
  const normalized: ProxyHostMeta = {};
  const reverse = normalizeMetaValue(meta.custom_reverse_proxy_json ?? null);
  const preHandlers = normalizeMetaValue(meta.custom_pre_handlers_json ?? null);

  if (reverse) {
    normalized.custom_reverse_proxy_json = reverse;
  }
  if (preHandlers) {
    normalized.custom_pre_handlers_json = preHandlers;
  }

  const authentik = sanitizeAuthentikMeta(meta.authentik);
  if (authentik) {
    normalized.authentik = authentik;
  }

  return Object.keys(normalized).length > 0 ? JSON.stringify(normalized) : null;
}

function parseMeta(value: string | null): ProxyHostMeta {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as ProxyHostMeta;
    return {
      custom_reverse_proxy_json: normalizeMetaValue(parsed.custom_reverse_proxy_json ?? null) ?? undefined,
      custom_pre_handlers_json: normalizeMetaValue(parsed.custom_pre_handlers_json ?? null) ?? undefined,
      authentik: sanitizeAuthentikMeta(parsed.authentik)
    };
  } catch (error) {
    console.warn("Failed to parse proxy host meta", error);
    return {};
  }
}

function normalizeAuthentikInput(
  input: ProxyHostAuthentikInput | null | undefined,
  existing: ProxyHostAuthentikMeta | undefined
): ProxyHostAuthentikMeta | undefined {
  if (input === undefined) {
    return existing;
  }
  if (input === null) {
    return undefined;
  }

  const next: ProxyHostAuthentikMeta = { ...(existing ?? {}) };

  if (input.enabled !== undefined) {
    next.enabled = Boolean(input.enabled);
  }

  if (input.outpostDomain !== undefined) {
    const domain = normalizeMetaValue(input.outpostDomain ?? null);
    if (domain) {
      next.outpost_domain = domain;
    } else {
      delete next.outpost_domain;
    }
  }

  if (input.outpostUpstream !== undefined) {
    const upstream = normalizeMetaValue(input.outpostUpstream ?? null);
    if (upstream) {
      next.outpost_upstream = upstream;
    } else {
      delete next.outpost_upstream;
    }
  }

  if (input.authEndpoint !== undefined) {
    const endpoint = normalizeMetaValue(input.authEndpoint ?? null);
    if (endpoint) {
      next.auth_endpoint = endpoint;
    } else {
      delete next.auth_endpoint;
    }
  }

  if (input.copyHeaders !== undefined) {
    const headers = (input.copyHeaders ?? [])
      .map((header) => header?.trim())
      .filter((header): header is string => Boolean(header));
    if (headers.length > 0) {
      next.copy_headers = headers;
    } else {
      delete next.copy_headers;
    }
  }

  if (input.trustedProxies !== undefined) {
    const proxies = (input.trustedProxies ?? [])
      .map((proxy) => proxy?.trim())
      .filter((proxy): proxy is string => Boolean(proxy));
    if (proxies.length > 0) {
      next.trusted_proxies = proxies;
    } else {
      delete next.trusted_proxies;
    }
  }

  if (input.setOutpostHostHeader !== undefined) {
    next.set_outpost_host_header = Boolean(input.setOutpostHostHeader);
  }

  if ((next.enabled ?? false) && next.outpost_domain && !next.auth_endpoint) {
    next.auth_endpoint = `/${next.outpost_domain}/auth/caddy`;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function buildMeta(existing: ProxyHostMeta, input: Partial<ProxyHostInput>): string | null {
  const next: ProxyHostMeta = { ...existing };

  if (input.custom_reverse_proxy_json !== undefined) {
    const reverse = normalizeMetaValue(input.custom_reverse_proxy_json ?? null);
    if (reverse) {
      next.custom_reverse_proxy_json = reverse;
    } else {
      delete next.custom_reverse_proxy_json;
    }
  }

  if (input.custom_pre_handlers_json !== undefined) {
    const pre = normalizeMetaValue(input.custom_pre_handlers_json ?? null);
    if (pre) {
      next.custom_pre_handlers_json = pre;
    } else {
      delete next.custom_pre_handlers_json;
    }
  }

  if (input.authentik !== undefined) {
    const authentik = normalizeAuthentikInput(input.authentik, existing.authentik);
    if (authentik) {
      next.authentik = authentik;
    } else {
      delete next.authentik;
    }
  }

  return serializeMeta(next);
}

function hydrateAuthentik(meta: ProxyHostAuthentikMeta | undefined): ProxyHostAuthentikConfig | null {
  if (!meta) {
    return null;
  }

  const enabled = Boolean(meta.enabled);
  const outpostDomain = normalizeMetaValue(meta.outpost_domain ?? null);
  const outpostUpstream = normalizeMetaValue(meta.outpost_upstream ?? null);
  const authEndpoint =
    normalizeMetaValue(meta.auth_endpoint ?? null) ?? (outpostDomain ? `/${outpostDomain}/auth/caddy` : null);
  const copyHeaders =
    Array.isArray(meta.copy_headers) && meta.copy_headers.length > 0 ? meta.copy_headers : DEFAULT_AUTHENTIK_HEADERS;
  const trustedProxies =
    Array.isArray(meta.trusted_proxies) && meta.trusted_proxies.length > 0
      ? meta.trusted_proxies
      : DEFAULT_AUTHENTIK_TRUSTED_PROXIES;
  const setOutpostHostHeader =
    meta.set_outpost_host_header !== undefined ? Boolean(meta.set_outpost_host_header) : true;

  return {
    enabled,
    outpostDomain,
    outpostUpstream,
    authEndpoint,
    copyHeaders,
    trustedProxies,
    setOutpostHostHeader
  };
}

function dehydrateAuthentik(config: ProxyHostAuthentikConfig | null): ProxyHostAuthentikMeta | undefined {
  if (!config) {
    return undefined;
  }

  const meta: ProxyHostAuthentikMeta = {
    enabled: config.enabled
  };

  if (config.outpostDomain) {
    meta.outpost_domain = config.outpostDomain;
  }
  if (config.outpostUpstream) {
    meta.outpost_upstream = config.outpostUpstream;
  }
  if (config.authEndpoint) {
    meta.auth_endpoint = config.authEndpoint;
  }
  if (config.copyHeaders.length > 0) {
    meta.copy_headers = [...config.copyHeaders];
  }
  if (config.trustedProxies.length > 0) {
    meta.trusted_proxies = [...config.trustedProxies];
  }
  meta.set_outpost_host_header = config.setOutpostHostHeader;

  return meta;
}

function parseProxyHost(row: ProxyHostRow): ProxyHost {
  const meta = parseMeta(row.meta ?? null);
  return {
    id: row.id,
    name: row.name,
    domains: JSON.parse(row.domains),
    upstreams: JSON.parse(row.upstreams),
    certificate_id: row.certificateId ?? null,
    access_list_id: row.accessListId ?? null,
    ssl_forced: row.sslForced,
    hsts_enabled: row.hstsEnabled,
    hsts_subdomains: row.hstsSubdomains,
    allow_websocket: row.allowWebsocket,
    preserve_host_header: row.preserveHostHeader,
    skip_https_hostname_validation: row.skipHttpsHostnameValidation,
    enabled: row.enabled,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    custom_reverse_proxy_json: meta.custom_reverse_proxy_json ?? null,
    custom_pre_handlers_json: meta.custom_pre_handlers_json ?? null,
    authentik: hydrateAuthentik(meta.authentik)
  };
}

export async function listProxyHosts(): Promise<ProxyHost[]> {
  const hosts = await prisma.proxyHost.findMany({
    orderBy: { createdAt: "desc" }
  });
  return hosts.map(parseProxyHost);
}

export async function createProxyHost(input: ProxyHostInput, actorUserId: number) {
  if (!input.domains || input.domains.length === 0) {
    throw new Error("At least one domain must be specified");
  }
  if (!input.upstreams || input.upstreams.length === 0) {
    throw new Error("At least one upstream must be specified");
  }

  const now = new Date(nowIso());
  const meta = buildMeta({}, input);
  const record = await prisma.proxyHost.create({
    data: {
      name: input.name.trim(),
      domains: JSON.stringify(Array.from(new Set(input.domains.map((d) => d.trim().toLowerCase())))),
      upstreams: JSON.stringify(Array.from(new Set(input.upstreams.map((u) => u.trim())))),
      certificateId: input.certificate_id ?? null,
      accessListId: input.access_list_id ?? null,
      ownerUserId: actorUserId,
      sslForced: input.ssl_forced ?? true,
      hstsEnabled: input.hsts_enabled ?? true,
      hstsSubdomains: input.hsts_subdomains ?? false,
      allowWebsocket: input.allow_websocket ?? true,
      preserveHostHeader: input.preserve_host_header ?? true,
      meta,
      skipHttpsHostnameValidation: input.skip_https_hostname_validation ?? false,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now
    }
  });

  logAuditEvent({
    userId: actorUserId,
    action: "create",
    entityType: "proxy_host",
    entityId: record.id,
    summary: `Created proxy host ${input.name}`,
    data: input
  });

  await applyCaddyConfig();
  return (await getProxyHost(record.id))!;
}

export async function getProxyHost(id: number): Promise<ProxyHost | null> {
  const host = await prisma.proxyHost.findUnique({
    where: { id }
  });
  return host ? parseProxyHost(host) : null;
}

export async function updateProxyHost(id: number, input: Partial<ProxyHostInput>, actorUserId: number) {
  const existing = await getProxyHost(id);
  if (!existing) {
    throw new Error("Proxy host not found");
  }

  const domains = input.domains ? JSON.stringify(Array.from(new Set(input.domains))) : JSON.stringify(existing.domains);
  const upstreams = input.upstreams ? JSON.stringify(Array.from(new Set(input.upstreams))) : JSON.stringify(existing.upstreams);
  const existingMeta: ProxyHostMeta = {
    custom_reverse_proxy_json: existing.custom_reverse_proxy_json ?? undefined,
    custom_pre_handlers_json: existing.custom_pre_handlers_json ?? undefined,
    authentik: dehydrateAuthentik(existing.authentik)
  };
  const meta = buildMeta(existingMeta, input);

  const now = new Date(nowIso());
  await prisma.proxyHost.update({
    where: { id },
    data: {
      name: input.name ?? existing.name,
      domains,
      upstreams,
      certificateId: input.certificate_id ?? existing.certificate_id,
      accessListId: input.access_list_id ?? existing.access_list_id,
      sslForced: input.ssl_forced ?? existing.ssl_forced,
      hstsEnabled: input.hsts_enabled ?? existing.hsts_enabled,
      hstsSubdomains: input.hsts_subdomains ?? existing.hsts_subdomains,
      allowWebsocket: input.allow_websocket ?? existing.allow_websocket,
      preserveHostHeader: input.preserve_host_header ?? existing.preserve_host_header,
      meta,
      skipHttpsHostnameValidation: input.skip_https_hostname_validation ?? existing.skip_https_hostname_validation,
      enabled: input.enabled ?? existing.enabled,
      updatedAt: now
    }
  });

  logAuditEvent({
    userId: actorUserId,
    action: "update",
    entityType: "proxy_host",
    entityId: id,
    summary: `Updated proxy host ${input.name ?? existing.name}`,
    data: input
  });

  await applyCaddyConfig();
  return (await getProxyHost(id))!;
}

export async function deleteProxyHost(id: number, actorUserId: number) {
  const existing = await getProxyHost(id);
  if (!existing) {
    throw new Error("Proxy host not found");
  }

  await prisma.proxyHost.delete({
    where: { id }
  });
  logAuditEvent({
    userId: actorUserId,
    action: "delete",
    entityType: "proxy_host",
    entityId: id,
    summary: `Deleted proxy host ${existing.name}`
  });
  await applyCaddyConfig();
}
