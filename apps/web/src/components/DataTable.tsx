import type { DragEvent } from 'react';
import { CopyButton } from './CopyButton';
import { rowsToCsv, rowsToRich } from './tableCopy';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => string | number;
  onCellClick?: (row: T) => void;
  /** Extra class on td (e.g. cell-host for wrapping). */
  cellClassName?: string;
  /** Numeric columns get tabular alignment. */
  numeric?: boolean;
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
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>, cardId: string) => void;
  onDragOver?: (event: DragEvent<HTMLElement>, cardId: string) => void;
  onDragLeave?: (event: DragEvent<HTMLElement>, cardId: string) => void;
  onDrop?: (event: DragEvent<HTMLElement>, cardId: string) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
}

export function DataTable<T>({
  title,
  columns,
  rows,
  empty = 'No data',
  legend,
  cardId,
  draggable = false,
  isDragging = false,
  isDragOver = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: DataTableProps<T>) {
  const headers = columns.map((c) => c.header);
  const stringRows = rows.map((row) => columns.map((c) => String(c.render(row))));
  const csv = rowsToCsv(headers, stringRows);
  const rich = rowsToRich(headers, stringRows);

  const panelClass = [
    'panel',
    'table-panel',
    isDragging ? 'is-dragging' : '',
    isDragOver ? 'is-drag-over' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section
      className={panelClass}
      data-card-id={cardId}
      onDragOver={
        draggable && cardId
          ? (e) => {
              e.preventDefault();
              onDragOver?.(e, cardId);
            }
          : undefined
      }
      onDragLeave={draggable && cardId ? (e) => onDragLeave?.(e, cardId) : undefined}
      onDrop={
        draggable && cardId
          ? (e) => {
              e.preventDefault();
              onDrop?.(e, cardId);
            }
          : undefined
      }
    >
      <div className="panel-head">
        <div className="panel-title-block">
          <div className="panel-title-row">
            {draggable && cardId && (
              <span
                className="drag-handle"
                title="Drag to reorder"
                aria-label={`Drag to reorder ${title}`}
                draggable
                onDragStart={(e) => onDragStart?.(e, cardId)}
                onDragEnd={onDragEnd}
              >
                ⋮⋮
              </span>
            )}
            <h2>{title}</h2>
          </div>
          {legend ? <p className="panel-legend">{legend}</p> : null}
        </div>
        <CopyButton richText={rich} csvText={csv} />
      </div>
      {rows.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={c.numeric ? 'num' : undefined}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  {columns.map((c) => {
                    const value = c.render(row);
                    const className =
                      [c.cellClassName, c.numeric ? 'num' : ''].filter(Boolean).join(' ') ||
                      undefined;
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
