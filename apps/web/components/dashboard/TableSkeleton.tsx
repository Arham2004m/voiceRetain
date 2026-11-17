/** Grey bars where table rows will be, so the page does not jump when the data arrives. */
export function TableSkeleton({ rows = 5, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="flex flex-col gap-2">
      <div className="bg-ink/15 h-9" />
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          data-skeleton-row
          className="bg-ink/10 h-14 animate-pulse motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
