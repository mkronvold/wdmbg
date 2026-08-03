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

export interface DataTableProps<T> {
  title: string;
  columns: Column<T>[];
  rows: T[];
  empty?: string;
  /** Subtitle under the title (window + unit legend). */
  legend?: string;
  /** Stable id for drag/drop reorder. */
  cardId?: string;
  draggable?: boolean;
  /** Layout edit mode: show drag handle + hide toggle; omit copy. */
  editMode?: boolean;
  /** Card is user-hidden (still visible in edit mode, dulled). */
  hidden?: boolean;
  onToggleHidden?: () => void;
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
  draggable = false,
  editMode = false,
  hidden = false,
  onToggleHidden,
  isDragging = false,
  isDragOver = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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
  ]
    .filter(Boolean)
    .join(' ');

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('desc');
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
