import type { Sharing, SharingMode, SharedPerson } from "./customConnectorSharing";
import CustomConnectorMemberPicker from "./CustomConnectorMemberPicker";
import { CURRENT_USER } from "@/components/knowledge/knowledgeBaseStore";
import { AccessScopeSection, resourceAccessCopy } from "@/components/knowledge/QueryScopeSection";
import { useState } from "react";
import { createPortal } from "react-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon, Add01Icon, Delete01Icon, EyeIcon, EyeOffIcon,
  PlayCircleIcon, Loading01Icon, CheckmarkCircle01Icon, Alert01Icon,
} from "@hugeicons/core-free-icons";
import {
  customApiToolStore, defaultAuthConfig, AUTH_TYPE_LABEL, DEFAULT_TIMEOUT_SEC,
  type CustomApiTool, type HttpMethod, type ApiAuthType, type ApiAuthConfig,
  type ApiHeader, type ApiParam, type ApiParamType, type ApiParamLocation,
} from "./customApiToolStore";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const METHOD_CLASS: Record<HttpMethod, string> = {
  GET: "bg-[hsl(var(--success-soft))] text-[hsl(var(--success-strong))]",
  POST: "bg-primary-soft text-primary",
  PUT: "bg-amber-100 text-amber-700",
  PATCH: "bg-purple-100 text-purple-700",
  DELETE: "bg-destructive/10 text-destructive",
};
const AUTH_TYPES: ApiAuthType[] = ["none", "header"];
const PARAM_TYPES: ApiParamType[] = ["string", "number", "boolean", "object", "array"];
const PARAM_LOCATIONS: { value: ApiParamLocation; label: string }[] = [
  { value: "query", label: "Query" },
  { value: "path", label: "Path" },
  { value: "body", label: "Body" },
];

const inputCls = "w-full h-9 px-2.5 rounded-lg border border-border bg-white text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-base";
const labelCls = "text-sm font-medium mb-1.5 block";

function SecretField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative">
      <input
        type={revealed ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pr-8`}
      />
      <button type="button" onClick={() => setRevealed(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        <HugeiconsIcon icon={revealed ? EyeOffIcon : EyeIcon} size={13} />
      </button>
    </div>
  );
}

/** Resolves {placeholders} in the URL using path params' own name as a stand-in value (there's
 * no real backend here — Test only ever simulates), just so the "request preview" line under
 * the Test button reads like a real call instead of showing raw "{order_id}" tokens. */
function previewUrl(url: string, params: ApiParam[]): string {
  return params
    .filter(p => p.location === "path" && p.name.trim())
    .reduce((u, p) => u.split(`{${p.name.trim()}}`).join(`<${p.name.trim()}>`), url);
}

/** "Thêm API Tool" — create/edit form for a Custom API Tool (a plain REST endpoint an Agent can
 * call), separate from "Thêm MCP tùy chỉnh" (customConnectorStore.ts) which points at an
 * existing MCP server instead of describing a single API call. A new tool ends with the same
 * "Quyền truy cập" step as every create popup; the caller passes the starting choice — Space
 * library = whole Space, quick-add inside an Agent = "Chỉ Agent này" (also adds that option). No response mapping / retry / rate limit / cache /
 * mTLS — those are explicitly a later phase. Test only ever simulates a call
 * (this whole app has no real backend), same convention as ToolBuilder's and
 * ConnectSharedConnectorModal's mocked flows. */
export default function AddCustomApiToolModal({ editing, onClose, onCreated, onUpdated, sharing }: {
  editing?: CustomApiTool;
  /** Starting "Quyền truy cập" for a NEW tool (ignored when editing). "private" means it is
   * created inside an Agent, which adds the "Chỉ Agent này" option. */
  sharing?: Sharing;
  onClose: () => void;
  onCreated?: (tool: CustomApiTool) => void;
  onUpdated?: (tool: CustomApiTool) => void;
}) {
  const isEditing = !!editing;
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [method, setMethod] = useState<HttpMethod>(editing?.method ?? "GET");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [authType, setAuthType] = useState<ApiAuthType>(editing?.auth.type ?? "none");
  const [auth, setAuth] = useState<ApiAuthConfig>(editing?.auth ?? { type: "none" });
  const [headers, setHeaders] = useState<ApiHeader[]>(editing?.headers.length ? editing.headers.map(h => ({ ...h })) : [{ key: "", value: "" }]);
  const [params, setParams] = useState<ApiParam[]>(editing?.params.map(p => ({ ...p })) ?? []);
  const [timeoutSec, setTimeoutSec] = useState(editing?.timeoutSec ?? DEFAULT_TIMEOUT_SEC);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const agentOnly = sharing?.mode === "private";
  const [sharingMode, setSharingMode] = useState<SharingMode>(sharing?.mode ?? "all");
  const [people, setPeople] = useState<SharedPerson[]>(sharing?.people ?? []);
  const [urlTouched, setUrlTouched] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; status: number; ms: number; body: string } | null>(null);

  const duplicateName = name.trim() !== "" && customApiToolStore.isDuplicateName(name, editing?.id);
  const isValidUrl = (v: string) => {
    // Path placeholders like {order_id} aren't valid URL syntax on their own, so swap them for
    // a dummy segment before handing the string to URL() — same trick previewUrl uses.
    const probe = v.trim().replace(/\{[^}]*\}/g, "x");
    try {
      const u = new URL(probe);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };
  const urlError = url.trim() !== "" && !isValidUrl(url);
  const peopleError = !isEditing && sharingMode === "specific" && people.length === 0;
  const canSubmit = !!name.trim() && !!description.trim() && !!url.trim() && !duplicateName && !urlError && !peopleError;

  const changeAuthType = (t: ApiAuthType) => { setAuthType(t); setAuth(defaultAuthConfig(t)); };
  const setHeaderField = (i: number, field: "key" | "value", v: string) => setHeaders(hs => hs.map((h, idx) => (idx === i ? { ...h, [field]: v } : h)));
  const removeHeader = (i: number) => setHeaders(hs => hs.filter((_, idx) => idx !== i));
  const setParamField = <K extends keyof ApiParam>(i: number, field: K, v: ApiParam[K]) => setParams(ps => ps.map((p, idx) => (idx === i ? { ...p, [field]: v } : p)));
  const removeParam = (i: number) => setParams(ps => ps.filter((_, idx) => idx !== i));

  const buildData = () => ({
    name: name.trim(), description: description.trim(), method, url: url.trim(),
    // A Header auth with no named header is the same as no auth.
    auth: auth.type === "header" && auth.headers.some(h => h.key.trim())
      ? { type: "header" as const, headers: auth.headers.filter(h => h.key.trim()) }
      : { type: "none" as const },
    headers: headers.filter(h => h.key.trim()), params: params.filter(p => p.name.trim()),
    timeoutSec,
  });

  const submit = () => {
    setSubmitAttempted(true);
    if (!canSubmit) return;
    if (isEditing && editing) {
      customApiToolStore.update(editing.id, buildData());
      onUpdated?.(customApiToolStore.get(editing.id)!);
      return;
    }
    onCreated?.(customApiToolStore.create({ ...buildData(), sharing: { mode: sharingMode, people: sharingMode === "specific" ? people : [] } }));
  };

  const runTest = async () => {
    if (urlError || !url.trim()) return;
    setTesting(true);
    setTestResult(null);
    const start = performance.now();
    await new Promise(r => setTimeout(r, 650 + Math.random() * 400));
    const ms = Math.round(performance.now() - start);
    // Simulated response only — this prototype has no real backend to call out to.
    const missingRequired = params.some(p => p.required && p.location !== "body" && !p.name.trim());
    const ok = !missingRequired;
    setTestResult({
      ok,
      status: ok ? 200 : 400,
      ms,
      body: ok
        ? JSON.stringify({ status: "success", data: { message: "Mô phỏng phản hồi thành công từ API." } }, null, 2)
        : JSON.stringify({ status: "error", message: "Thiếu tham số bắt buộc." }, null, 2),
    });
    setTesting(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[640px] bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-fade-up">
        <div className="flex items-start justify-between px-6 py-5 border-b border-border shrink-0">
          <div>
            <h2 className="font-display text-lg font-semibold">{isEditing ? "Sửa API Tool" : "Thêm API Tool"}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Định nghĩa một API để cấp cho Agent gọi như một công cụ.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-surface-muted flex items-center justify-center text-muted-foreground transition-base mt-0.5 shrink-0">
            <HugeiconsIcon icon={Cancel01Icon} size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Thông tin chung */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Thông tin chung</p>
            <div>
              <label className={labelCls}>Tên API <span className="text-destructive">*</span></label>
              <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Tra cứu đơn hàng" className={inputCls} />
              {duplicateName && <p className="text-xs text-destructive mt-1.5">Đã có API Tool với tên này.</p>}
              {submitAttempted && !name.trim() && <p className="text-xs text-destructive mt-1.5">Bắt buộc nhập tên.</p>}
            </div>
            <div>
              <label className={labelCls}>Mô tả <span className="text-destructive">*</span></label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="API này dùng để làm gì, Agent gọi khi nào…"
                rows={2}
                className="w-full px-2.5 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-base resize-none"
              />
              {submitAttempted && !description.trim() && <p className="text-xs text-destructive mt-1.5">Bắt buộc nhập mô tả.</p>}
            </div>
          </div>

          {/* Endpoint */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endpoint</p>
            <div className="flex items-center gap-1 flex-wrap">
              {METHODS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`h-8 px-3 rounded-lg text-xs font-bold transition-base ${method === m ? METHOD_CLASS[m] : "bg-surface-muted text-muted-foreground hover:text-foreground"}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div>
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                onBlur={() => setUrlTouched(true)}
                placeholder="https://api.client.com/orders/{order_id}"
                className={`${inputCls} font-mono text-[13px] ${urlTouched && urlError ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}`}
              />
              {urlTouched && urlError && <p className="text-xs text-destructive mt-1.5">Nhập một URL http(s) hợp lệ. Dùng {"{tên}"} cho path param.</p>}
              {submitAttempted && !url.trim() && <p className="text-xs text-destructive mt-1.5">Bắt buộc nhập URL.</p>}
            </div>
          </div>

          {/* Xác thực */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Xác thực</p>
            <div className="grid grid-cols-2 gap-1.5">
              {AUTH_TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => changeAuthType(t)}
                  className={`h-9 px-3 rounded-lg text-sm font-medium border transition-base ${authType === t ? "border-primary bg-primary/5 text-primary" : "border-border bg-white hover:bg-surface-muted"}`}
                >
                  {AUTH_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            {auth.type === "header" && (
              <div className="space-y-2">
                {auth.headers.map((h, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input value={h.key} onChange={e => setAuth({ ...auth, headers: auth.headers.map((x, j) => j === i ? { ...x, key: e.target.value } : x) })} placeholder="Authorization" className={`${inputCls} flex-1`} />
                    <div className="flex-1"><SecretField value={h.value} onChange={v => setAuth({ ...auth, headers: auth.headers.map((x, j) => j === i ? { ...x, value: v } : x) })} placeholder="Bearer ••••••••" /></div>
                    <button type="button" onClick={() => setAuth({ ...auth, headers: auth.headers.filter((_, j) => j !== i) })} className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-destructive transition-base">
                      <HugeiconsIcon icon={Delete01Icon} size={13} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setAuth({ ...auth, headers: [...auth.headers, { key: "", value: "" }] })} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <HugeiconsIcon icon={Add01Icon} size={12} /> Thêm header
                </button>
                <p className="text-xs text-muted-foreground">Ví dụ: Authorization: Bearer &lt;token&gt;, X-API-Key: &lt;key&gt;. Giá trị được ẩn sau khi lưu.</p>
              </div>
            )}
            {auth.type === "none" && <p className="text-xs text-muted-foreground">API này không yêu cầu xác thực.</p>}
          </div>

          {/* Request: Headers */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Headers</p>
            {headers.map((h, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input value={h.key} onChange={e => setHeaderField(i, "key", e.target.value)} placeholder="Content-Type" className={`${inputCls} flex-1`} />
                <input value={h.value} onChange={e => setHeaderField(i, "value", e.target.value)} placeholder="application/json" className={`${inputCls} flex-1`} />
                <button type="button" onClick={() => removeHeader(i)} className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-destructive transition-base">
                  <HugeiconsIcon icon={Delete01Icon} size={13} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setHeaders(hs => [...hs, { key: "", value: "" }])} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <HugeiconsIcon icon={Add01Icon} size={12} /> Thêm header
            </button>
          </div>

          {/* Request: Params */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tham số (query / path / body)</p>
            {params.length > 0 && (
              <div className="grid grid-cols-[1fr_88px_84px_52px_1fr_32px] gap-1.5 px-0.5 text-[11px] font-medium text-muted-foreground">
                <span>Tên</span><span>Kiểu</span><span>Vị trí</span><span className="text-center">B.buộc</span><span>Mô tả</span><span />
              </div>
            )}
            {params.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_88px_84px_52px_1fr_32px] gap-1.5 items-center">
                <input value={p.name} onChange={e => setParamField(i, "name", e.target.value)} placeholder="order_id" className={inputCls} />
                <select value={p.type} onChange={e => setParamField(i, "type", e.target.value as ApiParamType)} className={`${inputCls} px-1.5`}>
                  {PARAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={p.location} onChange={e => setParamField(i, "location", e.target.value as ApiParamLocation)} className={`${inputCls} px-1.5`}>
                  {PARAM_LOCATIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                <input type="checkbox" checked={p.required} onChange={e => setParamField(i, "required", e.target.checked)} className="w-4 h-4 mx-auto accent-primary" />
                <input value={p.description} onChange={e => setParamField(i, "description", e.target.value)} placeholder="Mô tả ngắn…" className={inputCls} />
                <button type="button" onClick={() => removeParam(i)} className="w-8 h-9 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-destructive transition-base">
                  <HugeiconsIcon icon={Delete01Icon} size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setParams(ps => [...ps, { name: "", type: "string", location: "query", required: false, description: "" }])}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <HugeiconsIcon icon={Add01Icon} size={12} /> Thêm tham số
            </button>
          </div>

          {/* Cài đặt */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cài đặt</p>
            <div className="flex items-center gap-2.5">
              <label className="text-sm">Timeout</label>
              <input
                type="number"
                min={1}
                value={timeoutSec}
                onChange={e => setTimeoutSec(Math.max(1, Number(e.target.value) || 0))}
                className="w-20 h-9 px-2.5 rounded-lg border border-border bg-white text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-base"
              />
              <span className="text-sm text-muted-foreground">giây</span>
            </div>
          </div>

          {/* Kiểm thử */}
          <div className="space-y-2.5 rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Kiểm thử</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate max-w-[380px]">{method} {previewUrl(url, params) || "…"}</p>
              </div>
              <button
                type="button"
                onClick={runTest}
                disabled={testing || !url.trim() || urlError}
                className="h-8 px-3.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow text-xs font-medium flex items-center gap-1.5 transition-base disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <HugeiconsIcon icon={testing ? Loading01Icon : PlayCircleIcon} size={13} className={testing ? "animate-spin" : ""} /> Test
              </button>
            </div>
            {testResult && (
              <div className={`rounded-lg border px-3 py-2.5 ${testResult.ok ? "border-[hsl(var(--success))/0.3] bg-[hsl(var(--success-soft))]" : "border-destructive/25 bg-[hsl(var(--destructive-soft))]"}`}>
                <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5">
                  <HugeiconsIcon icon={testResult.ok ? CheckmarkCircle01Icon : Alert01Icon} size={13} className={testResult.ok ? "text-[hsl(var(--success-strong))]" : "text-destructive"} />
                  <span className={testResult.ok ? "text-[hsl(var(--success-strong))]" : "text-destructive"}>{testResult.status} · {testResult.ms}ms</span>
                </div>
                <pre className="text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap font-mono">{testResult.body}</pre>
              </div>
            )}
          </div>
          {!isEditing && (
            <div className="border-t border-border pt-5">
              <AccessScopeSection
                mode={sharingMode} people={people} onModeChange={setSharingMode} onPeopleChange={setPeople}
                submitAttempted={submitAttempted} ownerRow={{ name: CURRENT_USER.name, email: CURRENT_USER.email }} agentOnly={agentOnly}
                copy={resourceAccessCopy("API Tool này")}
                picker={<CustomConnectorMemberPicker value={people} onChange={setPeople} ownerRow={{ name: CURRENT_USER.name, email: CURRENT_USER.email }} />}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border bg-white hover:bg-surface-muted text-sm font-medium transition-base">Hủy</button>
          <button onClick={submit} disabled={!canSubmit && !peopleError} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow text-sm font-medium transition-base disabled:opacity-40 disabled:cursor-not-allowed">
            {isEditing ? "Lưu thay đổi" : "Lưu API Tool"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
