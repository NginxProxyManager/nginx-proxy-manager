import { IconBrandAuth0, IconBrandGithub, IconBrandOauth } from "@tabler/icons-react";
import { SingleSignOnClientType } from "src/api/backend";
import { T } from "src/locale";
import { Button } from "../Button";
import type { ReactElement } from "react";

interface SingleSignOnConfig {
	id: number;
	name: string;
	type: SingleSignOnClientType;
	label?: string;
}

export interface SingleSignOnIntegration {
	enabled?: boolean;
	configs?: SingleSignOnConfig[];
}

interface Props {
	config: SingleSignOnConfig;
	isSubmitting?: boolean;
	isOAuthInit?: number;
	setFormErr?: (message: string) => void;
	setOAuthInit?: (index: number) => void;
}

const icons: { [type: string]: ReactElement } = {
	[SingleSignOnClientType.Auth0]: <IconBrandAuth0 height={20} className="mx-2" />,
	[SingleSignOnClientType.GitHub]: <IconBrandGithub height={20} className="mx-2" />,
	[SingleSignOnClientType.OpenID]: <IconBrandOauth height={20} className="mx-2" />,
};

export function SingleSignOnButton({ config, isSubmitting, isOAuthInit, setFormErr, setOAuthInit }: Props) {
	const initializeOAuthFlow = async (clientId: number, clientType?: SingleSignOnClientType) => {
		if (!setFormErr || !setOAuthInit) return; // when used as button preview
		setFormErr("");
		setOAuthInit(clientId);
		const returnTo = location.pathname;
		const type = clientType?.toLowerCase() ?? "";
		localStorage.setItem("returnTo", returnTo);
		try {
			document.location.replace(`/api/sso/oauth2/${type}/${clientId}`);
		} catch {
			setOAuthInit(0);
		}
	};

	return (
		<Button
			type="button"
			fullWidth
			color="azure"
			className="btn-outline sso-login"
			disabled={isSubmitting || ((isOAuthInit || 0) > 0 && isOAuthInit !== config.id)}
			isLoading={isOAuthInit === 0 ? undefined : isOAuthInit === config.id}
			onClick={() => initializeOAuthFlow(config.id, config.type)}
		>
			{icons[config.type]}
			{config.label && <span>{config.label}</span>}
			{!config.label && <T id="sign-in-with" data={{ name: config.name }} />}
		</Button>
	);
}
