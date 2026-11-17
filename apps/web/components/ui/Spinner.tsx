/**
 * `decorative` hides it from assistive tech; use it inside a button whose own label already
 * says what is happening, so the button keeps a clean accessible name.
 */
export function Spinner({
  label = "Loading",
  decorative = false,
}: {
  label?: string;
  decorative?: boolean;
}) {
  return (
    <span
      {...(decorative ? { "aria-hidden": true } : { role: "status", "aria-label": label })}
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
    />
  );
}
