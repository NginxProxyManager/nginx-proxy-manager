/**
 * Stub for bcrypt — replaces the native addon-based package when
 * node-gyp-build or native bindings are unavailable in the test env.
 *
 * Tests that exercise real password hashing should use the real module;
 * for all other tests the models are fully mocked anyway.
 */
const FAKE_HASH = "$2b$10$TESTHASHfakevalueusedinstubonlyXXXXXXXXXXXXXXXXXX";

export default {
	hash:        async (_data, _saltOrRounds) => FAKE_HASH,
	hashSync:    (_data, _saltOrRounds) => FAKE_HASH,
	compare:     async (_data, _hash) => true,
	compareSync: (_data, _hash) => true,
	genSalt:     async (_rounds) => "$2b$10$TESTSALTfakevalueXXXXXXXXXX",
	genSaltSync: (_rounds) => "$2b$10$TESTSALTfakevalueXXXXXXXXXX",
};
