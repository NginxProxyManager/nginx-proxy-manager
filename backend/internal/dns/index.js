import selectel from "./selectel.js";

const drivers = {
	selectel,
};

export const SUPPORTED_TYPES = Object.keys(drivers);

/**
 * @param {string} type
 * @returns {{authenticate:Function, listZones:Function, createRecord:Function, deleteRecord:Function, testConnection:Function}}
 */
export const getDriver = (type) => {
	const driver = drivers[type];
	if (!driver) {
		throw new Error(`Unsupported DNS provider type: ${type}`);
	}
	return driver;
};
