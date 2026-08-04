import { useEffect, useId, useState, type DragEvent, type FormEvent } from 'react';
import {
  DEFAULT_URL_CARD_HEIGHT_REM,
  DEFAULT_URL_CARD_SCALE,
  MAX_URL_CARD_HEIGHT_REM,
  MIN_URL_CARD_HEIGHT_REM,
  URL_CARD_REFRESH_OPTIONS,
  URL_CARD_SCALE_OPTIONS,
  clampRefreshSec,
  clampScale,
  isAllowedDashboardUrl,
  resolvedHeightRem,
  resolvedRefreshSec,
  resolvedScale,
  type UrlCardDef,
} from '../urlCards';
import { CardOrderControls } from './CardOrderControls';

export interface UrlCardProps {
  def: UrlCardDef;
  editMode?: boolean;
  hidden?: boolean;
  onToggleHidden?: () => void;
  wide?: boolean;
  onToggleWide?: () => void;
  onUpdate?: (
    patch: Pick<UrlCardDef, 'title' | 'url' | 'heightRem' | 'refreshSec' | 'scale'>,
  ) => void;
  onDelete?: () => void;
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
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
}: UrlCardProps) {
  const formId = useId();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [titleDraft, setTitleDraft] = useState(def.title);
  const [urlDraft, setUrlDraft] = useState(def.url);
  const [heightDraft, setHeightDraft] = useState(String(resolvedHeightRem(def)));
  const [refreshDraft, setRefreshDraft] = useState(String(resolvedRefreshSec(def)));
  const [scaleDraft, setScaleDraft] = useState(String(resolvedScale(def)));
  const [formError, setFormError] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);

  const heightRem = resolvedHeightRem(def);
  const refreshSec = resolvedRefreshSec(def);
  const scale = resolvedScale(def);
  const canDrag = Boolean(editMode);
  const cardId = def.id;
  const showFrame = !(editMode && editing);

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

  const reloadFrame = () => {
    setFrameKey((k) => k + 1);
  };

  useEffect(() => {
    if (!showFrame || refreshSec <= 0) return;
    const id = window.setInterval(() => {
      setFrameKey((k) => k + 1);
    }, refreshSec * 1000);
    return () => window.clearInterval(id);
  }, [refreshSec, showFrame, def.url]);

  const openEdit = () => {
    setTitleDraft(def.title);
    setUrlDraft(def.url);
    setHeightDraft(String(resolvedHeightRem(def)));
    setRefreshDraft(String(resolvedRefreshSec(def)));
    setScaleDraft(String(resolvedScale(def)));
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
    const nextRefresh = clampRefreshSec(Number(refreshDraft));
    const nextScale = clampScale(Number(scaleDraft));
    onUpdate?.({
      title,
      url,
      heightRem: Number.isFinite(heightRaw) ? heightRaw : DEFAULT_URL_CARD_HEIGHT_REM,
      refreshSec: nextRefresh > 0 ? nextRefresh : 0,
      scale: nextScale !== DEFAULT_URL_CARD_SCALE ? nextScale : DEFAULT_URL_CARD_SCALE,
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
              <>
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
                <CardOrderControls
                  title={def.title}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onMoveUp={() => onMoveUp?.()}
                  onMoveDown={() => onMoveDown?.()}
                />
              </>
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
            <button
              type="button"
              className="refresh-card-btn copy-btn icon-btn"
              title={`Refresh ${def.title}`}
              aria-label={`Refresh ${def.title}`}
              onClick={reloadFrame}
            >
              <span aria-hidden="true">↻</span>
            </button>
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
          <div className="url-card-form-row">
            <label htmlFor={`${formId}-refresh`}>Refresh</label>
            <select
              id={`${formId}-refresh`}
              value={refreshDraft}
              onChange={(e) => setRefreshDraft(e.target.value)}
              aria-label={`Refresh interval for ${def.title}`}
            >
              {URL_CARD_REFRESH_OPTIONS.map((opt) => (
                <option key={opt.sec} value={String(opt.sec)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="url-card-form-row">
            <label htmlFor={`${formId}-scale`}>Scale</label>
            <select
              id={`${formId}-scale`}
              value={scaleDraft}
              onChange={(e) => setScaleDraft(e.target.value)}
              aria-label={`Scale for ${def.title}`}
            >
              {URL_CARD_SCALE_OPTIONS.map((opt) => (
                <option key={opt.scale} value={String(opt.scale)}>
                  {opt.label}
                </option>
              ))}
            </select>
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
          <div
            className="url-card-frame-wrap"
            style={{ height: `${heightRem}rem`, ['--url-card-scale' as string]: String(scale) }}
            data-scale={String(scale)}
          >
            <iframe
              key={frameKey}
              className={`url-card-frame${editMode ? ' is-edit-mode' : ''}${scale !== DEFAULT_URL_CARD_SCALE ? ' is-scaled' : ''}`}
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
