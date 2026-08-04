export interface CardOrderControlsProps {
  title: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/** Compact ↑/↓ controls for edit-mode card reorder (beside the drag handle). */
export function CardOrderControls({
  title,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: CardOrderControlsProps) {
  return (
    <span className="card-order-controls">
      <button
        type="button"
        className="card-order-btn"
        disabled={!canMoveUp}
        title={`Move ${title} up`}
        aria-label={`Move ${title} up`}
        onClick={onMoveUp}
      >
        <span aria-hidden="true">↑</span>
      </button>
      <button
        type="button"
        className="card-order-btn"
        disabled={!canMoveDown}
        title={`Move ${title} down`}
        aria-label={`Move ${title} down`}
        onClick={onMoveDown}
      >
        <span aria-hidden="true">↓</span>
      </button>
    </span>
  );
}
