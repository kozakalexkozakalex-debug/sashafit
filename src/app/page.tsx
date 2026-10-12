import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
          <span className="text-sm font-bold text-paper">SF</span>
        </div>
        <span className="text-xl font-bold">SashaFit</span>
      </div>
      <p className="max-w-sm text-sm text-muted">
        Платформа для онлайн-тренера та його клієнтів.
      </p>
      <Link
        href="/login"
        className="rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-paper"
      >
        Увійти
      </Link>
    </main>
  );
}
