import { intl } from "src/locale";

interface Props {
	enabled: boolean;
}
export function EnabledFormatter({ enabled }: Props) {
	if (enabled) {
		return <span className="badge bg-lime-lt">{intl.formatMessage({ id: "enabled" })}</span>;
	}
	return <span className="badge bg-red-lt">{intl.formatMessage({ id: "disabled" })}</span>;
}
