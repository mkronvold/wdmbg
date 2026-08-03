import { useMemo, useState, type DragEvent } from 'react';
import { CopyButton } from './CopyButton';
import { rowsToCsv, rowsToRich } from './tableCopy';

export type SortDir = 'asc' | 'desc';

/** Column width packing: primary takes remaining space; min shrinks to content. */
export type ColumnWidth = 'primary' | 'min' | 'auto';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => string | number;
  onCellClick?: (row: T) => void;
  /** Extra class on td (e.g. cell-host for wrapping). */
  cellClassName?: string;
  /** Numeric columns get tabular alignment. */
  numeric?: boolean;
  /**
   * Width packing hint.
   * - primary: absorbs remaining table width
   * - min: shrink to header/content (nowrap)
   * - auto: browser default
   * Defaults to min when numeric, otherwise auto.
   */
  width?: ColumnWidth;
  /** Optional value used for sorting (defaults to render()). */
  sortValue?: (row: T) => string | number;
}

function columnWidthClass(col: { width?: ColumnWidth; numeric?: boolean }): string | undefined {
  const width = col.width ?? (col.numeric ? 'min' : 'auto');
  if (width === 'primary') return 'col-primary';
  if (width === 'min') return 'col-min';
  return undefined;
}

const TABLE_SORT_KEY = 'wdmbg.tableSort';

type TableSortMap = Record<string, { key: string; dir: SortDir }>;

function loadAllTableSort(): TableSortMap {
  try {
    const raw = localStorage.getItem(TABLE_SORT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: TableSortMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const rec = value as { key?: unknown; dir?: unknown };
      if (typeof rec.key !== 'string' || (rec.dir !== 'asc' && rec.dir !== 'desc')) continue;
      out[id] = { key: rec.key, dir: rec.dir };
    }
    return out;
  } catch {
    return {};
  }
}

function loadTableSort(tableId: string): { key: string; dir: SortDir } | null {
  return loadAllTableSort()[tableId] ?? null;
}

function saveTableSort(tableId: string, key: string | null, dir: SortDir) {
  try {
    const all = loadAllTableSort();
    if (!key) {
      delete all[tableId];
    } else {
      all[tableId] = { key, dir };
    }
    localStorage.setItem(TABLE_SORT_KEY, JSON.stringify(all));
  } catch {
    // ignore quota / private mode
  }
}

function initialSortState(
  sortId: string | undefined,
  columns: { key: string }[],
): { key: string | null; dir: SortDir } {
  if (!sortId) return { key: null, dir: 'desc' };
  const saved = loadTableSort(sortId);
  if (!saved) return { key: null, dir: 'desc' };
  if (!columns.some((c) => c.key === saved.key)) return { key: null, dir: 'desc' };
  return { key: saved.key, dir: saved.dir };
}

export interface DataTableProps<T> {
  title: string;
  columns: Column<T>[];
  rows: T[];
  empty?: string;
  /** Subtitle under the title (window + unit legend). */
  legend?: string;
  /** Stable id for drag/drop reorder. Also used as sort key when tableId is omitted. */
  cardId?: string;
  /**
   * Stable id for sort-order persistence (localStorage wdmbg.tableSort).
   * Dashboard cards typically omit this and use cardId; HostDialog tables pass explicit ids.
   */
  tableId?: string;
  draggable?: boolean;
  /** Layout edit mode: show drag handle + hide/wide toggles; omit copy. */
  editMode?: boolean;
  /** Card is user-hidden (still visible in edit mode, dulled). */
  hidden?: boolean;
  onToggleHidden?: () => void;
  /** Card spans full dashboard width (multi-column / masonry). */
  wide?: boolean;
  onToggleWide?: () => void;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>, cardId: string) => void;
  onDragOver?: (event: DragEvent<HTMLElement>, cardId: string) => void;
  onDragLeave?: (event: DragEvent<HTMLElement>, cardId: string) => void;
  onDrop?: (event: DragEvent<HTMLElement>, cardId: string) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function DataTable<T>({
  title,
  columns,
  rows,
  empty = 'No data',
  legend,
  cardId,
  tableId,
  draggable = false,
  editMode = false,
  hidden = false,
  onToggleHidden,
  wide = false,
  onToggleWide,
  isDragging = false,
  isDragOver = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: DataTableProps<T>) {
  const sortId = tableId ?? cardId;
  const initial = initialSortState(sortId, columns);
  const [sortKey, setSortKey] = useState<string | null>(initial.key);
  const [sortDir, setSortDir] = useState<SortDir>(initial.dir);

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const pick = (row: T) => (col.sortValue ? col.sortValue(row) : col.render(row));
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => mul * compareValues(pick(a), pick(b)));
  }, [columns, rows, sortDir, sortKey]);

  const sortCol = sortKey ? columns.find((c) => c.key === sortKey) : undefined;
  const legendText =
    legend && sortCol ? `${legend} · sorted by ${sortCol.header} ${sortDir}` : legend;

  const headers = columns.map((c) => c.header);
  const stringRows = sortedRows.map((row) => columns.map((c) => String(c.render(row))));
  const csv = rowsToCsv(headers, stringRows);
  const rich = rowsToRich(headers, stringRows);

  const canDrag = Boolean(editMode && draggable && cardId);

  const panelClass = [
    'panel',
    'table-panel',
    isDragging ? 'is-dragging' : '',
    isDragOver ? 'is-drag-over' : '',
    editMode && hidden ? 'is-hidden-card' : '',
    wide ? 'is-wide-card' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const toggleSort = (key: string) => {
    const nextKey = key;
    const nextDir: SortDir = sortKey === key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc';
    setSortKey(nextKey);
    setSortDir(nextDir);
    if (sortId) saveTableSort(sortId, nextKey, nextDir);
  };

  return (
    <section
      className={panelClass}
      data-card-id={cardId}
      onDragOver={
        canDrag
          ? (e) => {
              e.preventDefault();
              onDragOver?.(e, cardId!);
            }
          : undefined
      }
      onDragLeave={canDrag ? (e) => onDragLeave?.(e, cardId!) : undefined}
      onDrop={
        canDrag
          ? (e) => {
              e.preventDefault();
              onDrop?.(e, cardId!);
            }
          : undefined
      }
    >
      <div className="panel-head">
        <div className="panel-title-block">
          <div className="panel-title-row">
            {canDrag && (
              <span
                className="drag-handle"
                title="Drag to reorder"
                aria-label={`Drag to reorder ${title}`}
                draggable
                onDragStart={(e) => onDragStart?.(e, cardId!)}
                onDragEnd={onDragEnd}
              >
                ⋮⋮
              </span>
            )}
            <h2>{title}</h2>
          </div>
          {legendText ? <p className="panel-legend">{legendText}</p> : null}
        </div>
        {editMode ? (
          <div className="panel-actions">
            <button
              type="button"
              className={`wide-card-btn${wide ? ' is-wide' : ''}`}
              title={wide ? `Make ${title} normal width` : `Make ${title} full width`}
              aria-label={wide ? `Make ${title} normal width` : `Make ${title} full width`}
              aria-pressed={wide}
              onClick={onToggleWide}
            >
              Wide
            </button>
            <button
              type="button"
              className={`hide-card-btn icon-btn${hidden ? ' is-hidden' : ''}`}
              title={hidden ? `Show ${title}` : `Hide ${title}`}
              aria-label={hidden ? `Show ${title}` : `Hide ${title}`}
              aria-pressed={hidden}
              onClick={onToggleHidden}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ) : (
          <CopyButton richText={rich} csvText={csv} />
        )}
      </div>
      {sortedRows.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((c) => {
                  const active = sortKey === c.key;
                  const ariaSort = active
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none';
                  const thClass =
                    [c.numeric ? 'num' : '', columnWidthClass(c)].filter(Boolean).join(' ') ||
                    undefined;
                  return (
                    <th key={c.key} className={thClass} aria-sort={ariaSort}>
                      <button
                        type="button"
                        className={`th-sort${active ? ' is-active' : ''}`}
                        onClick={() => toggleSort(c.key)}
                        aria-label={`Sort by ${c.header}`}
                      >
                        {c.header}
                        {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, idx) => (
                <tr key={idx}>
                  {columns.map((c) => {
                    const value = c.render(row);
                    const className =
                      [c.cellClassName, c.numeric ? 'num' : '', columnWidthClass(c)]
                        .filter(Boolean)
                        .join(' ') || undefined;
                    if (c.onCellClick) {
                      return (
                        <td key={c.key} className={className}>
                          <button
                            type="button"
                            className="linkish"
                            onClick={() => c.onCellClick?.(row)}
                          >
                            {value}
                          </button>
                        </td>
                      );
                    }
                    return (
                      <td key={c.key} className={className}>
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
