import { CopyButton } from './CopyButton';
import { rowsToCsv, rowsToRich } from './tableCopy';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => string | number;
  onCellClick?: (row: T) => void;
}

export interface DataTableProps<T> {
  title: string;
  columns: Column<T>[];
  rows: T[];
  empty?: string;
}

export function DataTable<T>({ title, columns, rows, empty = 'No data' }: DataTableProps<T>) {
  const headers = columns.map((c) => c.header);
  const stringRows = rows.map((row) => columns.map((c) => String(c.render(row))));
  const csv = rowsToCsv(headers, stringRows);
  const rich = rowsToRich(headers, stringRows);

  return (
    <section className="panel table-panel">
      <div className="panel-head">
        <h2>{title}</h2>
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
                  <th key={c.key}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  {columns.map((c) => {
                    const value = c.render(row);
                    if (c.onCellClick) {
                      return (
                        <td key={c.key}>
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
                    return <td key={c.key}>{value}</td>;
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
