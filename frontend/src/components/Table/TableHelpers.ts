export interface TablePagination {
	limit: number;
	offset: number;
	total: number;
}

export interface TableSortBy {
	id: string;
	desc: boolean;
}

export interface TableFilter {
	id: string;
	value: any;
}

const tableEvents = {
	FILTERS_CHANGED: "FILTERS_CHANGED",
	PAGE_CHANGED: "PAGE_CHANGED",
	PAGE_SIZE_CHANGED: "PAGE_SIZE_CHANGED",
	TOTAL_COUNT_CHANGED: "TOTAL_COUNT_CHANGED",
	SORT_CHANGED: "SORT_CHANGED",
};

const tableEventReducer = (state: any, { type, payload }: any) => {
	switch (type) {
		case tableEvents.PAGE_CHANGED:
			return {
				...state,
				offset: payload * state.limit,
			};
		case tableEvents.PAGE_SIZE_CHANGED:
			return {
				...state,
				limit: payload,
			};
		case tableEvents.TOTAL_COUNT_CHANGED:
			return {
				...state,
				total: payload,
			};
		case tableEvents.SORT_CHANGED:
			return {
				...state,
				sortBy: payload,
			};
		case tableEvents.FILTERS_CHANGED:
			return {
				...state,
				filters: payload,
			};
		default:
			throw new Error(`Unhandled action type: ${type}`);
	}
};

export { tableEvents, tableEventReducer };
