import { beforeEach, describe, expect, it, vi } from "vitest";
import { concludeAuthorized } from "../../../../lib/sso/lib";

/**
 * Test the execution path inside `concludeAuthorized()` as it is being called
 * with various SSO client configurations and user claims, and verify that each
 * call evaluates as expected.
 *
 * Mock all internals including database and existing users, and test that for a given input,
 * `internalToken.getTokenForSingleSignOnUser()` is called with the expected arguments,
 * or that the expected error path has been reached.
 */

let getTokenForSingleSignOnUserMock;
vi.mock("../../../../internal/token.js", () => ({
	default: {
		getTokenForSingleSignOnUser: vi.fn().mockImplementation(async (user, authType, issuer) => {
			return getTokenForSingleSignOnUserMock(user, authType, issuer);
		}),
	},
}));

vi.mock("../../../../internal/user.js", () => ({
	default: {
		provision: vi.fn().mockImplementation(() => newUser),
		ssoAccess: vi.fn().mockReturnValue(),
	},
}));

vi.mock("../../../../models/now_helper.js", () => ({
	default: vi.fn().mockReturnValue(""),
}));

vi.mock("../../../../models/user.js", () => ({
	default: {
		query: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		join: vi.fn().mockReturnThis(),
		leftJoin: vi.fn().mockReturnThis(),
		andWhere: vi.fn().mockReturnThis(),
		orWhere: vi.fn().mockReturnThis(),
		first: vi.fn().mockImplementation(() => Promise.resolve(users[userIndex.shift()])),
		table: vi.fn().mockReturnThis(),
		select: vi.fn().mockReturnThis(),
		transaction: vi.fn().mockReturnValue({
			commit: vi.fn().mockImplementation(() => newUser),
			rollback: vi.fn().mockReturnThis(),
		}),
		transacting: vi.fn().mockReturnThis(),
	},
}));

vi.mock("../../../../db.js", () => ({
	default: vi.fn().mockReturnValue({
		queryBuilder: vi.fn().mockImplementation(() => ({
			query: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			join: vi.fn().mockReturnThis(),
			leftJoin: vi.fn().mockReturnThis(),
			andWhere: vi.fn().mockReturnThis(),
			orWhere: vi.fn().mockReturnThis(),
			table: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			transacting: vi.fn().mockReturnThis(),
		})),
	}),
}));

let users;
let claims;
let userIndex;
let config;
const newUser = { id: 1000, email: "newProvisionedUser" };

beforeEach(() => {
	getTokenForSingleSignOnUserMock = vi.fn().mockResolvedValue(null);
	users = [
		{
			id: 88,
			email: "existingPasswordUser",
		},
		{
			id: 44,
			email: "existingEmailUser",
		},
		{
			id: 1,
			email: "existingProvisionedUser",
		},
		{
			id: 6,
			email: "existingDisabledUser",
		},
	];
	userIndex = [0, 1, 2, 3];
	config = {
		id: 1,
		client_type: "OpenID",
		owner_user_id: 123,
		meta: { role_map: [] },
		allow_internal: false,
		require_group: false,
		require_group_name: "",
		provisoin_users: false,
		require_provision_group: false,
		require_provision_group_name: "",
		require_verified_email: false,
	};
	claims = {
		iss: "foo-iss",
		sub: "foo-sub",
		email: "bar@email.com",
		email_verified: true,
		name: "Foo Bar",
		preferred_username: "foobar",
		groups: [],
	};
});

describe("concludeAuthorized() evaluation", () => {
	it("REJECTs when allow_internal=false and provision_users=false", async () => {
		users[1] = null; // no existing email user
		users[2] = null; // no provisioned user exists
		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.signup.not-permitted; sso.error.login.not-permitted",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});
});

describe("concludeAuthorized() internal user access evaluation", () => {
	it("REJECTs when internal user not found", async () => {
		config.allow_internal = true;
		users[0] = null; // simulate no internal user found
		users[1] = null; // no existing email user
		users[2] = null; // no provisioned user exists

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.signup.not-permitted; sso.error.login.not-found",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("ACCEPTs when internal user exists", async () => {
		users[1] = null; // no existing email user
		users[2] = null; // no provisioned user exists
		config.allow_internal = true;

		const result = await concludeAuthorized(config, claims);

		expect(result).toBeDefined();
		expect(getTokenForSingleSignOnUserMock).toHaveBeenCalledExactlyOnceWith(users[0], "sso-npm", "foo-iss");
	});

	it("REJECTs for unverified email", async () => {
		users[1] = null; // no existing email user
		users[2] = null; // no provisioned user exists
		config.allow_internal = true;
		claims.email_verified = false;

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.signup.not-permitted; sso.error.login.verified-email",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("REJECTs for missing email_verified claim", async () => {
		users[1] = null; // no existing email user
		users[2] = null; // no provisioned user exists
		config.allow_internal = true;
		delete claims.email_verified;

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.signup.not-permitted; sso.error.login.verified-email",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("REJECTs for unexpected email_verified claim", async () => {
		users[1] = null; // no existing email user
		users[2] = null; // no provisioned user exists
		config.allow_internal = true;
		claims.email_verified = "foo";

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.signup.not-permitted; sso.error.login.verified-email",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("REJECTs non administrator", async () => {
		users[1] = null; // no existing email user
		users[2] = null; // no provisioned user exists
		config.allow_internal = true;
		config.allow_internal_if_admin = true;

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.signup.not-permitted; sso.error.login.not-permitted-2",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("ACCEPTs administrator", async () => {
		users[2] = null; // no provisioned user exists
		users[0].roles = ["admin"];
		config.allow_internal = true;
		config.allow_internal_if_admin = true;

		const result = await concludeAuthorized(config, claims);

		expect(result).toBeDefined();
		expect(getTokenForSingleSignOnUserMock).toHaveBeenCalledExactlyOnceWith(users[0], "sso-npm", "foo-iss");
	});

	it("REJECTs for empty groups claim when require_group=true", async () => {
		users[1] = null; // no existing email user
		users[2] = null; // no existing provisoined user
		config.allow_internal = true;
		config.require_group = true;
		config.require_group_name = "test-1";

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.signup.not-permitted; sso.error.no-groups-claim",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("REJECTs for non matching group when require_group=true", async () => {
		users[1] = null; // no existing email user
		users[2] = null; // no existing provisoined user
		config.allow_internal = true;
		config.require_group = true;
		config.require_group_name = "test-1";
		claims.groups = ["test-abc"];

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.signup.not-permitted; sso.error.login.group-required",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("ACCEPTs when group matches", async () => {
		users[2] = null;
		config.allow_internal = true;
		config.require_group = true;
		config.require_group_name = "test-foo-bar";
		claims.groups = ["bar-baz", "test-foo-bar"];

		const result = await concludeAuthorized(config, claims);

		expect(result).toBeDefined();
		expect(getTokenForSingleSignOnUserMock).toHaveBeenCalledExactlyOnceWith(users[0], "sso-npm", "foo-iss");
	});
});

describe("concludeAuthorized() exissting provisioned user access evaluation", () => {
	it("REJECTs when existing provisioned user is disabled", async () => {
		users[2].is_disabled = true;

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.not-permitted; sso.error.login.not-permitted",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("REJECTs existing provisioned user with unverified email", async () => {
		users[1] = null; // no existing linked email user
		config.require_verified_email = true;
		claims.email_verified = false;

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.login.verified-email; sso.error.login.not-permitted",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("REJECTs existing provisioned user with missing email_verified claim", async () => {
		users[1] = null; // no existing linked email user
		config.require_verified_email = true;
		delete claims.email_verified;

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.login.verified-email; sso.error.login.not-permitted",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("REJECTs existing provisioned user with unexpected email_verified claim", async () => {
		users[1] = null; // no existing linked email user
		config.require_verified_email = true;
		claims.email_verified = "yes";

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.login.verified-email; sso.error.login.not-permitted",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("ACCEPTs when linked provisioned user exists for the given sso client", async () => {
		users[1] = null; // no existing email user
		users[2].sso_client_id = 1;

		const result = await concludeAuthorized(config, claims);

		expect(result).toBeDefined();
		expect(getTokenForSingleSignOnUserMock).toHaveBeenCalledExactlyOnceWith(users[2], "sso-idp", "foo-iss");
	});

	it("ACCEPTs when linked provisioned user exists for different sso client", async () => {
		config.provision_users = true;
		users[0] = null; // no existing password user
		users[3] = null; // no existing disabled user
		users[1].subject = "foo-sub";
		users[1].issuer = "foo-iss";

		const result = await concludeAuthorized(config, claims);

		expect(result).toBeDefined();
		expect(getTokenForSingleSignOnUserMock).toHaveBeenCalledExactlyOnceWith(users[2], "sso-idp", "foo-iss");
	});
});

describe("concludeAuthorized() provision new user account evaluation", () => {
	it("REJECTs when disabled user exists", async () => {
		config.provision_users = true;
		users[1] = null; // no existing email user
		users[2] = null; // no existing provisioned user
		users[0] = null; // no existing password user

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.not-permitted; sso.error.login.not-permitted",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("REJECTs when password user exists", async () => {
		config.provision_users = true;
		users[1] = null; // no existing email user
		users[2] = null; // no existing provisioned user
		users[3] = null; // no existing disabled user

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.signup.not-permitted-2; sso.error.login.not-permitted",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("REJECTs when email user exists", async () => {
		config.provision_users = true;
		users[0] = null; // no existing password user
		users[2] = null; // no existing provisioned user
		users[3] = null; // no existing disabled user

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.signup.unique-email; sso.error.login.not-permitted",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("REJECTs for unverified email", async () => {
		config.provision_users = true;
		config.require_verified_email = true;
		users[0] = null; // no existing password user
		users[1] = null; // no existing email user
		users[3] = null; // no existing disabled user
		claims.email_verified = false;

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.login.verified-email; sso.error.login.not-permitted",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("ACCEPTs without group", async () => {
		config.provision_users = true;
		users[0] = null; // no existing password user
		users[2] = null; // no existing provisoined user
		users[1] = null; // no existing email user
		users[3] = null; // no existing disabled user

		const result = await concludeAuthorized(config, claims);

		expect(result).toBeDefined();
		expect(getTokenForSingleSignOnUserMock).toHaveBeenCalledExactlyOnceWith(newUser, "sso-idp", "foo-iss");
	});

	it("REJECTs for incorrect groups configuration", async () => {
		config.provision_users = true;
		// these 3 together are incorrect config
		config.provision_role_map = [];
		config.require_provision_group = true;
		delete config.require_provision_group_name;
		users[0] = null; // no existing password user
		users[1] = null; // no existing email user
		users[2] = null; // no existing provisoined user
		users[3] = null; // no existing disabled user

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.config.group-required; sso.error.login.not-permitted",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("REJECTs for missing groups claim", async () => {
		config.provision_users = true;
		config.require_provision_group = true;
		config.require_provision_group_name = "foo-bar-baz";
		users[0] = null; // no existing password user
		users[1] = null; // no existing email user
		users[2] = null; // no existing provisoined user
		users[3] = null; // no existing disabled user
		delete claims.groups;

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.no-groups-claim-2; sso.error.login.not-permitted",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("REJECTs for missing group membership", async () => {
		config.provision_users = true;
		config.require_provision_group = true;
		config.require_provision_group_name = "foo-bar-baz";
		users[0] = null; // no existing password user
		users[1] = null; // no existing email user
		users[2] = null; // no existing provisoined user
		users[3] = null; // no existing disabled user
		claims.groups = ["foo-bar"];

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.signup.group-required; sso.error.login.not-permitted",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("ACCEPTs with mathcing group without role mapping", async () => {
		config.provision_users = true;
		config.require_provision_group = true;
		config.require_provision_group_name = "foo-bar-baz";
		users[0] = null; // no existing password user
		users[1] = null; // no existing email user
		users[2] = null; // no existing provisoined user
		users[3] = null; // no existing disabled user
		claims.groups = ["abc-123", "test", "foo-bar-baz"];

		const result = await concludeAuthorized(config, claims);

		expect(result).toBeDefined();
		expect(getTokenForSingleSignOnUserMock).toHaveBeenCalledExactlyOnceWith(newUser, "sso-idp", "foo-iss");
	});

	it("REJECTs without require group when no role mapping matches", async () => {
		config.provision_users = true;
		config.require_provision_group = true;
		config.require_provision_group_name = "";
		config.provision_role_map = [{ group: "foo", role: "user" }];
		users[0] = null; // no existing password user
		users[1] = null; // no existing email user
		users[2] = null; // no existing provisoined user
		users[3] = null; // no existing disabled user
		claims.groups = ["foo-bar"];

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.signup.group-required-2; sso.error.login.not-permitted",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("ACCEPTs without require group when role mapping matches to user role", async () => {
		config.provision_users = true;
		config.require_provision_group = true;
		config.require_provision_group_name = "";
		config.provision_role_map = [
			{ group: "foo", role: "user" },
			{ group: "bar", role: "admin" },
		];
		users[0] = null; // no existing password user
		users[1] = null; // no existing email user
		users[2] = null; // no existing provisoined user
		users[3] = null; // no existing disabled user
		claims.groups = ["abc-123", "test", "foo-bar-baz", "foo"];

		const result = await concludeAuthorized(config, claims);

		expect(result).toBeDefined();
		expect(getTokenForSingleSignOnUserMock).toHaveBeenCalledExactlyOnceWith(newUser, "sso-idp", "foo-iss");
	});

	it("ACCEPTs without require group when role mapping matches to admin role", async () => {
		config.provision_users = true;
		config.require_provision_group = true;
		config.require_provision_group_name = "";
		config.provision_role_map = [
			{ group: "foo", role: "user" },
			{ group: "bar", role: "admin" },
		];
		users[0] = null; // no existing password user
		users[1] = null; // no existing email user
		users[2] = null; // no existing provisoined user
		users[3] = null; // no existing disabled user
		claims.groups = ["abc-123", "test", "foo-bar-baz", "bar"];

		const result = await concludeAuthorized(config, claims);

		expect(result).toBeDefined();
		expect(getTokenForSingleSignOnUserMock).toHaveBeenCalledExactlyOnceWith(newUser, "sso-idp", "foo-iss");
	});

	it("REJECTs missing group membership when group and role mapping both required", async () => {
		config.provision_users = true;
		config.require_provision_group = true;
		config.require_provision_group_name = "bar-baz-foo";
		config.provision_role_map = [{ group: "foo", role: "user" }];
		users[0] = null; // no existing password user
		users[1] = null; // no existing email user
		users[2] = null; // no existing provisoined user
		users[3] = null; // no existing disabled user
		claims.groups = ["foo-bar"];

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.signup.group-required-3; sso.error.login.not-permitted",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("REJECTs missing role match when group and role mapping both required", async () => {
		config.provision_users = true;
		config.require_provision_group = true;
		config.require_provision_group_name = "bar-baz-foo";
		config.provision_role_map = [{ group: "foo", role: "user" }];
		users[0] = null; // no existing password user
		users[1] = null; // no existing email user
		users[2] = null; // no existing provisoined user
		users[3] = null; // no existing disabled user
		claims.groups = ["bar-baz-foo"];

		await expect(concludeAuthorized(config, claims)).rejects.toThrow(
			"sso.error.signup.group-required-3; sso.error.login.not-permitted",
		);
		expect(getTokenForSingleSignOnUserMock).not.toHaveBeenCalled();
	});

	it("ACCEPTs with both group match and role mapped", async () => {
		config.provision_users = true;
		config.require_provision_group = true;
		config.require_provision_group_name = "bar-baz-foo";
		config.provision_role_map = [
			{ group: "foo", role: "user" },
			{ group: "bar", role: "admin" },
		];
		users[0] = null; // no existing password user
		users[1] = null; // no existing email user
		users[2] = null; // no existing provisoined user
		users[3] = null; // no existing disabled user
		claims.groups = ["abc-123", "test", "foo-bar-baz", "bar", "bar-baz-foo"];

		const result = await concludeAuthorized(config, claims);

		expect(result).toBeDefined();
		expect(getTokenForSingleSignOnUserMock).toHaveBeenCalledExactlyOnceWith(newUser, "sso-idp", "foo-iss");
	});
});
