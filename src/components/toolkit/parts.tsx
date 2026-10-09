import { createContext, useContext, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { HttpMethod } from "./model";

type IconData = Parameters<typeof HugeiconsIcon>[0]["icon"];

export function Icon({ icon, size = 16, className = "" }: { icon: IconData; size?: number; className?: string }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.5} className={className} aria-hidden="true" />;
}

/** Which errors are visible: a field's error shows once it was touched or after "Tạo tool kit". */
export interface FieldCtx {
  error: (key: string) => string | undefined;
  touch: (key: string) => void;
}
export const FieldContext = createContext<FieldCtx>({ error: () => undefined, touch: () => {} });
export const useField = (key: string) => {
  const ctx = useContext(FieldContext);
  return { error: ctx.error(key), onBlur: () => ctx.touch(key), "data-field": key, "aria-invalid": !!ctx.error(key) };
};

export function SectionCard({ title, subtitle, actions, children, id }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string;
}) {
  return (
    <section id={id} className="rounded-lg border bg-card text-card-foreground">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>
      <div className="px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
    </section>
  );
}

/** Label row with a fixed height, so inputs in the same grid row line up even when one label
 * carries a badge. */
export function FieldLabel({ htmlFor, children, required, badge }: { htmlFor?: string; children: ReactNode; required?: boolean; badge?: ReactNode }) {
  return (
    <div className="h-6 mb-1.5 flex items-center gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium leading-none">
        {children}{required && <span className="text-destructive"> *</span>}
      </label>
      {badge}
    </div>
  );
}

export const SmallBadge = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <Badge variant="outline" className={`rounded-sm px-1.5 py-0 h-5 text-[11px] font-medium text-muted-foreground ${className}`}>{children}</Badge>
);

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{children}</p>;
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="text-xs text-destructive mt-1.5" role="alert">{children}</p>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">{children}</p>;
}

export function MethodBadge({ method, className = "" }: { method: HttpMethod; className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-sm border px-1.5 h-5 min-w-[52px] font-mono text-[11px] font-semibold ${method === "DELETE" ? "border-destructive/40 text-destructive" : "text-foreground"} ${className}`}>
      {method}
    </span>
  );
}

export function SecretInput({ id, value, onChange, placeholder, fieldKey, ariaLabel }: {
  id?: string; value: string; onChange: (v: string) => void; placeholder?: string; fieldKey?: string; ariaLabel?: string;
}) {
  const [shown, setShown] = useState(false);
  const f = useField(fieldKey ?? "");
  return (
    <div className="relative">
      <Input
        id={id}
        type={shown ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="new-password"
        className="pr-9 font-mono"
        {...(fieldKey ? { onBlur: f.onBlur, "data-field": fieldKey, "aria-invalid": f["aria-invalid"] } : {})}
      />
      <button
        type="button"
        onClick={() => setShown(s => !s)}
        aria-label={shown ? "Ẩn giá trị" : "Hiện giá trị"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon icon={shown ? ViewOffIcon : ViewIcon} size={16} />
      </button>
    </div>
  );
}

export function JsonField({ id, label, badge, value, onChange, onFormat, extra, disabled, disabledNote, fieldKey, hint, rows = 6, placeholder }: {
  id: string; label: string; badge?: ReactNode; value: string; onChange: (v: string) => void; onFormat: () => void;
  extra?: ReactNode; disabled?: boolean; disabledNote?: string; fieldKey: string; hint?: ReactNode; rows?: number; placeholder?: string;
}) {
  const f = useField(fieldKey);
  return (
    <div>
      <div className="h-6 mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <label htmlFor={id} className="text-sm font-medium leading-none">{label}</label>
          {badge}
        </div>
        <div className="flex items-center gap-1">
          {extra}
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onFormat} disabled={disabled || !value.trim()}>Format</Button>
        </div>
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={f.onBlur}
        data-field={fieldKey}
        aria-invalid={f["aria-invalid"]}
        disabled={disabled}
        rows={rows}
        spellCheck={false}
        placeholder={placeholder}
        className={`font-mono text-xs leading-relaxed ${f.error ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
      />
      {disabled && disabledNote ? <Hint>{disabledNote}</Hint> : hint ? <Hint>{hint}</Hint> : null}
      <ErrorText>{f.error}</ErrorText>
    </div>
  );
}
