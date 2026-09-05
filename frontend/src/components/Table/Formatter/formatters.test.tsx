import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const showAccessListModal = vi.hoisted(() => vi.fn());
vi.mock("src/modals", () => ({ showAccessListModal }));
vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "en" }) }));
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => <span>{id}</span>,
	formatDateTime: (value: string, locale: string) => `${locale}:${value}`,
	parseDate: (value: string) => (value === "invalid" ? null : new Date(value)),
}));
vi.mock("src/components", () => ({
	TrueFalseFormatter: ({ value, trueLabel, falseLabel }: { value: boolean; trueLabel?: string; falseLabel?: string }) => (
		<span>{value ? trueLabel || "true" : falseLabel || "false"}</span>
	),
}));

import { AccessListFormatter } from "./AccessListformatter";
import { CertificateFormatter } from "./CertificateFormatter";
import { CertificateInUseFormatter } from "./CertificateInUseFormatter";
import { DateFormatter } from "./DateFormatter";
import { DomainsFormatter } from "./DomainsFormatter";
import { EmailFormatter } from "./EmailFormatter";
import { EventFormatter } from "./EventFormatter";
import { GravatarFormatter } from "./GravatarFormatter";
import { RolesFormatter } from "./RolesFormatter";
import { TrueFalseFormatter } from "./TrueFalseFormatter";
import { ValueWithDateFormatter } from "./ValueWithDateFormatter";

describe("table formatters", () => {
	it("formats access lists and certificate providers", () => {
		const { rerender } = render(<AccessListFormatter />);
		expect(screen.getByText("public")).toBeInTheDocument();
		rerender(<AccessListFormatter access={{ id: 7, name: "Office" } as never} />);
		fireEvent.click(screen.getByRole("button", { name: "Office" }));
		expect(showAccessListModal).toHaveBeenCalledWith(7);

		for (const [provider, expected] of [
			[undefined, "http-only"],
			["letsencrypt", "lets-encrypt"],
			["other", "certificates.custom"],
			["dns", "dns"],
		] as const) {
			rerender(<CertificateFormatter certificate={provider ? ({ provider } as never) : undefined} />);
			expect(screen.getByText(expected)).toBeInTheDocument();
		}
	});

	it("formats certificate usage across every host type", () => {
		const empty = render(<CertificateInUseFormatter proxyHosts={[]} redirectionHosts={[]} deadHosts={[]} streams={[]} />);
		expect(screen.getByText("certificate.not-in-use")).toBeInTheDocument();
		empty.rerender(
			<CertificateInUseFormatter
				proxyHosts={[{ id: 1, domainNames: ["proxy.example"] } as never]}
				redirectionHosts={[{ id: 2, domainNames: ["redirect.example"] } as never]}
				deadHosts={[{ id: 3, domainNames: ["dead.example"] } as never]}
				streams={[{ id: 4, forwardingHost: "tcp.example", forwardingPort: 443 } as never]}
			/>,
		);
		expect(screen.getByText("certificate.in-use")).toBeInTheDocument();
	});

	it("formats dates, domains, emails, avatars, roles, booleans and values", () => {
		const date = render(<DateFormatter value="2020-01-01" highlightPast />);
		expect(date.container.querySelector(".text-danger")).toBeInTheDocument();
		date.rerender(<DateFormatter value="invalid" highlistNearlyExpired />);

		const domains = render(<DomainsFormatter domains={[]} />);
		expect(screen.getByText("Unknown")).toBeInTheDocument();
		domains.rerender(
			<DomainsFormatter
				domains={["example.test", "*.example.test"]}
				createdOn="2026-01-01"
				niceName="Certificate"
				provider="other"
				color="blue"
			/>,
		);
		const wildcard = screen.getByText("*.example.test").closest("a");
		expect(fireEvent.click(wildcard as HTMLElement)).toBe(false);

		render(<EmailFormatter email="person@example.test" />);
		expect(screen.getByText("person@example.test").closest("a")?.getAttribute("href")).toBe("mailto:person@example.test");
		const avatar = render(<GravatarFormatter name="Person" />);
		expect(avatar.container.querySelector("span")?.getAttribute("style")).toContain("default-avatar");
		avatar.rerender(<GravatarFormatter name="Person" url="https://example.test/avatar.png" />);

		const roles = render(<RolesFormatter roles={[]} />);
		expect(screen.getByText("role.standard-user")).toBeInTheDocument();
		roles.rerender(<RolesFormatter roles={["admin"]} />);
		expect(screen.getByText("role.admin")).toBeInTheDocument();

		const boolean = render(<TrueFalseFormatter value />);
		expect(screen.getByText("enabled")).toBeInTheDocument();
		boolean.rerender(<TrueFalseFormatter value={false} falseLabel="off" falseColor="gray" />);
		expect(screen.getByText("off")).toBeInTheDocument();

		const value = render(<ValueWithDateFormatter value="Value" />);
		value.rerender(<ValueWithDateFormatter value="Value" createdOn="2026-01-01" disabled />);
		expect(screen.getByText("disabled")).toBeInTheDocument();
	});

	it("formats every audit-log object and action style", () => {
		const cases = [
			["access-list", { name: "ACL" }],
			["user", { name: "Person" }],
			["proxy-host", { domainNames: ["proxy.example"] }],
			["redirection-host", { domainNames: ["redirect.example"] }],
			["dead-host", {}],
			["stream", { incomingPort: 80 }],
			["certificate", { niceName: "Custom cert" }],
			["unknown", {}],
		] as const;
		const view = render(<div />);
		cases.forEach(([objectType, meta], index) => {
			view.rerender(
				<EventFormatter
					row={{ objectType, meta, action: index === 0 ? "created" : index === 1 ? "deleted" : "updated", createdOn: "2026-01-01" } as never}
				/>,
			);
			expect(screen.getByText(`object.event.${index === 0 ? "created" : index === 1 ? "deleted" : "updated"}`)).toBeInTheDocument();
		});
		expect(screen.getByText("UNKNOWN EVENT TYPE: unknown")).toBeInTheDocument();
	});
});
