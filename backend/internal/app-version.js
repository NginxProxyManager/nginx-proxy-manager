import pjson from "../package.json" with { type: "json" };

const SEMVER_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

const parseVersion = (value) => {
	const match = SEMVER_PATTERN.exec(String(value || "").trim());
	if (!match) return null;

	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		revision: Number(match[3]),
	};
};

const getVersion = () => {
	const version = parseVersion(process.env.NPM_BUILD_VERSION) || parseVersion(pjson.version);
	if (!version) throw new Error("Application version must use major.minor.patch format");
	return version;
};

const formatVersion = (version = getVersion()) => `${version.major}.${version.minor}.${version.revision}`;

export { formatVersion, getVersion, parseVersion };
