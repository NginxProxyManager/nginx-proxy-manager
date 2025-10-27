import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";
import type { DeadHost, ProxyHost, RedirectionHost } from "src/api/backend";
import { T } from "src/locale";

const getSection = (title: string, items: ProxyHost[] | RedirectionHost[] | DeadHost[]) => {
	if (items.length === 0) {
		return null;
	}
	return (
		<>
			<div>
				<strong>
					<T id={title} />
				</strong>
			</div>
			{items.map((host) => (
				<div key={host.id} className="ms-1">
					{host.domainNames.join(", ")}
				</div>
			))}
		</>
	);
};

interface Props {
	proxyHosts: ProxyHost[];
	redirectionHosts: RedirectionHost[];
	deadHosts: DeadHost[];
}
export function CertificateInUseFormatter({ proxyHosts, redirectionHosts, deadHosts }: Props) {
	const totalCount = proxyHosts?.length + redirectionHosts?.length + deadHosts?.length;
	if (totalCount === 0) {
		return (
			<span className="badge bg-red-lt">
				<T id="certificate.not-in-use" />
			</span>
		);
	}

	proxyHosts.sort();
	redirectionHosts.sort();
	deadHosts.sort();

	const popover = (
		<Popover id="popover-basic">
			<Popover.Body>
				{getSection("proxy-hosts", proxyHosts)}
				{getSection("redirection-hosts", redirectionHosts)}
				{getSection("dead-hosts", deadHosts)}
			</Popover.Body>
		</Popover>
	);

	return (
		<OverlayTrigger trigger="hover" placement="bottom" overlay={popover}>
			<span className="badge bg-lime-lt">
				<T id="certificate.in-use" />
			</span>
		</OverlayTrigger>
	);
}
