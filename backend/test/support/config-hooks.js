// Module hooks for tests that load the internal/* modules: lib/config.js is swapped for fake-config.js, so
// no /data/keys.json is needed and the database is an in-memory SQLite. See backend.js.
let real = null;
let fake = null;

export async function initialize(data) {
	real = data.real;
	fake = data.fake;
}

export async function resolve(specifier, context, next) {
	const result = await next(specifier, context);
	if (result.url === real && context.parentURL !== fake) {
		return { ...result, url: fake, shortCircuit: true };
	}
	return result;
}
