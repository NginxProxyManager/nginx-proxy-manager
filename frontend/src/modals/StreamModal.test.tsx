import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import EasyModal from "ez-modal-react";
import { LocaleProvider } from "src/context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showStreamModal } from "./StreamModal";

const stream = {
	id: 1,
	created_on: "2026-01-01 00:00:00",
	modified_on: "2026-01-01 00:00:00",
	owner_user_id: 1,
	incoming_port: 8080,
	forwarding_host: "app",
	forwarding_port: 80,
	tcp_forwarding: true,
	udp_forwarding: false,
	certificate_id: 0,
	enabled: true,
	meta: {},
};

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let putBodies: any[] = [];
let testBodies: any[] = [];

beforeEach(() => {
	localStorage.clear();
	putBodies = [];
	testBodies = [];
	fetchMock.mockImplementation(async (input, init) => {
		const url = String(input);
		if (init?.method === "PUT" && url.startsWith("/api/nginx/streams/1")) {
			putBodies.push(JSON.parse(String(init.body)));
			// saved, but nginx could not load the host
			return json({ ...stream, meta: { nginx_online: false, nginx_err: "bind() failed" } });
		}
		if (init?.method === "POST" && url.startsWith("/api/nginx/streams/test")) {
			testBodies.push(JSON.parse(String(init.body)));
			return json({
				ok: true,
				nginx_online: true,
				nginx_err: null,
				nginx_details: null,
				nginx_locations: [],
				upstreams: [],
				warnings: [],
			});
		}
		if (url.startsWith("/api/nginx/streams/1")) {
			return json(stream);
		}
		if (url.startsWith("/api/nginx/certificates")) {
			return json([]);
		}
		return json({});
	});
	vi.stubGlobal("fetch", fetchMock);
	vi.stubGlobal("confirm", vi.fn(() => false));
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	fetchMock.mockReset();
});

const saveWithWarning = async () => {
	render(
		<QueryClientProvider client={new QueryClient()}>
			<LocaleProvider>
				<EasyModal.Provider />
			</LocaleProvider>
		</QueryClientProvider>,
	);
	await act(async () => {
		showStreamModal(1);
	});
	const port = await screen.findByLabelText("Incoming Port");
	fireEvent.change(port, { target: { value: "8081" } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	const warning = await screen.findByTestId("save-warning");
	expect(putBodies).toHaveLength(1);
	expect(putBodies[0].incoming_port).toBe(8081);
	return warning;
};

describe("StreamModal save with warnings", () => {
	it("closes without an unsaved-changes prompt after the save went through", async () => {
		const warning = await saveWithWarning();
		expect(screen.getByLabelText("Incoming Port")).toHaveValue(8081);

		fireEvent.click(within(warning).getByRole("button"));

		expect(window.confirm).not.toHaveBeenCalled();
		await waitFor(() => expect(screen.queryByTestId("save-warning")).not.toBeInTheDocument());
	});

	it("still asks before discarding an edit made after the save", async () => {
		const warning = await saveWithWarning();
		fireEvent.change(screen.getByLabelText("Incoming Port"), { target: { value: "8082" } });

		fireEvent.click(within(warning).getByRole("button"));

		expect(window.confirm).toHaveBeenCalledOnce();
		// confirm() answered "no": the modal and the edit stay
		expect(screen.getByTestId("save-warning")).toBeInTheDocument();
		expect(screen.getByLabelText("Incoming Port")).toHaveValue(8082);

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(window.confirm).toHaveBeenCalledTimes(2);
		expect(screen.getByTestId("save-warning")).toBeInTheDocument();
	});
});

describe("StreamModal Test button", () => {
	it("tests the edited values without saving, the edit stays unsaved", async () => {
		render(
			<QueryClientProvider client={new QueryClient()}>
				<LocaleProvider>
					<EasyModal.Provider />
				</LocaleProvider>
			</QueryClientProvider>,
		);
		await act(async () => {
			showStreamModal(1);
		});
		fireEvent.change(await screen.findByLabelText("Incoming Port"), { target: { value: "8081" } });

		fireEvent.click(screen.getByRole("button", { name: "Test" }));

		await screen.findByText("Configuration OK");
		expect(testBodies).toHaveLength(1);
		expect(testBodies[0]).toMatchObject({ id: 1, incoming_port: 8081 });
		expect(putBodies).toHaveLength(0);
		expect(screen.getByLabelText("Incoming Port")).toHaveValue(8081);

		// a test is not a save: closing still asks about the edit
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(window.confirm).toHaveBeenCalledOnce();
		expect(screen.getByText("Configuration OK")).toBeInTheDocument();
	});
});
