import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-stone-600">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
