import type { ComponentChildren } from 'preact';

export interface Column<R> {
  key: string;
  header: string;
  cell: (row: R) => ComponentChildren;
  align?: 'right';
  class?: string;
}

interface Props<R> {
  caption: string;
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R) => string;
}

/** Scrollable region (keyboard focusable) with a visually hidden caption for screen readers. */
export function Table<R>({ caption, columns, rows, rowKey }: Props<R>) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard access to a scrollable region (WCAG 2.1.1)
    <div class="table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table class="table">
        <caption class="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" class={c.align === 'right' ? 'ta-right' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.key} class={`${c.align === 'right' ? 'ta-right ' : ''}${c.class ?? ''}`.trim() || undefined}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
