import { intl } from "src/locale";

interface Props {
	enabled: boolean;
}
export function StatusFormatter({ enabled }: Props) {
	if (enabled) {
		return <span className="badge bg-lime-lt">{intl.formatMessage({ id: "online" })}</span>;
	}
	return <span className="badge bg-red-lt">{intl.formatMessage({ id: "offline" })}</span>;
}
