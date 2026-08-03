/**
 * Serialize JSON fields before direct Knex query-builder writes.
 *
 * Objection serializes declared JSON attributes, but this monitor also uses
 * direct Knex writes. SQLite drivers accept only primitive bound values, so
 * handing them objects would fail at execution time.
 */
export const databaseJson = (value) => JSON.stringify(value ?? null);

export const databaseMetric = ({ counters, histograms, gauges, ...record }) => ({
	...record,
	counters: databaseJson(counters),
	histograms: databaseJson(histograms),
	gauges: databaseJson(gauges),
});
