import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";
import type { DeadHost, ProxyHost, RedirectionHost, Stream } from "src/api/backend";
import { TrueFalseFormatter } from "src/components";
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

const getSectionStream = (items: Stream[]) => {
	if (items.length === 0) {
		return null;
	}
	return (
		<>
			<div>
				<strong>
					<T id="streams" />
				</strong>
			</div>
			{items.map((stream) => (
				<div key={stream.id} className="ms-1">
					{stream.forwardingHost}:{stream.forwardingPort}
				</div>
			))}
		</>
	);
};

interface Props {
	proxyHosts: ProxyHost[];
	redirectionHosts: RedirectionHost[];
	deadHosts: DeadHost[];
	streams: Stream[];
}
export function CertificateInUseFormatter({ proxyHosts, redirectionHosts, deadHosts, streams }: Props) {
	const totalCount = proxyHosts?.length + redirectionHosts?.length + deadHosts?.length + streams?.length;
	if (totalCount === 0) {
		return <TrueFalseFormatter value={false} falseLabel="certificate.not-in-use" />;
	}

	proxyHosts.sort();
	redirectionHosts.sort();
	deadHosts.sort();
	streams.sort();

	const popover = (
		<Popover id="popover-basic">
			<Popover.Body>
				{getSection("proxy-hosts", proxyHosts)}
				{getSection("redirection-hosts", redirectionHosts)}
				{getSection("dead-hosts", deadHosts)}
				{getSectionStream(streams)}
			</Popover.Body>
		</Popover>
	);

	return (
		<OverlayTrigger trigger={["hover", "click", "focus"]} placement="bottom" overlay={popover}>
			<div>
				<TrueFalseFormatter value trueLabel="certificate.in-use" />
			</div>
		</OverlayTrigger>
	);
}
