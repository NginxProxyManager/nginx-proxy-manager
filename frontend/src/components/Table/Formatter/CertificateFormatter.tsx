import cn from "classnames";
import { differenceInDays, isPast } from "date-fns";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";
import type { Certificate } from "src/api/backend";
import { DateFormatter } from "src/components";
import { parseDate, T } from "src/locale";

const getProviderLabel = (provider: string) => {
	if (provider === "letsencrypt") {
		return "lets-encrypt";
	}
	if (provider === "other") {
		return "certificates.custom";
	}
	return provider;
};

interface Props {
	certificate?: Certificate;
}
export function CertificateFormatter({ certificate }: Props) {
	if (!certificate) {
		return <T id="http-only" />;
	}

	const translation = getProviderLabel(certificate.provider);
	const expires = certificate.expiresOn ? parseDate(certificate.expiresOn) : null;
	const expired = expires ? isPast(expires) : false;
	const daysLeft = expires ? differenceInDays(expires, new Date()) : null;
	const labelClass = cn({
		"text-danger": expired,
		"text-warning": !expired && daysLeft !== null && daysLeft <= 30,
	});

	const name = certificate.niceName || certificate.domainNames?.[0] || `#${certificate.id}`;

	const popover = (
		<Popover id={`popover-certificate-${certificate.id}`}>
			<Popover.Body>
				<div className="mb-2">
					<strong>{name}</strong>
					<span className="text-secondary ms-1">#{certificate.id}</span>
				</div>
				<div>
					<strong>
						<T id="column.provider" />
					</strong>
				</div>
				<div className="ms-1 mb-2">
					<T id={translation} />
				</div>
				{certificate.domainNames?.length ? (
					<>
						<div>
							<strong>
								<T id="domain-names" />
							</strong>
						</div>
						{certificate.domainNames.map((domain) => (
							<div key={domain} className="ms-1">
								{domain}
							</div>
						))}
					</>
				) : null}
				{certificate.expiresOn ? (
					<>
						<div className="mt-2">
							<strong>
								<T id="column.expires" />
							</strong>
						</div>
						<div className="ms-1">
							<DateFormatter value={certificate.expiresOn} highlightPast highlistNearlyExpired />
						</div>
					</>
				) : null}
			</Popover.Body>
		</Popover>
	);

	return (
		<OverlayTrigger trigger={["hover", "click", "focus"]} placement="bottom" overlay={popover}>
			<div style={{ cursor: "help" }}>
				<span className={labelClass}>
					<T id={translation} />
				</span>
				{certificate.provider === "other" && certificate.niceName ? (
					<div className="text-secondary small">{certificate.niceName}</div>
				) : null}
			</div>
		</OverlayTrigger>
	);
}
