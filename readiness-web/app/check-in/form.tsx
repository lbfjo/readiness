"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import type { ActiveIssue, IssueCheckin, SubjectiveCheckin } from "@/lib/db/schema";
import { saveCheckin, type CheckinActionState } from "./actions";

type Props = {
  date: string;
  initial: SubjectiveCheckin | null;
  activeIssue: ActiveIssue | null;
  initialIssueCheckin: IssueCheckin | null;
};

const INITIAL_STATE: CheckinActionState = { status: "idle" };

export function CheckInForm({ date, initial, activeIssue, initialIssueCheckin }: Props) {
  const [state, formAction] = useActionState(saveCheckin, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="date" value={date} />
      {activeIssue ? <input type="hidden" name="issueId" value={activeIssue.id} /> : null}

      <LikertField
        name="energy"
        label="Energy"
        help="How much gas in the tank?"
        initial={initial?.energy ?? null}
      />
      <LikertField
        name="mood"
        label="Mood"
        help="Low to high. Headspace counts."
        initial={initial?.mood ?? null}
      />
      <LikertField
        name="soreness"
        label="Soreness"
        help="1 = nothing, 5 = can't move."
        initial={initial?.soreness ?? null}
        reverse
      />
      <LikertField
        name="stress"
        label="Stress"
        help="Life + work combined."
        initial={initial?.stress ?? null}
        reverse
      />

      <IllnessToggle initial={Boolean(initial?.illness)} />

      {activeIssue ? (
        <IssueSection issue={activeIssue} initial={initialIssueCheckin} />
      ) : null}

      <div className="space-y-2">
        <label className="flex items-center justify-between font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
          <span>Notes</span>
          <span className="text-[10px] normal-case tracking-normal text-[var(--color-subtle)]">
            optional
          </span>
        </label>
        <textarea
          name="notes"
          defaultValue={initial?.notes ?? ""}
          rows={3}
          maxLength={2000}
          placeholder="Anything unusual today? Travel, poor sleep, big session tomorrow..."
          className="w-full resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-3 text-sm text-white placeholder:text-[var(--color-subtle)] focus:border-[var(--color-accent)] focus:outline-none"
        />
      </div>

      <StatusBanner state={state} />

      <div className="flex items-center gap-3">
        <SubmitButton hasInitial={Boolean(initial)} />
        {initial ? (
          <p className="text-xs text-[var(--color-muted)]">
            Last updated {formatWhen(initial.updatedAt)}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function IssueSection({
  issue,
  initial,
}: {
  issue: ActiveIssue;
  initial: IssueCheckin | null;
}) {
  return (
    <section className="space-y-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-4 py-4">
      <div>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
          Active Issue
        </p>
        <h2 className="mt-1 font-display text-lg font-semibold text-white">{issue.label}</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Stage: {issue.stage.replaceAll("_", " ")}. Log the morning tissue state so Today can decide whether to proceed, reduce, swap, or rehab only.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PainField
          name="firstStepPain"
          label="First-step pain"
          help="Best signal for morning tendon irritability."
          initial={initial?.firstStepPain ?? null}
        />
        <PainField
          name="painWalking"
          label="Pain walking"
          help="How noticeable is it during normal walking?"
          initial={initial?.painWalking ?? null}
        />
        <PainField
          name="painStairs"
          label="Pain on stairs"
          help="Good proxy for push-off irritation."
          initial={initial?.painStairs ?? null}
        />
        <NumberField
          name="morningStiffnessMinutes"
          label="Morning stiffness"
          help="How many minutes until it settles?"
          initial={initial?.morningStiffnessMinutes ?? null}
          placeholder="0"
          unit="min"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ToggleField
          name="limp"
          label="Limp or compensation?"
          help="Any obvious change in mechanics should downgrade the day."
          initial={Boolean(initial?.limp)}
        />
        <WarmupResponseField initial={initial?.warmupResponse ?? null} />
      </div>

      <div className="space-y-2">
        <label className="flex items-center justify-between font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
          <span>Issue notes</span>
          <span className="text-[10px] normal-case tracking-normal text-[var(--color-subtle)]">
            optional
          </span>
        </label>
        <textarea
          name="issueNotes"
          defaultValue={initial?.notes ?? ""}
          rows={2}
          maxLength={1000}
          placeholder="Anything specific about the tissue today? Stairs, first steps, warm-up response..."
          className="w-full resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-3 text-sm text-white placeholder:text-[var(--color-subtle)] focus:border-[var(--color-accent)] focus:outline-none"
        />
      </div>
    </section>
  );
}

function LikertField({
  name,
  label,
  help,
  initial,
  reverse = false,
}: {
  name: string;
  label: string;
  help: string;
  initial: number | null;
  reverse?: boolean;
}) {
  const [value, setValue] = useState<number | null>(initial);

  return (
    <fieldset className="space-y-2">
      <div className="flex items-baseline justify-between">
        <legend className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
          {label}
        </legend>
        <span className="text-[11px] text-[var(--color-subtle)]">{help}</span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setValue(value === n ? null : n)}
            aria-pressed={value === n}
            className={pillClass(value === n, reverse ? 6 - n : n)}
          >
            {n}
          </button>
        ))}
      </div>
      <input type="hidden" name={name} value={value ?? ""} />
    </fieldset>
  );
}

function PainField({
  name,
  label,
  help,
  initial,
}: {
  name: string;
  label: string;
  help: string;
  initial: number | null;
}) {
  const [value, setValue] = useState<number | null>(initial);

  return (
    <fieldset className="space-y-2">
      <div className="flex items-baseline justify-between">
        <legend className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
          {label}
        </legend>
        <span className="text-[11px] text-[var(--color-subtle)]">{help}</span>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setValue(value === n ? null : n)}
            aria-pressed={value === n}
            className={pillClass(value === n, Math.max(1, n + 1))}
          >
            {n}
          </button>
        ))}
      </div>
      <input type="hidden" name={name} value={value ?? ""} />
    </fieldset>
  );
}

function NumberField({
  name,
  label,
  help,
  initial,
  placeholder,
  unit,
}: {
  name: string;
  label: string;
  help: string;
  initial: number | null;
  placeholder: string;
  unit: string;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-baseline justify-between font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
        <span>{label}</span>
        <span className="text-[11px] normal-case tracking-normal text-[var(--color-subtle)]">
          {help}
        </span>
      </label>
      <div className="relative">
        <input
          type="number"
          min={0}
          max={180}
          name={name}
          defaultValue={initial ?? ""}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-3 pr-14 text-sm text-white placeholder:text-[var(--color-subtle)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--color-subtle)]">
          {unit}
        </span>
      </div>
    </div>
  );
}

function ToggleField({
  name,
  label,
  help,
  initial,
}: {
  name: string;
  label: string;
  help: string;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  return (
    <div className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-4 py-3">
      <div>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
          {label}
        </p>
        <p className="text-xs text-[var(--color-muted)]">{help}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn((v) => !v)}
        className={`relative h-7 w-12 rounded-full border transition ${
          on
            ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
            : "border-[var(--color-border-strong)] bg-[var(--color-surface-2)]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-[#0b1320] transition ${
            on ? "left-6" : "left-0.5"
          }`}
        />
      </button>
      <input type="hidden" name={name} value={on ? "on" : ""} />
    </div>
  );
}

function WarmupResponseField({ initial }: { initial: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  const options = [
    { value: "better", label: "Better" },
    { value: "same", label: "Same" },
    { value: "worse", label: "Worse" },
  ];

  return (
    <fieldset className="space-y-2">
      <div className="flex items-baseline justify-between">
        <legend className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
          Warm-up response
        </legend>
        <span className="text-[11px] text-[var(--color-subtle)]">
          Did easy movement improve it?
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setValue(value === option.value ? null : option.value)}
            aria-pressed={value === option.value}
            className={pillClass(value === option.value, option.value === "worse" ? 5 : 2)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <input type="hidden" name="warmupResponse" value={value ?? ""} />
    </fieldset>
  );
}

function pillClass(active: boolean, magnitude: number): string {
  const base =
    "h-11 rounded-xl border font-display text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";
  if (!active) {
    return `${base} border-[var(--color-border)] bg-[var(--color-surface)]/40 text-[var(--color-muted)] hover:text-white hover:border-[var(--color-border-strong)]`;
  }
  // Light shading by magnitude so 5 feels heavier than 1 visually. Purely
  // decorative - all values have equal semantic weight.
  const shade = Math.max(0.35, Math.min(1, magnitude / 5));
  return `${base} border-[var(--color-accent)] bg-[var(--color-accent)] text-[#0b1320]` +
    ` shadow-[0_0_0_2px_rgba(155,255,112,${shade * 0.25})]`;
}

function IllnessToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <div className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-4 py-3">
      <div>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
          Feeling ill?
        </p>
        <p className="text-xs text-[var(--color-muted)]">
          Flips a penalty on the score until your next check-in.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn((v) => !v)}
        className={`relative h-7 w-12 rounded-full border transition ${
          on
            ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
            : "border-[var(--color-border-strong)] bg-[var(--color-surface-2)]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-[#0b1320] transition ${
            on ? "left-6" : "left-0.5"
          }`}
        />
      </button>
      <input type="hidden" name="illness" value={on ? "on" : ""} />
    </div>
  );
}

function SubmitButton({ hasInitial }: { hasInitial: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-6 py-2.5 font-display text-xs font-bold uppercase tracking-[0.2em] text-[#0b1320] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving
        </>
      ) : (
        <>
          <Check className="h-4 w-4" />
          {hasInitial ? "Update check-in" : "Save check-in"}
        </>
      )}
    </button>
  );
}

function StatusBanner({ state }: { state: CheckinActionState }) {
  const errorText = useMemo(() => {
    if (state.status !== "error") return null;
    const parts = [state.message].filter(Boolean);
    if (state.fieldErrors) {
      for (const [k, v] of Object.entries(state.fieldErrors)) {
        parts.push(`${k}: ${v}`);
      }
    }
    return parts.join(" · ");
  }, [state]);

  if (state.status === "success") {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-4 py-3 text-sm text-[var(--color-accent)]">
        <Check className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{state.message}</span>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{errorText}</span>
      </div>
    );
  }
  return null;
}

function formatWhen(iso: Date | string | null | undefined): string {
  if (!iso) return "never";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "never";
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}
