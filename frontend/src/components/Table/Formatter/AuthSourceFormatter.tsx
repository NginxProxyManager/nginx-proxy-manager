import { IconKey, IconShieldLock, IconUser, IconUsersGroup } from "@tabler/icons-react";
import type { AuthSource } from "src/api/backend";
import { intl } from "src/locale";

const ICONS = {
	local: IconUser,
	ldap: IconUsersGroup,
	saml: IconShieldLock,
	oauth: IconKey,
};

const COLOURS = {
	local: "bg-blue-lt",
	ldap: "bg-purple-lt",
	saml: "bg-teal-lt",
	oauth: "bg-orange-lt",
};

/**
 * Shows where a user can sign in from. External sources are labelled with the
 * provider's own name, since an instance may well have more than one of a kind.
 */
export function AuthSourceFormatter({ sources }: { sources?: AuthSource[] }) {
	if (!sources?.length) {
		return <span className="text-secondary">&mdash;</span>;
	}

	return (
		<div className="d-flex flex-wrap gap-1 justify-content-center">
			{sources.map((source) => {
				const Icon = ICONS[source.type] ?? IconUser;
				const label =
					source.type === "local"
						? intl.formatMessage({ id: "auth-source.local" })
						: source.name || intl.formatMessage({ id: `auth-provider.type.${source.type}` });

				return (
					<span
						key={`${source.type}-${source.providerId ?? "local"}`}
						className={`badge badge-pill ${COLOURS[source.type] ?? "bg-secondary-lt"}`}
						title={
							source.type === "local"
								? intl.formatMessage({ id: "auth-source.local-title" })
								: intl.formatMessage({ id: "auth-source.external-title" }, { name: label })
						}
					>
						<Icon size={12} className="me-1" />
						{label}
					</span>
				);
			})}
		</div>
	);
}
