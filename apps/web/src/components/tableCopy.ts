export function rowsToCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => {
    if (/[",\n]/.test(v)) {
      return `"${v.replaceAll('"', '""')}"`;
    }
    return v;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

export function rowsToRich(headers: string[], rows: string[][]): string {
  return [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
}

export async function writeClipboard(richText: string, csvText: string): Promise<void> {
  const plain = richText;
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const item = new ClipboardItem({
        'text/plain': new Blob([plain], { type: 'text/plain' }),
        'text/html': new Blob([`<pre>${escapeHtml(plain)}</pre>`], { type: 'text/html' }),
      });
      await navigator.clipboard.write([item]);
      void csvText;
      return;
    } catch {
      // fall through
    }
  }
  await navigator.clipboard.writeText(csvText || plain);
}

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
