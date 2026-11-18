// Кружечок із фото клієнта або першою літерою імені.
export default function Avatar({
  name,
  url,
  size = 40,
  dot,
}: {
  name: string;
  url?: string | null;
  size?: number;
  // Колір крапки статусу в куті (клас Tailwind, напр. "bg-success").
  dot?: string;
}) {
  return (
    <span className="relative inline-flex flex-none" style={{ width: size, height: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full rounded-full border border-line object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full border border-line bg-paper font-display font-bold text-ink"
          style={{ fontSize: size * 0.38 }}
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      {dot && <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${dot}`} />}
    </span>
  );
}
