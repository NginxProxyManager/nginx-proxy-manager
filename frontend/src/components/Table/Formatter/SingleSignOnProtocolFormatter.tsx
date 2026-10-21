import { SingleSignOnClientType } from "src/api/backend";
import { useTheme } from "src/hooks";

const samlImg = "/images/saml.svg";
const oidcImg = "/images/openid.svg";

interface Props {
	protocol?: string;
}
export function SingleSignOnProtocolFormatter({ protocol }: Props) {
	const invert = useTheme().getTheme() === "dark" ? 1 : 0;
	const style = { filter: `invert(${invert})`, maxHeight: "2.5rem" };
	const src = protocol === SingleSignOnClientType.OpenID ? oidcImg : samlImg;

	return (
		<div className="d-flex py-1 align-items-center">
			<img src={src} style={style} title={protocol} alt={protocol} />
		</div>
	);
}
