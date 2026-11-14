import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Form, Formik } from "formik";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpstreamServersFields, validateUpstreamServers } from "./UpstreamServersFields";

const server = (host: string, overrides = {}) => ({
	host,
	port: 80,
	weight: 1,
	maxFails: 1,
	failTimeout: "30s",
	backup: false,
	down: false,
	...overrides,
});

describe("UpstreamServersFields", () => {
	afterEach(cleanup);

	it("clears an existing upstream name and keeps the Formik value blank for automatic naming", async () => {
		const onSubmit = vi.fn();

		render(
			<Formik
				initialValues={{
					upstreamName: "my_backend",
					upstreamServers: [server("primary.internal")],
					lbMethod: "round_robin",
				}}
				onSubmit={onSubmit}
			>
				<Form>
					<UpstreamServersFields />
					<button type="submit">Save</button>
				</Form>
			</Formik>,
		);

		const upstreamName = screen.getByLabelText("Upstream Name");
		expect(upstreamName).toHaveValue("my_backend");

		fireEvent.change(upstreamName, { target: { value: "" } });
		expect(upstreamName).toHaveValue("");
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ upstreamName: "" });
	});

	it("rejects reserved and malformed upstream names before submission", async () => {
		const onSubmit = vi.fn();

		render(
			<Formik
				initialValues={{
					upstreamName: "NPM-reserved",
					upstreamServers: [server("primary.internal")],
					lbMethod: "round_robin",
				}}
				onSubmit={onSubmit}
			>
				<Form>
					<UpstreamServersFields />
					<button type="submit">Save</button>
				</Form>
			</Formik>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(
				screen.getByText("Names beginning with npm- are reserved for automatically generated upstreams."),
			).toBeVisible(),
		);
		expect(onSubmit).not.toHaveBeenCalled();

		fireEvent.change(screen.getByLabelText("Upstream Name"), { target: { value: "invalid name" } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(
				screen.getByText(
					"Start with a letter or underscore; use only letters, numbers, underscores, or hyphens.",
				),
			).toBeVisible(),
		);
		expect(onSubmit).not.toHaveBeenCalled();

		fireEvent.change(screen.getByLabelText("Upstream Name"), { target: { value: `a${"a".repeat(128)}` } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(screen.getByText("Maximum length is 128 characters")).toBeVisible());
		expect(onSubmit).not.toHaveBeenCalled();

		fireEvent.change(screen.getByLabelText("Upstream Name"), { target: { value: "App_Backend-1" } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ upstreamName: "App_Backend-1" });
	});

	it("prevents an added server with no host from submission", async () => {
		const onSubmit = vi.fn();

		render(
			<Formik initialValues={{ upstreamServers: [], lbMethod: "round_robin" }} onSubmit={onSubmit}>
				<Form>
					<UpstreamServersFields />
					<button type="submit">Save</button>
				</Form>
			</Formik>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Add Upstream Server" }));
		fireEvent.change(screen.getByLabelText("Port"), { target: { value: "8080" } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(screen.getByText("This is required")).toBeVisible());
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("rejects a host with leading or trailing whitespace before submission", async () => {
		const onSubmit = vi.fn();

		render(
			<Formik
				initialValues={{ upstreamServers: [server("primary.internal")], lbMethod: "round_robin" }}
				onSubmit={onSubmit}
			>
				<Form>
					<UpstreamServersFields />
					<button type="submit">Save</button>
				</Form>
			</Formik>,
		);

		fireEvent.change(screen.getByLabelText("Host"), { target: { value: " primary.internal " } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(screen.getByText(/Invalid domain:/)).toBeVisible());
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("renders Formik's reset values instead of retaining a separate server list", async () => {
		const onSubmit = vi.fn();

		render(
			<Formik
				initialValues={{ upstreamServers: [server("primary.internal")], lbMethod: "round_robin" }}
				onSubmit={onSubmit}
			>
				{({ resetForm }) => (
					<Form>
						<UpstreamServersFields />
						<button type="button" onClick={() => resetForm()}>
							Reset
						</button>
						<button type="submit">Save</button>
					</Form>
				)}
			</Formik>,
		);

		fireEvent.change(screen.getByLabelText("Host"), { target: { value: "changed.internal" } });
		expect(screen.getByLabelText("Host")).toHaveValue("changed.internal");

		fireEvent.click(screen.getByRole("button", { name: "Reset" }));
		expect(screen.getByLabelText("Host")).toHaveValue("primary.internal");

		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		expect(onSubmit.mock.calls[0][0]).toMatchObject({
			upstreamServers: [server("primary.internal")],
			lbMethod: "round_robin",
		});
	});

	it("removes the intended row from the submitted Formik value", async () => {
		const onSubmit = vi.fn();

		render(
			<Formik
				initialValues={{
					upstreamServers: [server("first.internal"), server("second.internal", { port: 8080 })],
					lbMethod: "round_robin",
				}}
				onSubmit={onSubmit}
			>
				<Form>
					<UpstreamServersFields />
					<button type="submit">Save</button>
				</Form>
			</Formik>,
		);

		fireEvent.click(screen.getAllByText("Delete")[0]);
		expect(screen.getByLabelText("Host")).toHaveValue("second.internal");

		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		expect(onSubmit.mock.calls[0][0]).toMatchObject({
			upstreamServers: [server("second.internal", { port: 8080 })],
		});
	});

	it("keeps sparse validation feedback with its server after deleting a middle row", async () => {
		render(
			<Formik
				initialValues={{
					upstreamServers: [server("first.internal"), server("middle.internal"), server("")],
					lbMethod: "round_robin",
				}}
				onSubmit={vi.fn()}
			>
				<Form>
					<UpstreamServersFields />
				</Form>
			</Formik>,
		);

		fireEvent.blur(screen.getAllByLabelText("Host")[2]);
		await waitFor(() => expect(screen.getByText("This is required")).toBeVisible());

		fireEvent.click(screen.getAllByText("Delete")[1]);

		await waitFor(() => {
			const hosts = screen.getAllByLabelText("Host");
			expect(hosts[0]).toHaveValue("first.internal");
			expect(hosts[0]).not.toHaveClass("is-invalid");
			expect(hosts[1]).toHaveValue("");
			expect(hosts[1]).toHaveClass("is-invalid");
		});
	});

	it("allows submission after deleting a row with a submitted validation error", async () => {
		const onSubmit = vi.fn();

		render(
			<Formik
				initialValues={{ upstreamServers: [server("primary.internal"), server("")], lbMethod: "round_robin" }}
				onSubmit={onSubmit}
			>
				<Form>
					<UpstreamServersFields />
					<button type="submit">Save</button>
				</Form>
			</Formik>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(screen.getByText("This is required")).toBeVisible());

		fireEvent.click(screen.getAllByText("Delete")[1]);
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ upstreamServers: [server("primary.internal")] });
	});

	it("blocks a submission when an invalid upstream row is on a hidden tab", async () => {
		const onSubmit = vi.fn();

		render(
			<Formik initialValues={{ upstreamServers: [server("")], lbMethod: "round_robin" }} onSubmit={onSubmit}>
				<Form>
					<div hidden>
						<UpstreamServersFields />
					</div>
					<button type="submit">Save</button>
				</Form>
			</Formik>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(screen.getByText("This is required")).toBeInTheDocument());
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("clears backup servers when switching to ip_hash before submission", async () => {
		const onSubmit = vi.fn();

		render(
			<Formik
				initialValues={{
					upstreamServers: [
						server("primary.internal"),
						server("backup.internal", { backup: true }),
					],
					lbMethod: "round_robin",
				}}
				onSubmit={onSubmit}
			>
				<Form>
					<UpstreamServersFields />
					<button type="submit">Save</button>
				</Form>
			</Formik>,
		);

		fireEvent.change(screen.getByLabelText("Balancing Method"), { target: { value: "ip_hash" } });
		for (const backup of screen.getAllByLabelText("Backup")) {
			expect(backup).not.toBeChecked();
			expect(backup).toBeDisabled();
		}

		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		expect(onSubmit.mock.calls[0][0]).toMatchObject({
			lbMethod: "ip_hash",
			upstreamServers: [server("primary.internal"), server("backup.internal", { backup: false })],
		});
	});

	it("requires at least one primary upstream server", async () => {
		const onSubmit = vi.fn();

		render(
			<Formik
				initialValues={{
					upstreamServers: [server("backup.internal", { backup: true })],
					lbMethod: "round_robin",
				}}
				onSubmit={onSubmit}
				validate={validateUpstreamServers}
			>
				<Form>
					<UpstreamServersFields />
					<button type="submit">Save</button>
				</Form>
			</Formik>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(screen.getByText("At least one upstream server must not be a backup.")).toBeVisible(),
		);
		expect(onSubmit).not.toHaveBeenCalled();

		fireEvent.click(screen.getByLabelText("Backup"));
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
	});

	it("requires an upstream server when upstream forwarding is selected", async () => {
		const onSubmit = vi.fn();

		render(
			<Formik
				initialValues={{ forwardingMode: "upstream" as const, upstreamServers: [], lbMethod: "round_robin" }}
				onSubmit={onSubmit}
				validate={validateUpstreamServers}
			>
				<Form>
					<UpstreamServersFields />
					<button type="submit">Save</button>
				</Form>
			</Formik>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(screen.getByText("Add at least one server in Load Balancing.")).toBeVisible());
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("rejects Nginx-unsafe weights and max fails before submission", async () => {
		const onSubmit = vi.fn();

		render(
			<Formik
				initialValues={{ upstreamServers: [server("primary.internal")], lbMethod: "round_robin" }}
				onSubmit={onSubmit}
			>
				<Form>
					<UpstreamServersFields />
					<button type="submit">Save</button>
				</Form>
			</Formik>,
		);

		fireEvent.change(screen.getByLabelText("Weight"), { target: { value: "2147483648" } });
		fireEvent.change(screen.getByLabelText("Max Fails"), { target: { value: "2147483648" } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(screen.getAllByText("Maximum is 2147483647")).toHaveLength(2));
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("explains invalid fail timeout syntax without calling it a domain", async () => {
		const onSubmit = vi.fn();

		render(
			<Formik
				initialValues={{ upstreamServers: [server("primary.internal")], lbMethod: "round_robin" }}
				onSubmit={onSubmit}
			>
				<Form>
					<UpstreamServersFields />
					<button type="submit">Save</button>
				</Form>
			</Formik>,
		);

		fireEvent.change(screen.getByLabelText("Fail Timeout"), { target: { value: "30ms" } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(screen.getByText("Use whole seconds or a positive duration with s, m, h, or d.")).toBeVisible(),
		);
		expect(onSubmit).not.toHaveBeenCalled();
	});
});
