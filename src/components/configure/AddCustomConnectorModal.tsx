import { useState, type ReactNode } from "react";
import { Eye, EyeOff, Trash2, Plus, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  customConnectorStore, CONNECTOR_AUTH_LABEL,
  type ConnectorAuthType, type ConnectorHeader, type ConnectorOAuth, type CustomConnector,
} from "./customConnectorStore";
import type { Sharing } from "./customConnectorSharing";

const AUTH_OPTIONS: ConnectorAuthType[] = ["none", "static_headers", "oauth_auto", "oauth_manual"];

const HELP: Record<ConnectorAuthType, string> = {
  none: "Chọn cách server này xác thực. OAuth 2.1 (Tự động) sẽ đọc metadata của chính server và tự đăng ký client.",
  static_headers: "Chọn cách server này xác thực. OAuth 2.1 (Tự động) sẽ đọc metadata của chính server và tự đăng ký client.",
  oauth_auto: "Không cần điền gì thêm: hệ thống tự tìm endpoint OAuth từ URL server (RFC 9728, RFC 8414) và đăng ký client (RFC 7591). Bạn uỷ quyền sau.",
  oauth_manual: "Dành cho server không công bố metadata OAuth, hoặc không cho đăng ký client. Dán những gì tài liệu của server cung cấp.",
};

const isHttpUrl = (v: string) => {
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

const inputCls = "h-10 rounded-xl focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0 focus-visible:border-primary";

function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="text-xs text-destructive mt-1.5">{children}</p>;
}

function Help({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>;
}

function SecretInput({ id, value, onChange, placeholder }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative flex-1 min-w-0">
      <Input
        id={id}
        type={shown ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pr-9`}
      />
      <button
        type="button"
        onClick={() => setShown(s => !s)}
        aria-label={shown ? "Ẩn giá trị" : "Hiện giá trị"}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {shown ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

function Advanced({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary">
        Nâng cao <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 space-y-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** "Thêm MCP tùy chỉnh" — create/edit form for a Custom Connector (an MCP server), opened from the
 * Connectors page's Custom Connectors tab and from a Custom Connector's detail popup ("Chỉnh sửa").
 * Authentication: none, static headers, or OAuth 2.1 — Auto (discovers endpoints and registers a
 * client from the server's own metadata) or Manual (the Builder pastes Authorize/Token URL and
 * Client ID). New connectors are shared with the whole Space by default, as before; who can use
 * one is changed afterwards from its "Ai được dùng" menu item. */
export default function AddCustomConnectorModal({ editing, onClose, onCreated, onUpdated }: {
  editing?: CustomConnector;
  onClose: () => void;
  onCreated?: (connector: CustomConnector) => void;
  onUpdated?: (connector: CustomConnector) => void;
}) {
  const isEditing = !!editing;
  const [name, setName] = useState(editing?.name ?? "");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [authType, setAuthType] = useState<ConnectorAuthType>(editing?.authType ?? "none");
  const [headers, setHeaders] = useState<ConnectorHeader[]>(
    editing?.headers.length ? editing.headers.map(h => ({ ...h })) : [{ key: "", value: "" }],
  );
  const [oauth, setOauth] = useState<ConnectorOAuth>(editing?.oauth ?? {});
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const setO = (k: keyof ConnectorOAuth, v: string) => setOauth(o => ({ ...o, [k]: v }));
  const touch = (k: string) => setTouched(t => ({ ...t, [k]: true }));


  const requiredUrl = (v: string | undefined, label: string) =>
    !v?.trim() ? `Vui lòng nhập ${label}.` : !isHttpUrl(v) ? "Nhập một URL http(s) hợp lệ." : undefined;

  const errors: Record<string, string | undefined> = {
    name: !name.trim() ? "Vui lòng nhập tên." : customConnectorStore.isDuplicateName(name, editing?.id) ? "Đã có custom connector với tên này." : undefined,
    url: requiredUrl(url, "URL"),
    authorizeUrl: authType === "oauth_manual" ? requiredUrl(oauth.authorizeUrl, "Authorize URL") : undefined,
    tokenUrl: authType === "oauth_manual" ? requiredUrl(oauth.tokenUrl, "Token URL") : undefined,
    clientId: authType === "oauth_manual" && !oauth.clientId?.trim() ? "Vui lòng nhập Client ID." : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  // "Required" errors wait for "Lưu server"; a malformed value shows as soon as the field is left.
  const show = (k: string) => submitted || (touched[k] && !errors[k]?.startsWith("Vui lòng"));

  const submit = () => {
    setSubmitted(true);
    if (hasErrors) return;
    const data = {
      name: name.trim(), url: url.trim(), authType,
      headers: headers.filter(h => h.key.trim()),
      oauth: authType === "oauth_auto" ? { scope: oauth.scope, clientId: oauth.clientId } : authType === "oauth_manual" ? oauth : undefined,
    };
    if (isEditing && editing) {
      customConnectorStore.update(editing.id, data);
      onUpdated?.(customConnectorStore.get(editing.id)!);
      return;
    }
    const sharing: Sharing = { mode: "all", people: [] };
    onCreated?.(customConnectorStore.create({ ...data, sharing }));
  };

  const setHeader = (i: number, field: "key" | "value", v: string) =>
    setHeaders(hs => hs.map((h, idx) => (idx === i ? { ...h, [field]: v } : h)));

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="z-[70] sm:max-w-[450px] p-0 gap-0 rounded-xl flex flex-col max-h-[90vh] overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 text-left">
          <DialogTitle className="text-lg">{isEditing ? "Sửa MCP tùy chỉnh" : "Thêm MCP tùy chỉnh"}</DialogTitle>
          <DialogDescription>Kết nối một MCP server để cấp các tool của nó cho agent.</DialogDescription>
        </DialogHeader>

        <form
          id="add-mcp-form"
          noValidate
          onSubmit={e => { e.preventDefault(); submit(); }}
          className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-5"
        >
          <div>
            <Label htmlFor="mcp-name" className="mb-1.5 block">Tên</Label>
            <Input id="mcp-name" autoFocus value={name} onChange={e => setName(e.target.value)} onBlur={() => touch("name")} placeholder="my-mcp-server" className={inputCls} aria-invalid={!!(show("name") && errors.name)} />
            <FieldError>{show("name") && errors.name}</FieldError>
          </div>

          <div>
            <Label htmlFor="mcp-url" className="mb-1.5 block">URL</Label>
            <Input id="mcp-url" value={url} onChange={e => setUrl(e.target.value)} onBlur={() => touch("url")} placeholder="https://api.example.com/mcp" className={inputCls} aria-invalid={!!(show("url") && errors.url)} />
            <FieldError>{show("url") && errors.url}</FieldError>
          </div>

          <div className="space-y-3">
            <Label className="block">Xác thực</Label>
            <RadioGroup value={authType} onValueChange={v => setAuthType(v as ConnectorAuthType)} className="gap-2.5">
              {AUTH_OPTIONS.map(opt => (
                <div key={opt} className="flex items-center gap-2.5">
                  <RadioGroupItem value={opt} id={`auth-${opt}`} />
                  <Label htmlFor={`auth-${opt}`} className="font-normal cursor-pointer">{CONNECTOR_AUTH_LABEL[opt]}</Label>
                </div>
              ))}
            </RadioGroup>
            <Help>{HELP[authType]}</Help>

            {authType === "static_headers" && (
              <div className="space-y-2 pt-1">
                <Label className="block">Headers (tuỳ chọn)</Label>
                {headers.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={h.key} onChange={e => setHeader(i, "key", e.target.value)} placeholder="Authorization" aria-label="Header key" className={`${inputCls} flex-1 min-w-0`} />
                    <SecretInput value={h.value} onChange={v => setHeader(i, "value", v)} placeholder="Bearer …" />
                    <button
                      type="button"
                      onClick={() => setHeaders(hs => hs.filter((_, idx) => idx !== i))}
                      aria-label="Xoá header"
                      className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setHeaders(hs => [...hs, { key: "", value: "" }])}
                  className="w-full h-10 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-muted inline-flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} /> Thêm header
                </button>
                <Help>Key dùng chung cho cả workspace. Mỗi người vẫn có thể kết nối key riêng của họ ở Workspace.</Help>
              </div>
            )}

            {authType === "oauth_auto" && (
              <div className="pt-1">
                <Advanced>
                  <div>
                    <Label htmlFor="auto-client" className="mb-1.5 block">Client ID (không bắt buộc)</Label>
                    <Input id="auto-client" value={oauth.clientId ?? ""} onChange={e => setO("clientId", e.target.value)} className={inputCls} />
                    <p className="text-xs text-muted-foreground mt-1.5">Chỉ điền khi server không cho đăng ký client tự động.</p>
                  </div>
                  <div>
                    <Label htmlFor="auto-scope" className="mb-1.5 block">Scope (không bắt buộc)</Label>
                    <Input id="auto-scope" value={oauth.scope ?? ""} onChange={e => setO("scope", e.target.value)} placeholder="read write" className={inputCls} />
                    <p className="text-xs text-muted-foreground mt-1.5">Cách nhau bằng dấu cách hoặc dấu phẩy. Để trống để dùng đúng scope server yêu cầu.</p>
                  </div>
                </Advanced>
              </div>
            )}

            {authType === "oauth_manual" && (
              <div className="space-y-4 pt-1">
                <div>
                  <Label htmlFor="m-authorize" className="mb-1.5 block">Authorize URL</Label>
                  <Input id="m-authorize" value={oauth.authorizeUrl ?? ""} onChange={e => setO("authorizeUrl", e.target.value)} onBlur={() => touch("authorizeUrl")} placeholder="https://auth.example.com/authorize" className={inputCls} />
                  <FieldError>{show("authorizeUrl") && errors.authorizeUrl}</FieldError>
                </div>
                <div>
                  <Label htmlFor="m-token" className="mb-1.5 block">Token URL</Label>
                  <Input id="m-token" value={oauth.tokenUrl ?? ""} onChange={e => setO("tokenUrl", e.target.value)} onBlur={() => touch("tokenUrl")} placeholder="https://auth.example.com/token" className={inputCls} />
                  <FieldError>{show("tokenUrl") && errors.tokenUrl}</FieldError>
                </div>
                <div>
                  <Label htmlFor="m-client" className="mb-1.5 block">Client ID</Label>
                  <Input id="m-client" value={oauth.clientId ?? ""} onChange={e => setO("clientId", e.target.value)} onBlur={() => touch("clientId")} className={inputCls} />
                  <FieldError>{show("clientId") && errors.clientId}</FieldError>
                </div>
                <Advanced>
                  <div>
                    <Label htmlFor="m-secret" className="mb-1.5 block">Client secret (không bắt buộc)</Label>
                    <SecretInput id="m-secret" value={oauth.clientSecret ?? ""} onChange={v => setO("clientSecret", v)} />
                    <p className="text-xs text-muted-foreground mt-1.5">Phần lớn server OAuth 2.1 không cần secret — PKCE đã bảo vệ public client. Để trống trừ khi server cấp cho bạn.</p>
                  </div>
                  <div>
                    <Label htmlFor="m-scope" className="mb-1.5 block">Scope (không bắt buộc)</Label>
                    <Input id="m-scope" value={oauth.scope ?? ""} onChange={e => setO("scope", e.target.value)} placeholder="read write" className={inputCls} />
                    <p className="text-xs text-muted-foreground mt-1.5">Cách nhau bằng dấu cách hoặc dấu phẩy. Để trống để dùng đúng scope server yêu cầu.</p>
                  </div>
                </Advanced>
              </div>
            )}
          </div>
        </form>

        <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2 sm:gap-2 sm:space-x-0">
          <Button type="button" variant="secondary" onClick={onClose} className="rounded-xl bg-surface-muted hover:bg-surface-sunken">Hủy</Button>
          <Button type="submit" form="add-mcp-form" className="rounded-xl">{isEditing ? "Lưu thay đổi" : "Lưu server"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
