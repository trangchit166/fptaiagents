import { useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowDown01Icon, Tick02Icon, Add01Icon, Delete02Icon, SquareLock02Icon, InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorText, FieldLabel, Hint, Icon, SecretInput, SectionCard, useField } from "./parts";
import { uid, type AuthType, type KitForm } from "./model";

export const AUTH_OPTIONS: { value: AuthType; title: string; subtitle: string }[] = [
  { value: "none", title: "Không xác thực", subtitle: "API công khai, không gửi credential." },
  { value: "api_key", title: "API key", subtitle: "Header tĩnh gửi kèm mọi request." },
  { value: "oauth_auto", title: "OAuth 2.1 (Tự động)", subtitle: "Tự tìm endpoint OAuth và tự đăng ký client." },
  { value: "oauth_manual", title: "OAuth 2.1 (Thủ công)", subtitle: "Nhập endpoint và Client ID từ tài liệu của server." },
];

/** Single-select listbox in a popover: ↑/↓ move, Enter selects, Esc closes (Radix). */
function AuthSelect({ value, onChange }: { value: AuthType; onChange: (v: AuthType) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const current = AUTH_OPTIONS.find(o => o.value === value)!;

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) setActive(Math.max(0, AUTH_OPTIONS.findIndex(x => x.value === value)));
  };
  const pick = (i: number) => { onChange(AUTH_OPTIONS[i].value); setOpen(false); };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => (a + 1) % AUTH_OPTIONS.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => (a - 1 + AUTH_OPTIONS.length) % AUTH_OPTIONS.length); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(AUTH_OPTIONS.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(active); }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id="auth-type"
          role="combobox"
          aria-controls="auth-type-list"
          aria-haspopup="listbox"
          aria-expanded={open}
          className="w-full max-w-[450px] flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{current.title}</span>
            <span className="block text-xs text-muted-foreground truncate">{current.subtitle}</span>
          </span>
          <Icon icon={ArrowDown01Icon} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] max-w-[450px] p-1"
        onOpenAutoFocus={e => { e.preventDefault(); listRef.current?.focus(); }}
      >
        <div
          ref={listRef}
          id="auth-type-list"
          role="listbox"
          aria-label="Auth type"
          aria-activedescendant={`auth-opt-${AUTH_OPTIONS[active].value}`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="outline-none"
        >
          {AUTH_OPTIONS.map((o, i) => {
            const selected = o.value === value;
            return (
              <div
                key={o.value}
                id={`auth-opt-${o.value}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(i)}
                className={`flex items-start gap-3 rounded-sm px-2.5 py-2 cursor-pointer ${i === active ? "bg-muted" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{o.title}</span>
                  <span className="block text-xs text-muted-foreground">{o.subtitle}</span>
                </span>
                <Icon icon={Tick02Icon} className={`shrink-0 mt-0.5 text-primary ${selected ? "" : "invisible"}`} />
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Advanced({ form, set }: { form: KitForm; set: (f: Partial<KitForm>) => void }) {
  const [open, setOpen] = useState(false);
  const o = form.oauth;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/50 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Nâng cao
        <Icon icon={ArrowDown01Icon} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 pt-1 space-y-4">
        <div>
          <FieldLabel htmlFor="oauth-secret">Client secret (không bắt buộc)</FieldLabel>
          <SecretInput id="oauth-secret" value={o.clientSecret} onChange={v => set({ oauth: { ...o, clientSecret: v } })} />
          <Hint>Đa số server OAuth 2.1 không cấp secret vì PKCE đã bảo vệ public client. Chỉ nhập nếu server đưa cho bạn. Giá trị chỉ ghi, không bao giờ trả lại.</Hint>
        </div>
        <div>
          <FieldLabel htmlFor="oauth-scopes">Scopes (không bắt buộc)</FieldLabel>
          <Input id="oauth-scopes" value={o.scopes} onChange={e => set({ oauth: { ...o, scopes: e.target.value } })} placeholder="read write" className="font-mono" />
          <Hint>Cách nhau bằng dấu cách hoặc dấu phẩy. Để trống thì dùng scope server yêu cầu.</Hint>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function UrlField({ id, label, placeholder, value, onChange, fieldKey }: { id: string; label: string; placeholder?: string; value: string; onChange: (v: string) => void; fieldKey: string }) {
  const f = useField(fieldKey);
  return (
    <div>
      <FieldLabel htmlFor={id} required>{label}</FieldLabel>
      <Input id={id} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="font-mono"
        onBlur={f.onBlur} data-field={fieldKey} aria-invalid={f["aria-invalid"]} />
      <ErrorText>{f.error}</ErrorText>
    </div>
  );
}

function HeaderRow({ h, onChange, onRemove }: { h: KitForm["headers"][number]; onChange: (p: Partial<{ key: string; value: string }>) => void; onRemove: () => void }) {
  const k = useField(`header.${h.id}.key`);
  const v = useField(`header.${h.id}.value`);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-start">
      <div>
        <Input value={h.key} onChange={e => onChange({ key: e.target.value })} placeholder="X-API-Key" aria-label="Tên header" className="font-mono"
          onBlur={k.onBlur} data-field={`header.${h.id}.key`} aria-invalid={k["aria-invalid"]} />
        <ErrorText>{k.error}</ErrorText>
      </div>
      <div>
        <SecretInput value={h.value} onChange={value => onChange({ value })} placeholder="Bearer … hoặc sk-…" ariaLabel="Giá trị header" fieldKey={`header.${h.id}.value`} />
        <ErrorText>{v.error}</ErrorText>
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Xóa header" className="h-10 w-10 text-muted-foreground hover:text-destructive">
        <Icon icon={Delete02Icon} />
      </Button>
    </div>
  );
}

export default function AuthCard({ form, set }: { form: KitForm; set: (f: Partial<KitForm>) => void }) {
  const headersField = useField("headers");
  const o = form.oauth;
  return (
    <SectionCard title="Xác thực" subtitle="Cách hệ thống gửi credential khi agent gọi API.">
      <div className="space-y-5">
        <div>
          <FieldLabel htmlFor="auth-type" required>Auth type</FieldLabel>
          <AuthSelect value={form.authType} onChange={authType => set({ authType })} />
        </div>

        {form.authType === "api_key" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <FieldLabel required>Headers</FieldLabel>
              <Button type="button" variant="ghost" size="sm" data-field="headers" onClick={() => set({ headers: [...form.headers, { id: uid("h"), key: "", value: "" }] })}>
                <Icon icon={Add01Icon} /> Thêm header
              </Button>
            </div>
            {form.headers.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-3">Chưa có header. Ví dụ: Authorization: Bearer … hoặc X-API-Key: …</p>
            ) : (
              <div className="space-y-2">
                {form.headers.map(h => (
                  <HeaderRow
                    key={h.id}
                    h={h}
                    onChange={p => set({ headers: form.headers.map(x => (x.id === h.id ? { ...x, ...p } : x)) })}
                    onRemove={() => set({ headers: form.headers.filter(x => x.id !== h.id) })}
                  />
                ))}
              </div>
            )}
            <ErrorText>{headersField.error}</ErrorText>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Icon icon={SquareLock02Icon} size={14} className="mt-px shrink-0" />
              Giá trị chỉ ghi, lưu vào kho secret. Không bao giờ trả lại trong response; màn sửa chỉ hiện tên header.
            </p>
            <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2.5 text-xs text-muted-foreground">
              <Icon icon={InformationCircleIcon} size={14} className="mt-px shrink-0" />
              Chỉ hỗ trợ credential gửi qua header. API key đặt trên query string (?api_key=…) chưa hỗ trợ.
            </div>
          </div>
        )}

        {form.authType === "oauth_auto" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Không cần nhập gì thêm: hệ thống tìm endpoint OAuth từ Base URL (RFC 9728, RFC 8414) và tự đăng ký client (RFC 7591). Người dùng cấp quyền ở bước kết nối.</p>
            <Advanced form={form} set={set} />
          </div>
        )}

        {form.authType === "oauth_manual" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Dành cho server không công bố metadata OAuth hoặc không cho đăng ký client. Dán thông tin từ tài liệu của server.</p>
            <UrlField id="oauth-authorize" label="Authorize URL" placeholder="https://auth.example.com/authorize" value={o.authorizeUrl} onChange={v => set({ oauth: { ...o, authorizeUrl: v } })} fieldKey="oauth.authorizeUrl" />
            <UrlField id="oauth-token" label="Token URL" placeholder="https://auth.example.com/token" value={o.tokenUrl} onChange={v => set({ oauth: { ...o, tokenUrl: v } })} fieldKey="oauth.tokenUrl" />
            <UrlField id="oauth-client" label="Client ID" value={o.clientId} onChange={v => set({ oauth: { ...o, clientId: v } })} fieldKey="oauth.clientId" />
            <Advanced form={form} set={set} />
          </div>
        )}
      </div>
    </SectionCard>
  );
}
