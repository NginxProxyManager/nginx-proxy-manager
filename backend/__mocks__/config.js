/**
 * Stub for backend/lib/config.js — used in Jest ESM test environment.
 * Provides no-op implementations of configuration helpers so that models
 * can be imported without triggering real file-system or key-generation
 * side-effects.
 */

export const configure              = () => {};
export const isSqlite               = () => false;
export const isMysql                = () => false;
export const isPostgres             = () => false;
export const isCI                   = () => false;
export const isDebugMode            = () => false;
export const configGet              = (_key) => ({});
export const configHas              = (_key) => false;
export const getKeys                = () => ({ private: "", public: "" });
export const getPrivateKey          = () => "";
export const getPublicKey           = () => "";
export const generateKeys           = async () => {};
export const getConfig              = () => ({});
export const getSetting             = () => null;
export const useLetsencryptStaging  = () => false;
export const useLetsencryptServer   = () => "https://acme-v02.api.letsencrypt.org/directory";

export default {
	configure,
	isSqlite,
	isMysql,
	isPostgres,
	isCI,
	isDebugMode,
	configGet,
	configHas,
	getKeys,
	getPrivateKey,
	getPublicKey,
	generateKeys,
	getConfig,
	getSetting,
	useLetsencryptStaging,
	useLetsencryptServer,
};
