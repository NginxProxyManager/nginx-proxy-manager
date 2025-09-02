import { intlFormat, parseISO } from "date-fns";
import { intl } from "src/locale";

interface Props {
	domains: string[];
	createdOn?: string;
}
export function DomainsFormatter({ domains, createdOn }: Props) {
	return (
		<div className="flex-fill">
			<div className="font-weight-medium">
				{domains.map((domain: string) => (
					<span key={domain} className="badge badge-lg domain-name">
						{domain}
					</span>
				))}
			</div>
			{createdOn ? (
				<div className="text-secondary mt-1">
					{intl.formatMessage({ id: "created-on" }, { date: intlFormat(parseISO(createdOn)) })}
				</div>
			) : null}
		</div>
	);
}
