import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
          Sasha<span className="text-accent">Fit</span>
        </span>
        <span className="h-px w-16 bg-accent" />
        <p className="max-w-xs text-sm text-muted">
          Особистий простір для тренувань, харчування та зв&apos;язку з тренером.
        </p>
      </div>
      <Link
        href="/login"
        className="border border-accent px-8 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent hover:text-paper"
      >
        Увійти
      </Link>
    </main>
  );
}
