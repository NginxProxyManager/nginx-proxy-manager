# Design: Host Folder Grouping

**Date**: 2026-02-28
**Status**: Approved
**Scope**: Proxy Hosts, Redirection Hosts, Streams, 404 Hosts

## Summary

Allow users to assign hosts to named folders for visual grouping in the dashboard. Folders are per-host-type (each page manages its own independent folders). Hosts without a folder appear at the top of the table as a flat list; folders appear below, collapsed by default.

## Data Model

No database migration required. The `meta` JSON field already exists on all four host tables (`proxy_host`, `redirection_host`, `dead_host`, `stream`) and is properly handled by the Objection.js models and API serialization.

Folder name is stored as `meta.folder` (string, optional):

```json
{ "meta": { "folder": "Production" } }
```

- No folder: `meta.folder` is absent or `undefined`
- Rename: edit each host individually (v1 scope)
- Delete: clear the field on each host

## TypeScript Models

Add `meta?: { folder?: string }` to existing interfaces in `frontend/src/api/backend/models.ts` for `ProxyHost`, `RedirectionHost`, `DeadHost`, and `Stream`.

## Backend

No backend changes required. The `meta` field is already serialized and returned in API responses. Search is performed client-side in the frontend.

## Frontend — Edit Modal

A **Folder** field is added in the **Details tab** of each host modal (`ProxyHostModal`, `RedirectionHostModal`, `DeadHostModal`, `StreamModal`).

- Optional, clearable
- Implemented as an HTML `<datalist>`-backed input or combobox
- Autocomplete options are derived from existing host data already in the React Query cache — no additional API call
- Typing a new name creates a new folder implicitly
- Clearing the field removes the host from its folder
- Maps to `meta.folder` in the Formik payload

## Frontend — Table Grouping

### Approach

TanStack Table v8 built-in grouping (`getGroupedRowModel` + `getExpandedRowModel`).

### State (in `TableWrapper.tsx`)

```ts
const [expanded, setExpanded] = useState<ExpandedState>({});
// grouping is always active on 'folder' virtual column
```

### Table layout

```
┌─────────────────────────────────────────────────────────────┐
│  ungrouped-host.com   │ ... │ ... │  ● enabled              │ ← flat row
│  other-ungrouped.com  │ ... │ ... │  ● enabled              │ ← flat row
├─────────────────────────────────────────────────────────────┤
│ ▶ Production   [● 3  ○ 1]                                   │ ← folder header (closed)
├─────────────────────────────────────────────────────────────┤
│ ▼ Staging      [● 2]                                        │ ← folder header (open)
│    staging.com        │ ... │ ... │  ● enabled              │   └ subrow
│    api.staging.com    │ ... │ ... │  ● enabled              │   └ subrow
└─────────────────────────────────────────────────────────────┘
```

### Virtual `folder` column

A non-rendered grouping column with `accessorFn: row => row.meta?.folder ?? ''` is added to the column config. Empty string sorts before any folder name, placing ungrouped hosts first.

### Row rendering in `Table.tsx`

```tsx
rows.map(row =>
  row.getIsGrouped()
    ? <FolderHeaderRow row={row} onToggle={...} />
    : <DataRow row={row} />   // existing rendering, unchanged
)
```

`FolderHeaderRow` is a `<tr>` with a single `<td colSpan={n}>` containing:
- Chevron icon (▶/▼) indicating collapsed/expanded state
- Folder name
- Status badges: count of enabled / disabled hosts within the folder (nice-to-have, derived from `row.subRows`)

### Search

Filter extended in `TableWrapper.tsx`:

```ts
item.domainNames.some(d => d.toLowerCase().includes(search))
|| item.forwardHost?.toLowerCase().includes(search)
|| `${item.forwardPort}`.includes(search)
|| item.meta?.folder?.toLowerCase().includes(search)  // added
```

When a search is active, folder headers whose sub-items match are shown but remain closed. The user clicks to expand and see results.

## Behaviour Summary

| Scenario | Behaviour |
|---|---|
| Host without folder | Shown at top of table, flat list (as today) |
| Folder default state | Collapsed |
| Folder persistence | None (resets on page load) |
| Search matches host inside folder | Folder header visible, stays closed |
| Search matches folder name | Folder header visible, stays closed |
| Create folder | Type name in Edit modal Folder field |
| Remove from folder | Clear Folder field in Edit modal |

## Files to Change

### Frontend
| File | Change |
|---|---|
| `frontend/src/api/backend/models.ts` | Add `meta?: { folder?: string }` to all 4 host interfaces |
| `frontend/src/pages/Nginx/ProxyHosts/TableWrapper.tsx` | Add expanded state, extended search filter, pass props to Table |
| `frontend/src/pages/Nginx/ProxyHosts/Table.tsx` | Add grouping config, `FolderHeaderRow` component, conditional row render |
| `frontend/src/modals/ProxyHostModal.tsx` | Add Folder field in Details tab |
| `frontend/src/pages/Nginx/RedirectionHosts/TableWrapper.tsx` | Same as ProxyHosts |
| `frontend/src/pages/Nginx/RedirectionHosts/Table.tsx` | Same as ProxyHosts |
| `frontend/src/modals/RedirectionHostModal.tsx` | Add Folder field |
| `frontend/src/pages/Nginx/Streams/TableWrapper.tsx` | Same as ProxyHosts |
| `frontend/src/pages/Nginx/Streams/Table.tsx` | Same as ProxyHosts |
| `frontend/src/modals/StreamModal.tsx` | Add Folder field |
| `frontend/src/pages/Nginx/DeadHosts/TableWrapper.tsx` | Same as ProxyHosts |
| `frontend/src/pages/Nginx/DeadHosts/Table.tsx` | Same as ProxyHosts |
| `frontend/src/modals/DeadHostModal.tsx` | Add Folder field |
| `frontend/src/locale/en.json` (+ others) | Add i18n keys: `folder`, `folder_placeholder` |

### Backend
None.

### Database
None.
