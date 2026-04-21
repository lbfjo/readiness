import { LogoMark, Wordmark } from "@/components/logo";

type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next = "/today", error } = await searchParams;
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-10">
      <form
        action="/api/login"
        method="post"
        className="w-full max-w-sm space-y-6 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 p-8 shadow-xl backdrop-blur"
      >
        <div className="flex items-center gap-2.5">
          <LogoMark className="text-[var(--color-accent)]" size={32} />
          <Wordmark />
        </div>

        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
            Single-user access
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
            Enter your secret
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Track. Understand. Recover.
          </p>
        </div>

        <input type="hidden" name="next" value={next} />
        <div className="space-y-2">
          <label className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Access secret
          </label>
          <input
            type="password"
            name="secret"
            autoFocus
            placeholder="••••••••"
            className="w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        {error ? (
          <p className="rounded-xl border border-[var(--color-negative)]/30 bg-[var(--color-negative)]/10 px-3 py-2 text-xs text-[var(--color-negative)]">
            Wrong secret. Try again.
          </p>
        ) : null}

        <button
          type="submit"
          className="w-full rounded-xl bg-[var(--color-accent)] px-3 py-3 font-display text-xs font-bold uppercase tracking-[0.22em] text-[#0b1320] transition hover:brightness-110"
        >
          Enter
        </button>
      </form>
    </div>
  );
}
