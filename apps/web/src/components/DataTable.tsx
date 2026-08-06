import { useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import { CardOrderControls } from './CardOrderControls';
import { CopyButton } from './CopyButton';
import { rowsToCsv, rowsToRich } from './tableCopy';

export type SortDir = 'asc' | 'desc';
/** Row viz modes drawn by DataTable. Settings "off" is mapped to undefined by App. */
export type VisualizationMode = 'bars' | 'lines';

/** Column width packing: primary takes remaining space; share splits it; min shrinks. */
export type ColumnWidth = 'primary' | 'share' | 'min' | 'auto';

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
   * - primary: sole absorber of remaining table width
   * - share: equal share of leftover width (e.g. Src + Dst)
   * - min: shrink to header/content (nowrap)
   * - auto: browser default
   * Defaults to min when numeric, otherwise auto.
   */
  width?: ColumnWidth;
  /** Optional value used for sorting (defaults to render()). */
  sortValue?: (row: T) => string | number;
}

function resolvedWidth(col: { width?: ColumnWidth; numeric?: boolean }): ColumnWidth {
  return col.width ?? (col.numeric ? 'min' : 'auto');
}

function columnWidthClass(col: { width?: ColumnWidth; numeric?: boolean }): string | undefined {
  const width = resolvedWidth(col);
  if (width === 'primary') return 'col-primary';
  if (width === 'share') return 'col-share';
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
  defaultSortKey?: string,
  defaultSortDir: SortDir = 'desc',
): { key: string | null; dir: SortDir } {
  if (sortId) {
    const saved = loadTableSort(sortId);
    if (saved && columns.some((c) => c.key === saved.key)) {
      return { key: saved.key, dir: saved.dir };
    }
  }
  if (defaultSortKey && columns.some((c) => c.key === defaultSortKey)) {
    return { key: defaultSortKey, dir: defaultSortDir };
  }
  return { key: null, dir: 'desc' };
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
  /**
   * Initial sort when no saved wdmbg.tableSort entry exists for this table.
   * Does not overwrite user preferences already stored in localStorage.
   */
  defaultSortKey?: string;
  /** Direction for defaultSortKey (default desc). */
  defaultSortDir?: SortDir;
  /**
   * Optional row visualization relative to the sum of the active sort column
   * (numeric columns only). Used on dashboard cards.
   * Omit / undefined → no bars or underlines (App maps settings "off" here).
   */
  visualization?: VisualizationMode | undefined;
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
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
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
  defaultSortKey,
  defaultSortDir = 'desc',
  visualization,
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
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
}: DataTableProps<T>) {
  const sortId = tableId ?? cardId;
  const initial = initialSortState(sortId, columns, defaultSortKey, defaultSortDir);
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

  /** Per-row share of the active numeric sort column total (0–100), or null when N/A. */
  const vizPercents = useMemo(() => {
    if (!visualization || !sortKey) return null;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return null;
    const pick = (row: T) => (col.sortValue ? col.sortValue(row) : col.render(row));
    const values = sortedRows.map((row) => {
      const v = pick(row);
      return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : null;
    });
    if (values.some((v) => v === null)) return null;
    const nums = values as number[];
    const total = nums.reduce((sum, v) => sum + v, 0);
    if (total <= 0) return nums.map(() => 0);
    return nums.map((v) => (v / total) * 100);
  }, [columns, sortKey, sortedRows, visualization]);

  const headers = columns.map((c) => c.header);
  const stringRows = sortedRows.map((row) => columns.map((c) => String(c.render(row))));
  const csv = rowsToCsv(headers, stringRows);
  const rich = rowsToRich(headers, stringRows);

  const canDrag = Boolean(editMode && draggable && cardId);

  const hasShareCols = columns.some((c) => resolvedWidth(c) === 'share');
  const primaryCount = columns.filter((c) => resolvedWidth(c) === 'primary').length;

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

  const tableClass =
    [hasShareCols ? 'has-share-cols' : '', primaryCount === 1 ? 'has-one-primary' : '']
      .filter(Boolean)
      .join(' ') || undefined;

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
              <>
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
                <CardOrderControls
                  title={title}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onMoveUp={() => onMoveUp?.()}
                  onMoveDown={() => onMoveDown?.()}
                />
              </>
            )}
            <h2>{title}</h2>
          </div>
          {legend ? <p className="panel-legend">{legend}</p> : null}
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
          <table className={tableClass}>
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
              {sortedRows.map((row, idx) => {
                const pct = vizPercents?.[idx];
                const showViz = pct != null && Boolean(visualization);
                const rowClass = showViz ? `viz-row viz-${visualization}` : undefined;
                const rowStyle = showViz
                  ? ({ ['--viz-pct' as string]: `${pct}%` } as CSSProperties)
                  : undefined;
                return (
                  <tr key={idx} className={rowClass} style={rowStyle}>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
