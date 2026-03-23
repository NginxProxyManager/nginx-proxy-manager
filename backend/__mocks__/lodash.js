/**
 * ESM stub for lodash — used in Jest ESM test environment.
 * The real lodash is CJS and may not resolve correctly through Jest's ESM resolver.
 */

const noop = () => {};

const _ = {
	isArray:    Array.isArray,
	isString:   (v) => typeof v === "string",
	isObject:   (v) => v !== null && typeof v === "object",
	isFunction: (v) => typeof v === "function",
	isNumber:   (v) => typeof v === "number",
	isUndefined:(v) => v === undefined,
	isNull:     (v) => v === null,
	isNil:      (v) => v == null,
	isEmpty:    (v) => !v || (Array.isArray(v) ? v.length === 0 : typeof v === "object" ? Object.keys(v).length === 0 : false),
	merge:      (target, ...sources) => Object.assign(target ?? {}, ...sources),
	omit:       (obj, keys) => {
		const result = { ...obj };
		const ks = Array.isArray(keys) ? keys : [keys];
		for (const k of ks) delete result[k];
		return result;
	},
	pick:       (obj, keys) => {
		const result = {};
		const ks = Array.isArray(keys) ? keys : [keys];
		for (const k of ks) if (k in obj) result[k] = obj[k];
		return result;
	},
	clone:      (v) => Array.isArray(v) ? [...v] : typeof v === "object" && v ? { ...v } : v,
	cloneDeep:  (v) => JSON.parse(JSON.stringify(v)),
	assign:     Object.assign,
	forEach:    (collection, fn) => {
		if (Array.isArray(collection)) { collection.forEach(fn); }
		else if (collection && typeof collection === "object") { Object.entries(collection).forEach(([k, v]) => { fn(v, k); }); }
	},
	map:        (collection, fn) => {
		if (Array.isArray(collection)) return collection.map(fn);
		if (collection && typeof collection === "object") return Object.entries(collection).map(([k, v]) => fn(v, k));
		return [];
	},
	filter:     (arr, fn) => Array.isArray(arr) ? arr.filter(fn) : [],
	find:       (arr, fn) => Array.isArray(arr) ? arr.find(fn) : undefined,
	reduce:     (arr, fn, init) => Array.isArray(arr) ? arr.reduce(fn, init) : init,
	some:       (arr, fn) => Array.isArray(arr) ? arr.some(fn) : false,
	every:      (arr, fn) => Array.isArray(arr) ? arr.every(fn) : true,
	keys:       Object.keys,
	values:     Object.values,
	entries:    Object.entries,
	get:        (obj, path, def) => {
		if (!obj) return def;
		const parts = typeof path === "string" ? path.split(".") : path;
		let cur = obj;
		for (const p of parts) { if (cur == null) return def; cur = cur[p]; }
		return cur === undefined ? def : cur;
	},
	set:        (obj, path, val) => {
		const parts = typeof path === "string" ? path.split(".") : path;
		let cur = obj;
		for (let i = 0; i < parts.length - 1; i++) { if (!cur[parts[i]]) cur[parts[i]] = {}; cur = cur[parts[i]]; }
		cur[parts[parts.length - 1]] = val;
		return obj;
	},
	has:        (obj, key) => Object.hasOwn(obj ?? {}, key),
	defaults:   (obj, ...sources) => { for (const src of sources) for (const [k, v] of Object.entries(src)) if (obj[k] === undefined) obj[k] = v; return obj; },
	flatten:    (arr) => arr.flat(),
	flatMap:    (arr, fn) => arr.flatMap(fn),
	uniq:       (arr) => [...new Set(arr)],
	sortBy:     (arr, fn) => [...arr].sort((a, b) => { const va = typeof fn === "function" ? fn(a) : a[fn]; const vb = typeof fn === "function" ? fn(b) : b[fn]; return va < vb ? -1 : va > vb ? 1 : 0; }),
	noop,
};

export default _;
