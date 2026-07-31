import { useState } from 'react';
import { writeClipboard } from './tableCopy';

export interface CopyButtonProps {
  /** Tab-separated or plain text suitable for spreadsheets / rich paste. */
  richText: string;
  /** CSV text. */
  csvText: string;
  label?: string;
}

export function CopyButton({ richText, csvText, label = 'Copy' }: CopyButtonProps) {
  const [status, setStatus] = useState<'idle' | 'ok' | 'err'>('idle');

  return (
    <button
      type="button"
      className="copy-btn"
      title="Copy table (rich + CSV)"
      aria-label={label}
      onClick={() => {
        void writeClipboard(richText, csvText)
          .then(() => {
            setStatus('ok');
            setTimeout(() => setStatus('idle'), 1200);
          })
          .catch(() => {
            setStatus('err');
            setTimeout(() => setStatus('idle'), 1200);
          });
      }}
    >
      <span aria-hidden="true">⧉</span>
      <span className="copy-label">
        {status === 'ok' ? 'Copied' : status === 'err' ? 'Failed' : label}
      </span>
    </button>
  );
}
