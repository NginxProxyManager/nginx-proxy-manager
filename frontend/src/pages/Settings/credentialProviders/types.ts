export const PROVIDER_TYPES = ["vault", "aws", "azure", "infisical", "http"] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
	vault: "HashiCorp Vault",
	aws: "AWS Secrets Manager",
	azure: "Azure Key Vault",
	infisical: "Infisical",
	http: "HTTP",
};

export type CredentialProviderFormState = {
	name: string;
	type: ProviderType;
	oidcIssuer: string;
	oidcClientId: string;
	oidcClientSecret: string;
	oidcAudience: string;
	oidcScope: string;
	meta: Record<string, string>;
};

export const defaultMetaForType = (type: ProviderType): Record<string, string> => {
	switch (type) {
		case "vault":
			return { address: "https://vault.example:8200", mount: "secret", role: "npm" };
		case "aws":
			return { region: "us-east-1", roleArn: "" };
		case "azure":
			return { tenantId: "", vaultUrl: "" };
		case "infisical":
			return {
				host: "https://app.infisical.com",
				workspaceId: "",
				environmentSlug: "prod",
			};
		case "http":
			return { urlTemplate: "https://secrets.example/api/{path}" };
		default:
			return {};
	}
};

export const emptyForm = (type: ProviderType = "vault"): CredentialProviderFormState => ({
	name: "",
	type,
	oidcIssuer: "",
	oidcClientId: "",
	oidcClientSecret: "",
	oidcAudience: "",
	oidcScope: "",
	meta: defaultMetaForType(type),
});

export const formFromProvider = (p: {
	name: string;
	type: string;
	oidcIssuer?: string | null;
	oidcClientId?: string | null;
	oidcAudience?: string | null;
	oidcScope?: string | null;
	meta?: Record<string, unknown> | null;
}): CredentialProviderFormState => {
	const type = (PROVIDER_TYPES.includes(p.type as ProviderType) ? p.type : "vault") as ProviderType;
	const raw = (p.meta || {}) as Record<string, unknown>;
	const meta: Record<string, string> = { ...defaultMetaForType(type) };

	if (type === "infisical") {
		meta.host = String(raw.host || meta.host);
		meta.workspaceId = String(raw.workspace_id || raw.workspaceId || "");
		meta.environmentSlug = String(raw.environment_slug || raw.environmentSlug || "prod");
	} else if (type === "vault") {
		meta.address = String(raw.address || "");
		meta.mount = String(raw.mount || "secret");
		meta.role = String(raw.role || "");
	} else if (type === "aws") {
		meta.region = String(raw.region || "");
		meta.roleArn = String(raw.role_arn || raw.roleArn || "");
	} else if (type === "azure") {
		meta.tenantId = String(raw.tenant_id || raw.tenantId || "");
		meta.vaultUrl = String(raw.vault_url || raw.vaultUrl || "");
	} else if (type === "http") {
		meta.urlTemplate = String(raw.url_template || raw.urlTemplate || "");
	}

	return {
		name: p.name,
		type,
		oidcIssuer: p.oidcIssuer || "",
		oidcClientId: p.oidcClientId || "",
		oidcClientSecret: "",
		oidcAudience: p.oidcAudience || "",
		oidcScope: p.oidcScope || "",
		meta,
	};
};

export const buildMetaPayload = (form: CredentialProviderFormState): Record<string, unknown> => {
	const { type, meta } = form;
	switch (type) {
		case "infisical":
			return {
				host: meta.host,
				workspaceId: meta.workspaceId,
				environmentSlug: meta.environmentSlug || "prod",
				authMethod: "universal",
			};
		case "vault":
			return { address: meta.address, mount: meta.mount, role: meta.role };
		case "aws":
			return { region: meta.region, roleArn: meta.roleArn };
		case "azure":
			return { tenantId: meta.tenantId, vaultUrl: meta.vaultUrl };
		case "http":
			return { urlTemplate: meta.urlTemplate };
		default:
			return {};
	}
};

export const buildApiPayload = (form: CredentialProviderFormState): Record<string, unknown> => {
	const meta = buildMetaPayload(form);
	const base: Record<string, unknown> = {
		name: form.name,
		type: form.type,
		meta,
	};

	if (form.type === "infisical") {
		base.oidcClientId = form.oidcClientId;
		if (form.oidcClientSecret) base.oidcClientSecret = form.oidcClientSecret;
		return base;
	}

	base.oidcIssuer = form.oidcIssuer;
	base.oidcClientId = form.oidcClientId;
	if (form.oidcAudience) base.oidcAudience = form.oidcAudience;
	if (form.oidcScope) base.oidcScope = form.oidcScope;
	if (form.oidcClientSecret) base.oidcClientSecret = form.oidcClientSecret;

	return base;
};
