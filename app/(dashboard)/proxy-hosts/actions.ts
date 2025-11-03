"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/src/lib/auth";
import { actionError, actionSuccess, INITIAL_ACTION_STATE, type ActionState } from "@/src/lib/actions";
import { createProxyHost, deleteProxyHost, updateProxyHost, type ProxyHostAuthentikInput } from "@/src/lib/models/proxy-hosts";

function parseCsv(value: FormDataEntryValue | null): string[] {
  if (!value || typeof value !== "string") {
    return [];
  }
  return value
    .replace(/\n/g, ",")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCheckbox(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true" || value === "1";
}

function parseOptionalText(value: FormDataEntryValue | null): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseAuthentikConfig(formData: FormData): ProxyHostAuthentikInput | undefined {
  if (!formData.has("authentik_present")) {
    return undefined;
  }

  const enabledIndicator = formData.has("authentik_enabled_present");
  const enabledValue = enabledIndicator
    ? formData.has("authentik_enabled")
      ? parseCheckbox(formData.get("authentik_enabled"))
      : false
    : undefined;
  const outpostDomain = parseOptionalText(formData.get("authentik_outpost_domain"));
  const outpostUpstream = parseOptionalText(formData.get("authentik_outpost_upstream"));
  const authEndpoint = parseOptionalText(formData.get("authentik_auth_endpoint"));
  const copyHeaders = parseCsv(formData.get("authentik_copy_headers"));
  const trustedProxies = parseCsv(formData.get("authentik_trusted_proxies"));
  const setHostHeader = formData.has("authentik_set_host_header_present")
    ? parseCheckbox(formData.get("authentik_set_host_header"))
    : undefined;

  const result: ProxyHostAuthentikInput = {};
  if (enabledValue !== undefined) {
    result.enabled = enabledValue;
  }
  if (outpostDomain !== null) {
    result.outpostDomain = outpostDomain;
  }
  if (outpostUpstream !== null) {
    result.outpostUpstream = outpostUpstream;
  }
  if (authEndpoint !== null) {
    result.authEndpoint = authEndpoint;
  }
  if (copyHeaders.length > 0 || formData.has("authentik_copy_headers")) {
    result.copyHeaders = copyHeaders;
  }
  if (trustedProxies.length > 0 || formData.has("authentik_trusted_proxies")) {
    result.trustedProxies = trustedProxies;
  }
  if (setHostHeader !== undefined) {
    result.setOutpostHostHeader = setHostHeader;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export async function createProxyHostAction(
  _prevState: ActionState = INITIAL_ACTION_STATE,
  formData: FormData
): Promise<ActionState> {
  try {
    const session = await requireAdmin();
    const userId = Number(session.user.id);
    await createProxyHost(
      {
        name: String(formData.get("name") ?? "Untitled"),
        domains: parseCsv(formData.get("domains")),
        upstreams: parseCsv(formData.get("upstreams")),
        certificate_id: formData.get("certificate_id") ? Number(formData.get("certificate_id")) : null,
        access_list_id: formData.get("access_list_id") ? Number(formData.get("access_list_id")) : null,
        hsts_subdomains: parseCheckbox(formData.get("hsts_subdomains")),
        skip_https_hostname_validation: parseCheckbox(formData.get("skip_https_hostname_validation")),
        enabled: parseCheckbox(formData.get("enabled")),
        custom_pre_handlers_json: parseOptionalText(formData.get("custom_pre_handlers_json")),
        custom_reverse_proxy_json: parseOptionalText(formData.get("custom_reverse_proxy_json")),
        authentik: parseAuthentikConfig(formData)
      },
      userId
    );
    revalidatePath("/proxy-hosts");
    return actionSuccess("Proxy host created and queued for Caddy reload.");
  } catch (error) {
    console.error("Failed to create proxy host:", error);
    return actionError(error, "Failed to create proxy host. Please check the logs for details.");
  }
}

export async function updateProxyHostAction(
  id: number,
  _prevState: ActionState = INITIAL_ACTION_STATE,
  formData: FormData
): Promise<ActionState> {
  try {
    const session = await requireAdmin();
    const userId = Number(session.user.id);
    const boolField = (key: string) => (formData.has(`${key}_present`) ? parseCheckbox(formData.get(key)) : undefined);
    await updateProxyHost(
      id,
      {
        name: formData.get("name") ? String(formData.get("name")) : undefined,
        domains: formData.get("domains") ? parseCsv(formData.get("domains")) : undefined,
        upstreams: formData.get("upstreams") ? parseCsv(formData.get("upstreams")) : undefined,
        certificate_id: formData.get("certificate_id") ? Number(formData.get("certificate_id")) : undefined,
        access_list_id: formData.get("access_list_id") ? Number(formData.get("access_list_id")) : undefined,
        hsts_subdomains: boolField("hsts_subdomains"),
        skip_https_hostname_validation: boolField("skip_https_hostname_validation"),
        enabled: boolField("enabled"),
        custom_pre_handlers_json: formData.has("custom_pre_handlers_json")
          ? parseOptionalText(formData.get("custom_pre_handlers_json"))
          : undefined,
        custom_reverse_proxy_json: formData.has("custom_reverse_proxy_json")
          ? parseOptionalText(formData.get("custom_reverse_proxy_json"))
          : undefined,
        authentik: parseAuthentikConfig(formData)
      },
      userId
    );
    revalidatePath("/proxy-hosts");
    return actionSuccess("Proxy host updated.");
  } catch (error) {
    console.error(`Failed to update proxy host ${id}:`, error);
    return actionError(error, "Failed to update proxy host. Please check the logs for details.");
  }
}

export async function deleteProxyHostAction(
  id: number,
  _prevState: ActionState = INITIAL_ACTION_STATE
): Promise<ActionState> {
  try {
    const session = await requireAdmin();
    const userId = Number(session.user.id);
    await deleteProxyHost(id, userId);
    revalidatePath("/proxy-hosts");
    return actionSuccess("Proxy host deleted.");
  } catch (error) {
    console.error(`Failed to delete proxy host ${id}:`, error);
    return actionError(error, "Failed to delete proxy host. Please check the logs for details.");
  }
}
