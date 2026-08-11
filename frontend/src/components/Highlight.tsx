/** Highlight the first case-insensitive match of `q` inside `text`.
 *  Used by the Ctrl+K search palette. */
export default function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="rounded-sm bg-blue-500/15 px-0.5 text-blue-600 dark:text-blue-400">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}
