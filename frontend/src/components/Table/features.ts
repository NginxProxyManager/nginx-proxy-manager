import {
	columnGroupingFeature,
	columnVisibilityFeature,
	createExpandedRowModel,
	createGroupedRowModel,
	createSortedRowModel,
	metaHelper,
	rowExpandingFeature,
	rowSortingFeature,
	tableFeatures,
} from "@tanstack/react-table";

interface ColumnMeta {
	className?: string;
}

interface TableMeta {
	isFetching?: boolean;
}

/**
 * Shared TanStack Table v9 feature registration for every table in the app.
 * Sorting and column visibility are used (or their APIs are called
 * unconditionally, e.g. `getVisibleFlatColumns`/`getVisibleCells`) by the
 * shared TableLayout/TableHeader/TableBody/EmptyData components, so every
 * table instance must register them even when a particular table doesn't
 * wire up controlled sorting state itself. The same applies to grouping and
 * expanding: TableBody calls `row.getIsGrouped()` on every row, so the
 * features must be registered even for the tables that never group.
 */
const features = tableFeatures({
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	columnVisibilityFeature,
	columnGroupingFeature,
	groupedRowModel: createGroupedRowModel(),
	rowExpandingFeature,
	expandedRowModel: createExpandedRowModel(),
	columnMeta: metaHelper<ColumnMeta>(),
	tableMeta: metaHelper<TableMeta>(),
});

type Features = typeof features;

export { type ColumnMeta, type Features, features, type TableMeta };
