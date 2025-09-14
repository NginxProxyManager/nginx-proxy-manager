import { DateTimeFormat, intl } from "src/locale";

interface Props {
	domains: string[];
	createdOn?: string;
}
export function DomainsFormatter({ domains, createdOn }: Props) {
	return (
		<div className="flex-fill">
			<div className="font-weight-medium">
				{domains.map((domain: string) => (
					<a key={domain} href={`http://${domain}`} className="badge bg-yellow-lt domain-name">
						{domain}
					</a>
				))}
			</div>
			{createdOn ? (
				<div className="text-secondary mt-1">
					{intl.formatMessage({ id: "created-on" }, { date: DateTimeFormat(createdOn) })}
				</div>
			) : null}
		</div>
	);
}
