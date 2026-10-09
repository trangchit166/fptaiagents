import {
  ArrowRight01Icon, Copy01Icon, Delete02Icon, Add01Icon, CheckmarkCircle02Icon, InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ErrorText, Eyebrow, FieldLabel, Hint, Icon, JsonField, MethodBadge, SectionCard, SmallBadge, useField,
} from "./parts";
import {
  METHODS, joinUrl, missingPathParams, pretty, uid,
  withPathParamsAdded, type HttpMethod, type Issue, type Operation,
} from "./model";

export interface OpStatus { errors: number; visibleErrors: number; warnings: Issue[] }

function TextField({ id, label, required, value, onChange, fieldKey, mono, placeholder, maxLength, hint, onBlurExtra }: {
  id: string; label: string; required?: boolean; value: string; onChange: (v: string) => void; fieldKey: string;
  mono?: boolean; placeholder?: string; maxLength?: number; hint?: React.ReactNode; onBlurExtra?: () => void;
}) {
  const f = useField(fieldKey);
  return (
    <div>
      <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
      <Input id={id} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength}
        className={mono ? "font-mono" : ""} onBlur={() => { f.onBlur(); onBlurExtra?.(); }} data-field={fieldKey} aria-invalid={f["aria-invalid"]} />
      {hint && <Hint>{hint}</Hint>}
      <ErrorText>{f.error}</ErrorText>
    </div>
  );
}

function OperationBody({ op, kitKey, baseUrl, onChange }: { op: Operation; kitKey: string; baseUrl: string; onChange: (o: Operation) => void }) {
  const k = (f: string) => `op.${op.id}.${f}`;
  const set = (p: Partial<Operation>) => onChange({ ...op, ...p });
  const desc = useField(k("description"));
  const descLen = op.description.trim().length;
  const missing = missingPathParams(op);
  const fmt = (field: "paramsJson" | "responseJson") => {
    try { set({ [field]: pretty(JSON.parse(op[field])) } as Partial<Operation>); } catch { /* leave as is; the error shows below */ }
  };

  return (
    <div className="border-t px-4 py-5 sm:px-5 space-y-7">
      <div>
        <Eyebrow>Định danh</Eyebrow>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id={`${op.id}-name`} label="Tên (name)" required mono maxLength={48} value={op.name} fieldKey={k("name")}
            onChange={v => set({ name: v })} placeholder="get_order"
            hint={<>Model gọi tool bằng tên <code className="ml-1 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{kitKey}__{op.name || "<name>"}</code></>}
          />
          <TextField id={`${op.id}-display`} label="Tên hiển thị" value={op.displayName} fieldKey={k("displayName")} onChange={v => set({ displayName: v })} hint="Nhãn trên UI, model không dùng." />
          <div className="md:col-span-2">
            <FieldLabel htmlFor={`${op.id}-desc`} required>Mô tả cho model</FieldLabel>
            <Textarea id={`${op.id}-desc`} value={op.description} onChange={e => set({ description: e.target.value })} rows={3}
              onBlur={desc.onBlur} data-field={k("description")} aria-invalid={desc["aria-invalid"]} />
            <div className="flex items-start justify-between gap-3">
              <Hint>Trường quan trọng nhất: khi nào dùng, cần input gì, trả về gì.</Hint>
              <p className={`text-xs mt-1.5 shrink-0 tabular-nums ${descLen < 20 ? "text-destructive" : "text-muted-foreground"}`}>
                {descLen < 20 ? `${descLen} ký tự, cần tối thiểu 20` : `${descLen} ký tự`}
              </p>
            </div>
            <ErrorText>{desc.error}</ErrorText>
          </div>
        </div>
      </div>

      <div>
        <Eyebrow>Request</Eyebrow>
        <div className="grid gap-4 grid-cols-[140px_minmax(0,1fr)]">
          <div>
            <FieldLabel htmlFor={`${op.id}-method`}>Method</FieldLabel>
            <Select value={op.method} onValueChange={v => set({ method: v as HttpMethod })}>
              <SelectTrigger id={`${op.id}-method`} className="font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map(m => <SelectItem key={m} value={m} className="font-mono">{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <TextField
            id={`${op.id}-path`} label="Path" required mono value={op.path} fieldKey={k("path")} placeholder="/orders/{order_id}"
            onChange={v => set({ path: v })} onBlurExtra={() => onChange(withPathParamsAdded(op))}
            hint={<span className="font-mono break-all">{joinUrl(baseUrl || "https://…", op.path || "/")}</span>}
          />
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <FieldLabel>Static query</FieldLabel>
            <Button type="button" variant="ghost" size="sm" onClick={() => set({ staticQuery: [...op.staticQuery, { id: uid("q"), key: "", value: "" }] })}>
              <Icon icon={Add01Icon} /> Thêm
            </Button>
          </div>
          {op.staticQuery.length === 0 ? (
            <p className="text-sm text-muted-foreground">Cặp key/value cố định luôn gửi kèm, ví dụ format=json.</p>
          ) : (
            <div className="space-y-2">
              {op.staticQuery.map(q => (
                <div key={q.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                  <Input value={q.key} aria-label="Query key" placeholder="format" className="font-mono" onChange={e => set({ staticQuery: op.staticQuery.map(x => (x.id === q.id ? { ...x, key: e.target.value } : x)) })} />
                  <Input value={q.value} aria-label="Query value" placeholder="json" className="font-mono" onChange={e => set({ staticQuery: op.staticQuery.map(x => (x.id === q.id ? { ...x, value: e.target.value } : x)) })} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Xóa query" className="text-muted-foreground hover:text-destructive" onClick={() => set({ staticQuery: op.staticQuery.filter(x => x.id !== q.id) })}>
                    <Icon icon={Delete02Icon} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Icon icon={InformationCircleIcon} size={14} className="mt-px shrink-0" />
          Không có header riêng cho từng operation. Request chỉ mang header của credential cùng Accept / Content-Type.
        </p>
      </div>

      <div>
        <Eyebrow>Parameters · Response</Eyebrow>
        {missing.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm">
            <span>Path có <code className="font-mono">{`{${missing.join("}, {")}}`}</code> chưa có trong Parameters.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(withPathParamsAdded(op))}>Thêm vào Parameters</Button>
          </div>
        )}
        <div className="space-y-5">
          <JsonField
            id={`${op.id}-params`} label="Parameters (JSON)" value={op.paramsJson} fieldKey={k("params")} rows={8}
            onChange={v => set({ paramsJson: v })} onFormat={() => fmt("paramsJson")}
            placeholder='[{"name": "order_id", "in": "path", "type": "string", "required": true, "description": "…"}]'
            hint={<>Mảng các parameter: <code className="font-mono">name</code>, <code className="font-mono">in</code> (path | query | body), <code className="font-mono">type</code> (string | integer | number | boolean | array | object), <code className="font-mono">required</code>, <code className="font-mono">description</code>, <code className="font-mono">default</code>, <code className="font-mono">enum</code>. Parameter <code className="font-mono">in: body</code> được gửi trong body JSON. Để trống thì hệ thống tự thêm một parameter <code className="font-mono">query: string</code>.</>}
          />
          <JsonField
            id={`${op.id}-response`} label="Response (JSON)" value={op.responseJson} fieldKey={k("response")} rows={2}
            onChange={v => set({ responseJson: v })} onFormat={() => fmt("responseJson")}
            placeholder='{"kind": "json"}'
            hint={<><code className="font-mono">{'{"kind": "json"}'}</code> hoặc <code className="font-mono">{'{"kind": "text"}'}</code>. Trả nguyên body về cho model, cắt ở 1 MiB.</>}
          />
        </div>
      </div>
    </div>
  );
}

function StatusMark({ status }: { status: OpStatus }) {
  if (status.visibleErrors > 0) return <Badge variant="destructive" className="rounded-sm h-5 px-1.5 text-[11px]">{status.visibleErrors} lỗi</Badge>;
  if (status.errors > 0) return null;
  if (status.warnings.length > 0) return <SmallBadge>{status.warnings.length} cảnh báo</SmallBadge>;
  return <Icon icon={CheckmarkCircle02Icon} className="text-success" />;
}

export default function OperationsCard({ ops, kitKey, baseUrl, expanded, statusFor, onToggle, onChange, onAdd, onDuplicate, onDelete }: {
  ops: Operation[]; kitKey: string; baseUrl: string; expanded: Set<string>;
  statusFor: (opId: string) => OpStatus;
  onToggle: (id: string) => void; onChange: (op: Operation) => void; onAdd: () => void;
  onDuplicate: (id: string) => void; onDelete: (id: string) => void;
}) {
  return (
    <SectionCard
      id="operations"
      title="Operations"
      subtitle="Mỗi operation lưu thành một dòng tool_registries và là một tool agent gọi được."
      actions={<>
        <span className="text-sm text-muted-foreground tabular-nums">{ops.length} operation</span>
        <Button type="button" variant="secondary" size="sm" onClick={onAdd}><Icon icon={Add01Icon} /> Thêm operation</Button>
      </>}
    >
      {ops.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Chưa có operation nào.</p>
      ) : (
        <div className="space-y-3">
          {ops.map(op => {
            const open = expanded.has(op.id);
            const status = statusFor(op.id);
            const warnings = status.warnings;
            return (
              <div key={op.id} className="rounded-lg border" data-op={op.id}>
                <div className="flex items-center gap-2 pr-2">
                  <button
                    type="button"
                    onClick={() => onToggle(op.id)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon icon={ArrowRight01Icon} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
                    <MethodBadge method={op.method} />
                    <span className="font-mono text-sm truncate">{op.path || "/"}</span>
                    <span className="text-sm text-muted-foreground truncate">{op.name}</span>
                  </button>
                  <span className="shrink-0 flex items-center" title={warnings.map(w => w.message).join("\n") || undefined}><StatusMark status={status} /></span>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" aria-label={`Nhân bản ${op.name || "operation"}`} onClick={() => onDuplicate(op.id)}>
                    <Icon icon={Copy01Icon} />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Xóa ${op.name || "operation"}`} onClick={() => onDelete(op.id)}>
                    <Icon icon={Delete02Icon} />
                  </Button>
                </div>
                {open && (
                  <>
                    {warnings.length > 0 && (
                      <div className="mx-4 sm:mx-5 mb-1 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                        {warnings.map((w, i) => <p key={i}>{w.message}</p>)}
                      </div>
                    )}
                    <OperationBody op={op} kitKey={kitKey} baseUrl={baseUrl} onChange={onChange} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

