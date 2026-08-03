import { useEffect, useId, useState } from 'react';
import { writeClipboard } from './tableCopy';

export interface CopyButtonProps {
  /** Tab-separated or plain text suitable for spreadsheets / rich paste. */
  richText: string;
  /** CSV text. */
  csvText: string;
  /** Accessible name (defaults to "Copy"). */
  label?: string;
}

function clipboardHelpText(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Edg\//i.test(ua)) {
    return 'Clipboard blocked. In Edge: click the lock/tune icon in the address bar → Site permissions → Clipboard → Allow, then try Copy again.';
  }
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) {
    return 'Clipboard blocked. In Chrome: click the lock/tune icon in the address bar → Site settings → Clipboard → Allow, then try Copy again.';
  }
  if (/Firefox\//i.test(ua)) {
    return 'Clipboard blocked. In Firefox: click the lock icon → Permissions → set Clipboard / "Copy data" to Allow (or enable dom.events.asyncClipboard.clipboardItem in about:config), then try again.';
  }
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    return 'Clipboard blocked. In Safari: Settings → Websites → allow paste/clipboard for this site, ensure the page is focused, then try Copy again.';
  }
  return 'Clipboard blocked by the browser. Allow clipboard permission for this site (address-bar site settings), keep the tab focused, then try Copy again.';
}

export function CopyButton({ richText, csvText, label = 'Copy' }: CopyButtonProps) {
  const [status, setStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [help, setHelp] = useState<string | null>(null);
  const helpId = useId();

  useEffect(() => {
    if (status !== 'ok') return;
    const t = setTimeout(() => setStatus('idle'), 1200);
    return () => clearTimeout(t);
  }, [status]);

  const title =
    status === 'ok' ? 'Copied' : status === 'err' ? 'Copy failed' : 'Copy table (rich + CSV)';
  const ariaLabel = status === 'ok' ? 'Copied' : status === 'err' ? 'Copy failed' : label;

  return (
    <div className="copy-control">
      <button
        type="button"
        className={`copy-btn icon-btn${status === 'ok' ? ' is-ok' : ''}${status === 'err' ? ' is-err' : ''}`}
        title={title}
        aria-label={ariaLabel}
        aria-describedby={help ? helpId : undefined}
        onClick={() => {
          setHelp(null);
          void writeClipboard(richText, csvText)
            .then(() => {
              setStatus('ok');
            })
            .catch(() => {
              setStatus('err');
              setHelp(clipboardHelpText());
            });
        }}
      >
        <span aria-hidden="true">{status === 'ok' ? '✓' : '⧉'}</span>
      </button>
      {help ? (
        <div id={helpId} className="clipboard-help" role="alert">
          <p>{help}</p>
          <button type="button" className="copy-btn" onClick={() => setHelp(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}
