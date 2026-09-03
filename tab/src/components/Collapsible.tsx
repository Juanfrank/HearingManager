import { useState, type ReactNode } from "react";

export function Collapsible({
  title,
  count,
  defaultOpen,
  accent,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen: boolean;
  accent?: "green" | "amber" | "red" | "default";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="collapsible">
      <button
        className={`collapsible-header accent-${accent ?? "default"}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>
          {title}
          {typeof count === "number" && <span className="count"> ({count})</span>}
        </span>
        <span className={`chevron ${open ? "open" : ""}`}>▾</span>
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  );
}
