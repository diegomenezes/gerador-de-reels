import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-soft)]">{eyebrow}</p>
        )}
        <h2 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-2 max-w-xl text-[var(--ink-soft)]">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </section>
  );
}
