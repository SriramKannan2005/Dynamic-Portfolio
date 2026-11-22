/** Renders a symbol from the sprite in index.html. */
export function Icon({ id, className = 'ic' }: { id: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true" focusable="false">
      <use href={`#i-${id}`} />
    </svg>
  );
}
