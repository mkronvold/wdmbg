import { useId, useState, type DragEvent, type FormEvent } from 'react';
import {
  DEFAULT_URL_CARD_HEIGHT_REM,
  MAX_URL_CARD_HEIGHT_REM,
  MIN_URL_CARD_HEIGHT_REM,
  isAllowedDashboardUrl,
  resolvedHeightRem,
  type UrlCardDef,
} from '../urlCards';

export interface UrlCardProps {
  def: UrlCardDef;
  editMode?: boolean;
  hidden?: boolean;
  onToggleHidden?: () => void;
  wide?: boolean;
  onToggleWide?: () => void;
  onUpdate?: (patch: Pick<UrlCardDef, 'title' | 'url' | 'heightRem'>) => void;
  onDelete?: () => void;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>, cardId: string) => void;
  onDragOver?: (event: DragEvent<HTMLElement>, cardId: string) => void;
  onDragLeave?: (event: DragEvent<HTMLElement>, cardId: string) => void;
  onDrop?: (event: DragEvent<HTMLElement>, cardId: string) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
}

export function UrlCard({
  def,
  editMode = false,
  hidden = false,
  onToggleHidden,
  wide = false,
  onToggleWide,
  onUpdate,
  onDelete,
  isDragging = false,
  isDragOver = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: UrlCardProps) {
  const formId = useId();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [titleDraft, setTitleDraft] = useState(def.title);
  const [urlDraft, setUrlDraft] = useState(def.url);
  const [heightDraft, setHeightDraft] = useState(String(resolvedHeightRem(def)));
  const [formError, setFormError] = useState<string | null>(null);

  const heightRem = resolvedHeightRem(def);
  const canDrag = Boolean(editMode);
  const cardId = def.id;

  const panelClass = [
    'panel',
    'url-card-panel',
    isDragging ? 'is-dragging' : '',
    isDragOver ? 'is-drag-over' : '',
    editMode && hidden ? 'is-hidden-card' : '',
    wide ? 'is-wide-card' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const openEdit = () => {
    setTitleDraft(def.title);
    setUrlDraft(def.url);
    setHeightDraft(String(resolvedHeightRem(def)));
    setFormError(null);
    setConfirmDelete(false);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setFormError(null);
  };

  const submitEdit = (event: FormEvent) => {
    event.preventDefault();
    const title = titleDraft.trim();
    const url = urlDraft.trim();
    if (!title) {
      setFormError('Title is required');
      return;
    }
    if (!isAllowedDashboardUrl(url)) {
      setFormError(
        'URL must be https://, or http:// to a LAN host (.lan, private IP, or localhost)',
      );
      return;
    }
    const heightRaw = heightDraft.trim() === '' ? DEFAULT_URL_CARD_HEIGHT_REM : Number(heightDraft);
    onUpdate?.({
      title,
      url,
      heightRem: Number.isFinite(heightRaw) ? heightRaw : DEFAULT_URL_CARD_HEIGHT_REM,
    });
    setEditing(false);
    setFormError(null);
  };

  return (
    <section
      className={panelClass}
      data-card-id={cardId}
      onDragOver={
        canDrag
          ? (e) => {
              e.preventDefault();
              onDragOver?.(e, cardId);
            }
          : undefined
      }
      onDragLeave={canDrag ? (e) => onDragLeave?.(e, cardId) : undefined}
      onDrop={
        canDrag
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
            {canDrag && (
              <span
                className="drag-handle"
                title="Drag to reorder"
                aria-label={`Drag to reorder ${def.title}`}
                draggable
                onDragStart={(e) => onDragStart?.(e, cardId)}
                onDragEnd={onDragEnd}
              >
                ⋮⋮
              </span>
            )}
            <h2>{def.title}</h2>
          </div>
          <p className="panel-legend url-card-url" title={def.url}>
            {def.url}
          </p>
        </div>
        {editMode ? (
          <div className="panel-actions">
            <button
              type="button"
              className={`wide-card-btn${wide ? ' is-wide' : ''}`}
              title={wide ? `Make ${def.title} normal width` : `Make ${def.title} full width`}
              aria-label={wide ? `Make ${def.title} normal width` : `Make ${def.title} full width`}
              aria-pressed={wide}
              onClick={onToggleWide}
            >
              Wide
            </button>
            <button
              type="button"
              className="edit-card-btn"
              title={`Edit ${def.title}`}
              aria-label={`Edit ${def.title}`}
              aria-pressed={editing}
              onClick={() => (editing ? cancelEdit() : openEdit())}
            >
              Edit
            </button>
            <button
              type="button"
              className={`hide-card-btn icon-btn${hidden ? ' is-hidden' : ''}`}
              title={hidden ? `Show ${def.title}` : `Hide ${def.title}`}
              aria-label={hidden ? `Show ${def.title}` : `Hide ${def.title}`}
              aria-pressed={hidden}
              onClick={onToggleHidden}
            >
              <span aria-hidden="true">×</span>
            </button>
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  className="delete-card-btn is-confirm"
                  title={`Confirm delete ${def.title}`}
                  aria-label={`Confirm delete ${def.title}`}
                  onClick={() => {
                    setConfirmDelete(false);
                    onDelete?.();
                  }}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="delete-card-btn"
                  title="Cancel delete"
                  aria-label={`Cancel delete ${def.title}`}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="delete-card-btn"
                title={`Delete ${def.title}`}
                aria-label={`Delete ${def.title}`}
                onClick={() => {
                  setEditing(false);
                  setConfirmDelete(true);
                }}
              >
                Delete
              </button>
            )}
          </div>
        ) : (
          <div className="panel-actions">
            <a
              className="popout-btn copy-btn icon-btn"
              href={def.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${def.title} in new tab`}
              aria-label={`Pop out ${def.title}`}
            >
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        )}
      </div>

      {editMode && editing ? (
        <form className="url-card-form" onSubmit={submitEdit} aria-label={`Edit ${def.title} card`}>
          <div className="url-card-form-row">
            <label htmlFor={`${formId}-title`}>Title</label>
            <input
              id={`${formId}-title`}
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div className="url-card-form-row">
            <label htmlFor={`${formId}-url`}>URL</label>
            <input
              id={`${formId}-url`}
              type="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div className="url-card-form-row">
            <label htmlFor={`${formId}-height`}>
              Height (rem, {MIN_URL_CARD_HEIGHT_REM}–{MAX_URL_CARD_HEIGHT_REM})
            </label>
            <input
              id={`${formId}-height`}
              type="number"
              min={MIN_URL_CARD_HEIGHT_REM}
              max={MAX_URL_CARD_HEIGHT_REM}
              step={1}
              value={heightDraft}
              onChange={(e) => setHeightDraft(e.target.value)}
            />
          </div>
          {formError ? (
            <p className="url-card-form-error" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="url-card-form-actions">
            <button type="submit" className="primary">
              Save
            </button>
            <button type="button" className="copy-btn" onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="url-card-frame-wrap" style={{ height: `${heightRem}rem` }}>
            <iframe
              className="url-card-frame"
              title={def.title}
              src={def.url}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          </div>
          <p className="muted small url-card-hint">
            Some sites block embedding (X-Frame-Options / CSP). Use Pop-out if the frame is blank.
          </p>
        </>
      )}
    </section>
  );
}
