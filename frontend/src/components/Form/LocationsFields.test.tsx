import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Form, Formik } from "formik";
import type { NginxLocationStatus, ProxyLocation } from "src/api/backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	cleanLocations,
	isBlankLocation,
	LocationsFields,
	statusForRow,
	validateLocations,
} from "./LocationsFields";

vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "en" }) }));
vi.mock("src/hooks", () => ({
	useAccessLists: () => ({ isLoading: false, isError: false, data: [] }),
}));

const loc = (l: Partial<ProxyLocation>): ProxyLocation => ({
	path: "/a",
	advancedConfig: "",
	forwardScheme: "http",
	forwardHost: "app",
	forwardPort: 80,
	accessListId: 0,
	...l,
});

const renderFields = (
	initial: ProxyLocation[],
	props: { statuses?: NginxLocationStatus[]; highlightIndex?: number | null; allowAdvanced?: boolean } = {},
) => {
	const onSubmit = vi.fn();
	const utils = render(
		<Formik initialValues={{ locations: initial }} onSubmit={onSubmit}>
			{({ values }) => (
				<Form>
					<LocationsFields initialValues={initial} {...props} />
					<output data-testid="values">{JSON.stringify(values.locations)}</output>
					<button type="submit">save</button>
				</Form>
			)}
		</Formik>,
	);
	const formValues = () => JSON.parse(screen.getByTestId("values").textContent || "[]") as ProxyLocation[];
	return { ...utils, onSubmit, formValues };
};

describe("validateLocations", () => {
	it("accepts valid locations and ignores blank rows", () => {
		expect(validateLocations([loc({}), loc({ path: "", forwardHost: "" })])).toEqual([undefined, undefined]);
	});

	it("requires path, host and a valid port for rows with content", () => {
		const [e] = validateLocations([loc({ path: "", forwardHost: "app", forwardPort: "" as any })]);
		expect(e?.path).toBe("This is required");
		expect(e?.forwardPort).toBe("This is required");
		const [e2] = validateLocations([loc({ forwardHost: "", forwardPort: 70000 })]);
		expect(e2?.forwardHost).toBe("This is required");
		expect(e2?.forwardPort).toMatch(/65535/);
		const [e3] = validateLocations([loc({ forwardPort: 0 })]);
		expect(e3?.forwardPort).toMatch(/1/);
	});

	it("flags whitespace and nginx syntax characters in the host", () => {
		expect(validateLocations([loc({ forwardHost: "my app" })])[0]?.forwardHost).toMatch(/spaces/);
		expect(validateLocations([loc({ forwardHost: "app;evil" })])[0]?.forwardHost).toMatch(/not allowed/);
		// surrounding whitespace is trimmed by the server, host/path is allowed
		expect(validateLocations([loc({ forwardHost: " app/sub/ " })])[0]).toBeUndefined();
	});

	it("requires a host part, not just a path", () => {
		// the server would store an empty forward host and quarantine the location
		for (const forwardHost of ["/api", " /x", "/", "  "]) {
			expect(validateLocations([loc({ forwardHost })])[0]?.forwardHost).toMatch(/required/);
		}
	});

	it("rejects nginx syntax characters and whitespace in the path part", () => {
		for (const forwardHost of [
			"app/x;y",
			"app/a}",
			"app/{a",
			"app/#x",
			'app/"q',
			"app/'q",
			"app/`q",
			"app/a\\b",
			"app/my path",
			"app/$" + "{a b}",
			"app/$" + "{}",
			"app/a\tb",
			"$backend/a;b",
		]) {
			expect(validateLocations([loc({ forwardHost })])[0]?.forwardHost).toMatch(
				/invalid characters in forward path/i,
			);
		}
		// nginx variables in the path are fine
		for (const forwardHost of [
			"app/$uri",
			"$backend/api/$arg_x",
			"app/a-b_c.d/~e",
			// braced variables, like the backend
			"app/$" + "{uri}",
			"$backend/api/$" + "{arg_x}/x",
		]) {
			expect(validateLocations([loc({ forwardHost })])[0]).toBeUndefined();
		}
	});

	it("allows a forward host that is a single nginx variable", () => {
		expect(validateLocations([loc({ forwardHost: "$backend" })])[0]).toBeUndefined();
		expect(validateLocations([loc({ forwardHost: " $up_2 " })])[0]).toBeUndefined();
		// anything else with a $ (or # or \) is rejected like the backend does
		for (const host of ["$backend:80", "app$x", "$1x", "$" + "{backend}", "a#b", "a\\b"]) {
			expect(validateLocations([loc({ forwardHost: host })])[0]?.forwardHost).toMatch(/not allowed/);
		}
	});

	it("checks only the host part of host/path, like the backend", () => {
		// the backend splits at the first "/" and validates the host part only
		expect(validateLocations([loc({ forwardHost: "$backend/api" })])[0]).toBeUndefined();
		expect(validateLocations([loc({ forwardHost: " $up_2/a/b/ " })])[0]).toBeUndefined();
		expect(validateLocations([loc({ forwardHost: "$back end" })])[0]?.forwardHost).toBeTruthy();
		expect(validateLocations([loc({ forwardHost: "$back;end/api" })])[0]?.forwardHost).toMatch(/not allowed/);
		expect(validateLocations([loc({ forwardHost: "app$x/api" })])[0]?.forwardHost).toMatch(/not allowed/);
	});

	it("treats a prefix path and the same path with ^~ as duplicates", () => {
		const errors = validateLocations([loc({ path: "/x" }), loc({ path: "^~ /x" }), loc({ path: "^~/y" })]);
		expect(errors[0]?.path).toMatch(/already uses \^~ \/x/);
		expect(errors[1]?.path).toMatch(/already uses \/x/);
		expect(errors[2]).toBeUndefined();
		// nginx strips the quotes of a quoted path
		expect(validateLocations([loc({ path: '"/q"' }), loc({ path: "/q" })])[1]?.path).toMatch(/already uses/);
	});

	it("allows duplicate regex and named locations, which nginx accepts", () => {
		expect(
			validateLocations([
				loc({ path: "~* \\.php$" }),
				loc({ path: "~*  \\.php$" }),
				loc({ path: "~ ^/api" }),
				loc({ path: "~ ^/api" }),
				loc({ path: "@fallback" }),
				loc({ path: "@fallback" }),
			]),
		).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
		// an exact location doesn't clash with the prefix location of the same URI
		expect(validateLocations([loc({ path: "= /x" }), loc({ path: "/x" })])).toEqual([undefined, undefined]);
	});

	it("flags duplicate paths after normalising the modifier", () => {
		const errors = validateLocations([loc({ path: "= /x" }), loc({ path: "=/x " }), loc({ path: "/x" })]);
		expect(errors[0]?.path).toMatch(/already uses = \/x/);
		expect(errors[1]?.path).toMatch(/already uses/);
		expect(errors[2]).toBeUndefined();
	});

	it("cleanLocations only drops completely blank rows", () => {
		const rows = [loc({ path: "", forwardHost: "" }), loc({ path: "", forwardHost: "app" })];
		expect(isBlankLocation(rows[0])).toBe(true);
		expect(cleanLocations(rows)).toEqual([rows[1]]);
	});

	it("statusForRow only returns a status that still matches the row's path", () => {
		const statuses: NginxLocationStatus[] = [
			{ index: 0, path: "/a", status: "quarantined", mode: null, message: "no" },
		];
		expect(statusForRow(statuses, 0, loc({ path: "/a" }))?.status).toBe("quarantined");
		expect(statusForRow(statuses, 0, loc({ path: "/b" }))).toBeUndefined();
	});

	it("statusForRow drops a saved 'disabled' once the row is switched on again", () => {
		const statuses: NginxLocationStatus[] = [
			{ index: 0, path: "/a", status: "disabled", mode: null, message: null },
		];
		expect(statusForRow(statuses, 0, loc({ path: "/a", enabled: false }))?.status).toBe("disabled");
		expect(statusForRow(statuses, 0, loc({ path: "/a", enabled: true }))).toBeUndefined();
		expect(statusForRow(statuses, 0, loc({ path: "/a" }))).toBeUndefined();
	});
});

describe("LocationsFields", () => {
	afterEach(() => cleanup());

	it("shows server status badges, hiding ok", () => {
		renderFields([loc({ path: "/ok" }), loc({ path: "/api" }), loc({ path: "/old" })], {
			statuses: [
				{ index: 0, path: "/ok", status: "ok", mode: "dynamic", message: null },
				{ index: 1, path: "/api", status: "quarantined", mode: null, message: "nginx rejected it" },
				{ index: 2, path: "/old", status: "unresolved", mode: "dynamic", message: null },
			],
		});
		expect(screen.getByTestId("location-card-0").querySelector("[data-status]")).toBeNull();
		expect(screen.getByTestId("location-card-1").querySelector("[data-status]")).toHaveAttribute(
			"data-status",
			"quarantined",
		);
		expect(screen.getByTestId("location-card-1")).toHaveTextContent("Not active");
		expect(screen.getByTestId("location-card-2")).toHaveTextContent("Unresolved");
	});

	it("toggles a location off and on via the enabled switch", () => {
		const { formValues } = renderFields([loc({ path: "/a" })]);
		const toggle = screen.getByLabelText("Enable or disable this location") as HTMLInputElement;
		expect(toggle.checked).toBe(true);
		fireEvent.click(toggle);
		expect(formValues()[0].enabled).toBe(false);
		expect(screen.getByTestId("location-card-0")).toHaveTextContent("Disabled");
		fireEvent.click(toggle);
		expect(formValues()[0].enabled).toBe(true);
	});

	it("doesn't keep a saved 'Disabled' badge after the location is switched on", () => {
		renderFields([loc({ path: "/api", enabled: false })], {
			statuses: [{ index: 0, path: "/api", status: "disabled", mode: null, message: null }],
		});
		const card = screen.getByTestId("location-card-0");
		expect(card.querySelector("[data-status]")).toHaveAttribute("data-status", "disabled");
		fireEvent.click(screen.getByLabelText("Enable or disable this location"));
		expect(card.querySelector("[data-status]")).toBeNull();
		expect(card).not.toHaveTextContent("Disabled");
	});

	it("blocks submit with invalid rows, expands them and shows the errors", async () => {
		const { onSubmit } = renderFields([loc({ path: "/a" }), loc({ path: "/a", forwardHost: "bad host" })]);
		// collapsed: no inputs visible yet
		expect(screen.queryByPlaceholderText("/path")).toBeNull();
		fireEvent.click(screen.getByText("save"));
		await waitFor(() => expect(screen.getAllByPlaceholderText("/path").length).toBe(2));
		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getAllByText(/Another location already uses \/a/).length).toBe(2);
		expect(screen.getByText("The host must not contain spaces")).toBeInTheDocument();
		expect(screen.getByTestId("location-card-1").querySelector(".is-invalid")).not.toBeNull();
		expect(screen.getAllByLabelText("This location has errors").length).toBe(2);
	});

	it("submits valid locations, storing the port as a number", async () => {
		const { onSubmit } = renderFields([loc({ path: "/a" })]);
		fireEvent.click(screen.getByText("/a"));
		fireEvent.change(screen.getByPlaceholderText("eg: 8081"), { target: { value: "8080" } });
		fireEvent.click(screen.getByText("save"));
		await waitFor(() => expect(onSubmit).toHaveBeenCalled());
		expect(onSubmit.mock.calls[0][0].locations[0].forwardPort).toBe(8080);
	});

	it("does not silently drop a row with content but no path", async () => {
		const { onSubmit, formValues } = renderFields([]);
		fireEvent.click(screen.getByText("Add Location"));
		fireEvent.change(screen.getByPlaceholderText("/path"), { target: { value: "/x" } });
		fireEvent.change(screen.getByPlaceholderText("/path"), { target: { value: "" } });
		const host = document.querySelector("[id^=location-forwardHost-]") as HTMLInputElement;
		fireEvent.change(host, { target: { value: "app" } });
		expect(formValues()).toHaveLength(1);
		fireEvent.click(screen.getByText("save"));
		await waitFor(() => expect(screen.getByText("This is required")).toBeInTheDocument());
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("opens the highlighted location", () => {
		renderFields([loc({ path: "/a" }), loc({ path: "/b" })], { highlightIndex: 1 });
		expect(screen.getAllByPlaceholderText("/path")).toHaveLength(1);
		expect((screen.getByPlaceholderText("/path") as HTMLInputElement).value).toBe("/b");
	});

	it("shows the advanced config of a location only to those who may change it", () => {
		renderFields([loc({ path: "/a", advancedConfig: "expires 1d;" })], { highlightIndex: 0 });
		fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
		expect(screen.getByDisplayValue("expires 1d;")).toBeInTheDocument();
		cleanup();

		renderFields([loc({ path: "/a", advancedConfig: "expires 1d;" })], { highlightIndex: 0, allowAdvanced: false });
		expect(screen.getByPlaceholderText("/path")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Advanced" })).toBeNull();
		expect(screen.queryByDisplayValue("expires 1d;")).toBeNull();
	});
});
