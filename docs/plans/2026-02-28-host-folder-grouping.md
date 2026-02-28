# Host Folder Grouping — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to assign hosts to named folders for visual grouping in the dashboard, using TanStack Table v8 built-in grouping, with zero backend or database changes.

**Architecture:** Folder name is stored in `meta.folder` (string) on each host. TanStack Table grouping is activated per-table with a hidden virtual column; a `renderRow` escape-hatch is added to `TableBody` to render folder header rows as full-width `<tr>` elements. The Edit modal on each host type gets a combobox Folder field populated from the React Query cache.

**Tech Stack:** React 19 + TypeScript, TanStack React Table v8, React Query v5, Formik, React Bootstrap / Tabler, React Intl, Vite + Biome.

---

## Local Dev Setup

### Full stack (recommended — requires Docker Desktop)

```bash
cd /path/to/nginx-proxy-manager
./scripts/start-dev
```

After a few minutes the app is available at **http://localhost:3081**.
Hot reload is active for frontend and backend files.

### Frontend only (if you already have a running backend)

```bash
cd frontend
npm install
npm run dev     # Vite dev server on http://localhost:3000
```

The Vite config proxies `/api` requests. If the backend runs elsewhere, edit `frontend/vite.config.ts` proxy target.

---

## Branch

```bash
git checkout -b feat/host-folder-grouping
```

---

## Task 1 — Create the feature branch

**Files:** none (git only)

**Step 1: Create and switch to the branch**

```bash
git checkout -b feat/host-folder-grouping
```

Expected: `Switched to a new branch 'feat/host-folder-grouping'`

**Step 2: Commit the design docs already on develop**

```bash
git cherry-pick HEAD  # already committed to develop, nothing to do here
# The design doc is already committed — branch is clean
git log --oneline -3
```

---

## Task 2 — Add `renderRow` escape-hatch to `TableBody` / `TableLayout`

This allows any table to render grouped rows as custom full-width cells without changing the existing flat-row rendering path.

**Files:**
- Modify: `frontend/src/components/Table/TableBody.tsx`
- Modify: `frontend/src/components/Table/TableLayout.tsx`

**Step 1: Read the current files**

```bash
# already done — see design doc
```

**Step 2: Modify `TableBody.tsx`**

Replace the entire file with:

```tsx
import { flexRender } from "@tanstack/react-table";
import type { Row } from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { TableLayoutProps } from "src/components";
import { EmptyRow } from "./EmptyRow";

function TableBody<T>(props: TableLayoutProps<T>) {
	const { tableInstance, extraStyles, emptyState, renderRow } = props;
	const rows = tableInstance.getRowModel().rows;

	if (rows.length === 0) {
		return (
			<tbody className="table-tbody">
				{emptyState ? emptyState : <EmptyRow tableInstance={tableInstance} />}
			</tbody>
		);
	}

	const defaultRenderRow = (row: any): ReactNode => (
		<tr key={row.id} {...extraStyles?.row(row.original)}>
			{row.getVisibleCells().map((cell: any) => {
				const { className } = (cell.column.columnDef.meta as any) ?? {};
				return (
					<td key={cell.id} className={className}>
						{flexRender(cell.column.columnDef.cell, cell.getContext())}
					</td>
				);
			})}
		</tr>
	);

	return (
		<tbody className="table-tbody">
			{rows.map((row: any) => (renderRow ? renderRow(row) : defaultRenderRow(row)))}
		</tbody>
	);
}

export { TableBody };
```

**Step 3: Update `TableLayoutProps` in `TableLayout.tsx`**

```tsx
import type { Row, Table as ReactTable } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { TableBody } from "./TableBody";
import { TableHeader } from "./TableHeader";

interface TableLayoutProps<TFields> {
	tableInstance: ReactTable<TFields>;
	emptyState?: React.ReactNode;
	extraStyles?: {
		row: (rowData: TFields) => any | undefined;
	};
	renderRow?: (row: Row<TFields>) => ReactNode;
}
function TableLayout<TFields>(props: TableLayoutProps<TFields>) {
	const hasRows = props.tableInstance.getRowModel().rows.length > 0;
	return (
		<div className="table-responsive">
			<table className="table table-vcenter table-selectable mb-0">
				{hasRows ? <TableHeader tableInstance={props.tableInstance} /> : null}
				<TableBody {...props} />
			</table>
		</div>
	);
}

export { TableLayout, type TableLayoutProps };
```

**Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

**Step 5: Commit**

```bash
git add frontend/src/components/Table/TableBody.tsx frontend/src/components/Table/TableLayout.tsx
git commit -m "feat: add renderRow escape-hatch to TableBody for custom grouped row rendering"
```

---

## Task 3 — Add i18n keys

**Files:**
- Modify: `frontend/src/locale/src/en.json`

The file format is `{ "key": { "defaultMessage": "English text" } }`, entries must be kept sorted alphabetically.

**Step 1: Add the two keys**

Find the alphabetical position for `"folder"` (after `"filter"`, before `"format"`) and insert:

```json
"folder": {
    "defaultMessage": "Folder"
},
"folder.placeholder": {
    "defaultMessage": "e.g. Production (optional)"
},
```

**Step 2: Compile locales**

```bash
cd frontend && npm run locale-compile
```

Expected: no errors, `lang/` files updated.

**Step 3: Commit**

```bash
git add frontend/src/locale/src/en.json frontend/src/locale/lang/
git commit -m "feat: add folder i18n keys"
```

---

## Task 4 — Create the reusable `FolderField` component

Used inside each host Edit modal to let the user type or pick a folder name.

**Files:**
- Create: `frontend/src/components/FolderField.tsx`
- Modify: `frontend/src/components/index.ts`

**Step 1: Create `FolderField.tsx`**

```tsx
import { useField } from "formik";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { intl, T } from "src/locale";

interface Props {
	queryKey: string;      // e.g. "proxy-hosts"
	metaPath?: string;     // Formik field name, default "meta.folder"
}

export function FolderField({ queryKey, metaPath = "meta.folder" }: Props) {
	const queryClient = useQueryClient();
	const [field, , helpers] = useField(metaPath);

	const existingFolders = useMemo(() => {
		const cached = queryClient.getQueryData<any[]>([queryKey]) ?? [];
		return [...new Set(cached.map((h: any) => h.meta?.folder).filter(Boolean) as string[])].sort();
	}, [queryClient, queryKey]);

	const listId = `folder-list-${queryKey}`;

	return (
		<div className="mb-3">
			<label className="form-label" htmlFor={metaPath}>
				<T id="folder" />
			</label>
			<input
				id={metaPath}
				type="text"
				className="form-control"
				list={listId}
				placeholder={intl.formatMessage({ id: "folder.placeholder" })}
				value={field.value ?? ""}
				onChange={(e) => helpers.setValue(e.target.value || undefined)}
				onBlur={field.onBlur}
				autoComplete="off"
			/>
			<datalist id={listId}>
				{existingFolders.map((f) => (
					<option key={f} value={f} />
				))}
			</datalist>
		</div>
	);
}
```

**Step 2: Export from `frontend/src/components/index.ts`**

Find the existing named exports and add:

```ts
export { FolderField } from "./FolderField";
```

**Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

**Step 4: Commit**

```bash
git add frontend/src/components/FolderField.tsx frontend/src/components/index.ts
git commit -m "feat: add reusable FolderField combobox component"
```

---

## Task 5 — Proxy Hosts: modal + table + wrapper

### 5a — ProxyHostModal: add Folder field

**Files:**
- Modify: `frontend/src/modals/ProxyHostModal.tsx`

**Step 1: Import FolderField**

At the top of the imports block, add `FolderField` to the existing component import:

```tsx
import {
	AccessField,
	Button,
	DomainNamesField,
	FolderField,         // add this
	HasPermission,
	Loading,
	LocationsFields,
	NginxConfigField,
	SSLCertificateField,
	SSLOptionsFields,
} from "src/components";
```

**Step 2: Add `meta.folder` to Formik initial values**

In the `initialValues` object, `meta` is already initialized as `data?.meta || {}`. No change needed here — `meta.folder` is read from `meta` automatically via Formik's nested field path `"meta.folder"`.

**Step 3: Add FolderField to the Details tab**

Inside `<div className="tab-pane active show" id="tab-details">`, after `<AccessField />` and before the Options section (the `<div className="my-3">` with `<h4 className="py-2">`), insert:

```tsx
<FolderField queryKey="proxy-hosts" />
```

**Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

**Step 5: Commit**

```bash
git add frontend/src/modals/ProxyHostModal.tsx
git commit -m "feat: add Folder field to ProxyHost edit modal"
```

---

### 5b — ProxyHosts Table: TanStack grouping + FolderHeaderRow

**Files:**
- Modify: `frontend/src/pages/Nginx/ProxyHosts/Table.tsx`

**Step 1: Update imports**

```tsx
import { IconChevronDown, IconChevronRight, IconDotsVertical, IconEdit, IconPower, IconTrash } from "@tabler/icons-react";
import {
	type ExpandedState,
	type GroupingState,
	type Row,
	createColumnHelper,
	flexRender,
	getCoreRowModel,
	getExpandedRowModel,
	getGroupedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useMemo } from "react";
import type { ProxyHost } from "src/api/backend";
import {
	AccessListFormatter,
	CertificateFormatter,
	DomainsFormatter,
	EmptyData,
	GravatarFormatter,
	HasPermission,
	TrueFalseFormatter,
} from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
```

**Step 2: Update Props interface**

```tsx
interface Props {
	data: ProxyHost[];
	isFiltered?: boolean;
	isFetching?: boolean;
	expanded: ExpandedState;
	onExpandedChange: (expanded: ExpandedState) => void;
	onEdit?: (id: number) => void;
	onDelete?: (id: number) => void;
	onDisableToggle?: (id: number, enabled: boolean) => void;
	onNew?: () => void;
}
```

**Step 3: Rewrite the Table function**

Replace the full `export default function Table(...)` with:

```tsx
export default function Table({ data, isFetching, expanded, onExpandedChange, onEdit, onDelete, onDisableToggle, onNew, isFiltered }: Props) {
	const columnHelper = createColumnHelper<ProxyHost>();

	const grouping: GroupingState = useMemo(() => ["folder"], []);

	const columns = useMemo(
		() => [
			// Hidden grouping column — not rendered, drives TanStack grouping
			columnHelper.accessor((row) => row.meta?.folder ?? "", {
				id: "folder",
				enableGrouping: true,
				enableSorting: false,
				header: () => null,
				cell: () => null,
			}),
			columnHelper.accessor((row: any) => row.owner, {
				id: "owner",
				cell: (info: any) => {
					const value = info.getValue();
					return <GravatarFormatter url={value ? value.avatar : ""} name={value ? value.name : ""} />;
				},
				meta: { className: "w-1" },
			}),
			columnHelper.accessor((row: any) => row, {
				id: "domainNames",
				header: intl.formatMessage({ id: "column.source" }),
				cell: (info: any) => {
					const value = info.getValue();
					return <DomainsFormatter domains={value.domainNames} createdOn={value.createdOn} />;
				},
			}),
			columnHelper.accessor((row: any) => row, {
				id: "forwardHost",
				header: intl.formatMessage({ id: "column.destination" }),
				cell: (info: any) => {
					const value = info.getValue();
					return `${value.forwardScheme}://${value.forwardHost}:${value.forwardPort}`;
				},
			}),
			columnHelper.accessor((row: any) => row.certificate, {
				id: "certificate",
				header: intl.formatMessage({ id: "column.ssl" }),
				cell: (info: any) => <CertificateFormatter certificate={info.getValue()} />,
			}),
			columnHelper.accessor((row: any) => row.accessList, {
				id: "accessList",
				header: intl.formatMessage({ id: "column.access" }),
				cell: (info: any) => <AccessListFormatter access={info.getValue()} />,
			}),
			columnHelper.accessor((row: any) => row.enabled, {
				id: "enabled",
				header: intl.formatMessage({ id: "column.status" }),
				cell: (info: any) => <TrueFalseFormatter value={info.getValue()} trueLabel="online" falseLabel="offline" />,
			}),
			columnHelper.display({
				id: "id",
				cell: (info: any) => (
					<span className="dropdown">
						<button
							type="button"
							className="btn dropdown-toggle btn-action btn-sm px-1"
							data-bs-boundary="viewport"
							data-bs-toggle="dropdown"
						>
							<IconDotsVertical />
						</button>
						<div className="dropdown-menu dropdown-menu-end">
							<span className="dropdown-header">
								<T id="object.actions-title" tData={{ object: "proxy-host" }} data={{ id: info.row.original.id }} />
							</span>
							<a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); onEdit?.(info.row.original.id); }}>
								<IconEdit size={16} />
								<T id="action.edit" />
							</a>
							<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
								<a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); onDisableToggle?.(info.row.original.id, !info.row.original.enabled); }}>
									<IconPower size={16} />
									<T id={info.row.original.enabled ? "action.disable" : "action.enable"} />
								</a>
								<div className="dropdown-divider" />
								<a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); onDelete?.(info.row.original.id); }}>
									<IconTrash size={16} />
									<T id="action.delete" />
								</a>
							</HasPermission>
						</div>
					</span>
				),
				meta: { className: "text-end w-1" },
			}),
		],
		[columnHelper, onEdit, onDisableToggle, onDelete],
	);

	const tableInstance = useReactTable<ProxyHost>({
		columns,
		data,
		state: {
			grouping,
			expanded,
			columnVisibility: { folder: false },
		},
		onExpandedChange: (updater) => {
			onExpandedChange(typeof updater === "function" ? updater(expanded) : updater);
		},
		getGroupedRowModel: getGroupedRowModel(),
		getExpandedRowModel: getExpandedRowModel(),
		getCoreRowModel: getCoreRowModel(),
		rowCount: data.length,
		meta: { isFetching },
		enableSortingRemoval: false,
	});

	const visibleColumnCount = tableInstance.getVisibleLeafColumns().length;

	const renderRow = (row: Row<ProxyHost>): ReactNode => {
		if (row.getIsGrouped()) {
			const folderName = row.groupingValue as string;
			if (!folderName) {
				// Ungrouped hosts: render their leaf rows directly at the top
				return row.subRows.map((subRow) => renderLeafRow(subRow));
			}
			// Named folder: render collapsible header row
			const enabledCount = row.subRows.filter((r) => r.original?.enabled).length;
			const disabledCount = row.subRows.length - enabledCount;
			return (
				<tr
					key={row.id}
					className="cursor-pointer bg-light"
					onClick={() => row.toggleExpanded()}
					style={{ userSelect: "none" }}
				>
					<td colSpan={visibleColumnCount} className="py-2 px-3">
						<span className="me-2 text-muted">
							{row.getIsExpanded() ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
						</span>
						<strong>{folderName}</strong>
						<span className="ms-3">
							<span className="badge bg-success me-1">{enabledCount}</span>
							{disabledCount > 0 && <span className="badge bg-danger">{disabledCount}</span>}
						</span>
					</td>
				</tr>
			);
		}
		return renderLeafRow(row);
	};

	const renderLeafRow = (row: Row<ProxyHost>): ReactNode => (
		<tr key={row.id}>
			{row.getVisibleCells().map((cell) => {
				const { className } = (cell.column.columnDef.meta as any) ?? {};
				return (
					<td key={cell.id} className={className}>
						{flexRender(cell.column.columnDef.cell, cell.getContext())}
					</td>
				);
			})}
		</tr>
	);

	return (
		<TableLayout
			tableInstance={tableInstance}
			renderRow={renderRow}
			emptyState={
				<EmptyData
					object="proxy-host"
					objects="proxy-hosts"
					tableInstance={tableInstance}
					onNew={onNew}
					isFiltered={isFiltered}
					color="lime"
					permissionSection={PROXY_HOSTS}
				/>
			}
		/>
	);
}
```

**Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

**Step 5: Commit**

```bash
git add frontend/src/pages/Nginx/ProxyHosts/Table.tsx
git commit -m "feat: add TanStack folder grouping to ProxyHosts table"
```

---

### 5c — ProxyHosts TableWrapper: expanded state + search

**Files:**
- Modify: `frontend/src/pages/Nginx/ProxyHosts/TableWrapper.tsx`

**Step 1: Add ExpandedState import and expanded state**

```tsx
import { type ExpandedState } from "@tanstack/react-table";
// ... existing imports ...

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [expanded, setExpanded] = useState<ExpandedState>({});  // add this
	// ...
```

**Step 2: Extend the search filter**

Replace the existing filter block:

```tsx
let filtered = null;
if (search && data) {
	filtered = data?.filter(
		(item) =>
			item.domainNames.some((domain: string) => domain.toLowerCase().includes(search)) ||
			item.forwardHost.toLowerCase().includes(search) ||
			`${item.forwardPort}`.includes(search) ||
			(item.meta?.folder ?? "").toLowerCase().includes(search),
	);
} else if (search !== "") {
	setSearch("");
}
```

**Step 3: Pass expanded props to Table**

```tsx
<Table
	data={filtered ?? data ?? []}
	isFiltered={!!search}
	isFetching={isFetching}
	expanded={expanded}
	onExpandedChange={setExpanded}
	onEdit={(id: number) => showProxyHostModal(id)}
	onDelete={(id: number) =>
		showDeleteConfirmModal({
			title: <T id="object.delete" tData={{ object: "proxy-host" }} />,
			onConfirm: () => handleDelete(id),
			invalidations: [["proxy-hosts"], ["proxy-host", id]],
			children: <T id="object.delete.content" tData={{ object: "proxy-host" }} />,
		})
	}
	onDisableToggle={handleDisableToggle}
	onNew={() => showProxyHostModal("new")}
/>
```

**Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

**Step 5: Commit**

```bash
git add frontend/src/pages/Nginx/ProxyHosts/TableWrapper.tsx
git commit -m "feat: add expanded state and folder search to ProxyHosts TableWrapper"
```

---

## Task 6 — Redirection Hosts: same pattern as Task 5

**Files:**
- Modify: `frontend/src/modals/RedirectionHostModal.tsx`
- Modify: `frontend/src/pages/Nginx/RedirectionHosts/Table.tsx`
- Modify: `frontend/src/pages/Nginx/RedirectionHosts/TableWrapper.tsx`

### 6a — RedirectionHostModal

Same approach as 5a. The query key is `"redirection-hosts"`.

Import `FolderField`, then inside the Details tab after the last form field and before the Options section:

```tsx
<FolderField queryKey="redirection-hosts" />
```

Initial values already include `meta: data?.meta || {}` — confirm this exists in the file; if not, add it.

Commit: `"feat: add Folder field to RedirectionHost edit modal"`

### 6b — RedirectionHosts Table

Same approach as 5b but for `RedirectionHost` type. The grouping column, `FolderHeaderRow`, and `renderLeafRow` pattern are identical. Adjust:
- `columnHelper = createColumnHelper<RedirectionHost>()`
- Change `PROXY_HOSTS` → `REDIRECTION_HOSTS`
- Change `"proxy-host"` / `"proxy-hosts"` → `"redirection-host"` / `"redirection-hosts"` in T ids
- Adapt the column definitions to match the existing RedirectionHosts columns (Source, HTTP Code, Scheme, Destination, SSL, Status)

Commit: `"feat: add TanStack folder grouping to RedirectionHosts table"`

### 6c — RedirectionHosts TableWrapper

Same approach as 5c. Search filter adds:

```tsx
|| (item.meta?.folder ?? "").toLowerCase().includes(search)
```

Commit: `"feat: add expanded state and folder search to RedirectionHosts TableWrapper"`

---

## Task 7 — Streams: same pattern as Task 5

**Files:**
- Modify: `frontend/src/modals/StreamModal.tsx`
- Modify: `frontend/src/pages/Nginx/Streams/Table.tsx`
- Modify: `frontend/src/pages/Nginx/Streams/TableWrapper.tsx`

### 7a — StreamModal

Query key: `"streams"`. The Stream's Details tab has different fields (Incoming Port, Forwarding Host/Port, TCP/UDP). Add `FolderField queryKey="streams"` at the bottom of the Details tab.

Confirm `meta: data?.meta || {}` is in Formik initial values.

Commit: `"feat: add Folder field to Stream edit modal"`

### 7b — Streams Table

Same grouping approach. `createColumnHelper<Stream>()`. Adjust column defs and permission constants (`STREAMS`).

Commit: `"feat: add TanStack folder grouping to Streams table"`

### 7c — Streams TableWrapper

Add expanded state + extend search filter (Streams search on `incomingPort`, `forwardingHost`, `forwardingPort`):

```tsx
|| (item.meta?.folder ?? "").toLowerCase().includes(search)
```

Commit: `"feat: add expanded state and folder search to Streams TableWrapper"`

---

## Task 8 — Dead Hosts: same pattern as Task 5

**Files:**
- Modify: `frontend/src/modals/DeadHostModal.tsx`
- Modify: `frontend/src/pages/Nginx/DeadHosts/Table.tsx`
- Modify: `frontend/src/pages/Nginx/DeadHosts/TableWrapper.tsx`

### 8a — DeadHostModal

Query key: `"dead-hosts"`. Add `FolderField queryKey="dead-hosts"` in the Details tab.

Commit: `"feat: add Folder field to DeadHost edit modal"`

### 8b — DeadHosts Table

Same grouping approach. `createColumnHelper<DeadHost>()`. Adjust column defs and permission constants (`DEAD_HOSTS`).

Commit: `"feat: add TanStack folder grouping to DeadHosts table"`

### 8c — DeadHosts TableWrapper

Add expanded state + extend search filter:

```tsx
|| (item.meta?.folder ?? "").toLowerCase().includes(search)
```

Commit: `"feat: add expanded state and folder search to DeadHosts TableWrapper"`

---

## Task 9 — Lint + full type check

**Step 1: Run Biome lint on all modified files**

```bash
cd frontend && npx biome check --apply src/
```

Expected: no lint errors after auto-fix.

**Step 2: Full TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

**Step 3: Run Vitest unit tests**

```bash
cd frontend && npm test -- --run
```

Expected: all existing tests pass.

**Step 4: Commit any lint fixes**

```bash
git add -p
git commit -m "chore: apply biome lint fixes"
```

---

## Task 10 — Manual smoke test

Start the dev stack (`./scripts/start-dev`) and verify:

| Test | Expected result |
|---|---|
| Open Proxy Hosts page | Table renders as before (no folders = flat list) |
| Edit a proxy host → Details tab | "Folder" field visible below Access List |
| Type "Production" → Save | Host re-appears in table, no visual change (no folder UI yet since only 1 host) |
| Edit a second host → type "Production" → Save | Table now shows: flat hosts first, then "▶ Production [● 2]" folder row |
| Click folder header | Expands to show 2 hosts |
| Click again | Collapses |
| Reload page | Folders collapsed again (no persistence) |
| Type "Prod" in search | Folder header for "Production" is visible, stays collapsed |
| Type a domain name in search | Matching hosts appear (folder hosts remain collapsed) |
| Check Redirection Hosts, Streams, 404 Hosts | Same folder behaviour on each page |
| Edit a host → clear Folder field → Save | Host moves back to ungrouped flat list |

---

## Commit Summary

```
feat: add renderRow escape-hatch to TableBody for grouped row rendering
feat: add folder i18n keys
feat: add reusable FolderField combobox component
feat: add Folder field to ProxyHost edit modal
feat: add TanStack folder grouping to ProxyHosts table
feat: add expanded state and folder search to ProxyHosts TableWrapper
feat: add Folder field to RedirectionHost edit modal
feat: add TanStack folder grouping to RedirectionHosts table
feat: add expanded state and folder search to RedirectionHosts TableWrapper
feat: add Folder field to Stream edit modal
feat: add TanStack folder grouping to Streams table
feat: add expanded state and folder search to Streams TableWrapper
feat: add Folder field to DeadHost edit modal
feat: add TanStack folder grouping to DeadHosts table
feat: add expanded state and folder search to DeadHosts TableWrapper
chore: apply biome lint fixes
```
