import { decamelize } from "humps";

/**
 * This will convert a react-table sort object into
 * a string that the backend api likes:
 *   name.asc,id.desc
 */
export function tableSortToAPI(sortBy: any): string | undefined {
	if (sortBy?.length > 0) {
		const strs: string[] = [];
		sortBy.map((item: any) => {
			strs.push(`${decamelize(item.id)}.${item.desc ? "desc" : "asc"}`);
			return undefined;
		});
		return strs.join(",");
	}
	return;
}

/**
 * This will convert a react-table filters object into
 * a string that the backend api likes:
 *   name:contains=jam
 */
export function tableFiltersToAPI(filters: any[]): { [key: string]: string } {
	const items: { [key: string]: string } = {};
	if (filters?.length > 0) {
		filters.map((item: any) => {
			items[`${decamelize(item.id)}:${item.value.modifier}`] = item.value.value;
			return undefined;
		});
	}
	return items;
}

/**
 * Builds a filters object by removing entries with undefined, null, or empty string values.
 *
 */
export function buildFilters(filters?: Record<string, string | boolean | undefined | null>) {
	if (!filters) {
		return filters;
	}
	const result: Record<string, string> = {};
	for (const key in filters) {
		const value = filters[key];
		// If the value is undefined, null, or an empty string, skip it
		if (value === undefined || value === null || value === "") {
			continue;
		}
		result[key] = value.toString();
	}
	return result;
}
