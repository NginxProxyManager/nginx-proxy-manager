import React from "react";

import { useHealthState } from "context";
import styled from "styled-components";
import { Site } from "tabler-react";

const FixedFooterWrapper = styled.div`
	position: fixed;
	bottom: 0;
	width: 100%;
`;

interface Props {
	fixed?: boolean;
}
function Footer({ fixed }: Props) {
	const { health } = useHealthState();

	const footerNav = (
		<div>
			<a
				href="https://nginxproxymanager.com?utm_source=npm"
				target="_blank"
				rel="noreferrer">
				User Guide
			</a>{" "}
			{String.fromCharCode(183)}{" "}
			<a
				href="https://github.com/jc21/nginx-proxy-manager/releases?utm_source=npm"
				target="_blank"
				rel="noreferrer">
				Changelog
			</a>{" "}
			{String.fromCharCode(183)}{" "}
			<a
				href="https://github.com/jc21/nginx-proxy-manager?utm_source=npm"
				target="_blank"
				rel="noreferrer">
				Github
			</a>
		</div>
	);

	const note =
		"v" + health.version + " " + String.fromCharCode(183) + " " + health.commit;

	return fixed ? (
		<FixedFooterWrapper>
			<Site.Footer copyright={note} nav={footerNav} />
		</FixedFooterWrapper>
	) : (
		<Site.Footer copyright={note} nav={footerNav} />
	);
}

export { Footer };
