import { SingleSignOnClientType } from "src/api/backend";
import { useTheme } from "src/hooks";

const images = {
	[SingleSignOnClientType.Auth0]: "/images/sso-logo-auth0.svg",
	[SingleSignOnClientType.GitHub]: "/images/sso-logo-github.svg",
	[SingleSignOnClientType.OpenID]: "/images/sso-logo-openid.svg",
	[SingleSignOnClientType.SAML]: "/images/sso-logo-saml.svg",
};

interface Props {
	protocol?: string;
	disabled: boolean;
}
export function SingleSignOnProtocolFormatter({ protocol, disabled }: Props) {
	const invert = useTheme().getTheme() === "dark" ? 1 : 0;
	const opacity = disabled ? "0.3" : "1";
	const style = { filter: `invert(${invert})`, maxHeight: "2.5rem", opacity };
	const src = images[protocol as SingleSignOnClientType];

	return (
		<div className="d-flex py-1 align-items-center">
			<img src={src} style={style} title={protocol} alt={protocol} />
		</div>
	);
}
