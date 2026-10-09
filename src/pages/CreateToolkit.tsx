import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PencilEdit02Icon, Upload04Icon, Tick02Icon, ArrowLeft01Icon, ApiIcon } from "@hugeicons/core-free-icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ErrorText, FieldContext, FieldLabel, Hint, Icon, MethodBadge, SectionCard, SmallBadge, useField,
} from "@/components/toolkit/parts";
import AuthCard from "@/components/toolkit/AuthCard";
import OperationsCard, { type OpStatus } from "@/components/toolkit/OperationsCard";
import { OpenApiCard } from "@/components/toolkit/ImportCards";
import {
  buildPayload, emptyForm, emptyOperation, existingKitNames, isOAuth, kitKey, uid, validate,
  type KitForm, type KitPayload, type Operation,
} from "@/components/toolkit/model";

type Step = 1 | 2;


function KitInfoCard({ form, set }: { form: KitForm; set: (p: Partial<KitForm>) => void }) {
  const name = useField("name");
  const base = useField("baseUrl");
  const key = kitKey(form.name);
  return (
    <SectionCard title="Thông tin kit" subtitle="Model không đọc mô tả kit, chỉ đọc mô tả từng operation.">
      <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor="kit-name" required>Tên tool kit</FieldLabel>
          <Input id="kit-name" value={form.name} maxLength={80} onChange={e => set({ name: e.target.value })}
            onBlur={name.onBlur} data-field="name" aria-invalid={name["aria-invalid"]} placeholder="Order Service" />
          <Hint>1–80 ký tự, không trùng trong workspace.</Hint>
          <ErrorText>{name.error}</ErrorText>
        </div>
        <div>
          <FieldLabel htmlFor="kit-key" badge={<SmallBadge>Server sinh</SmallBadge>}>Key</FieldLabel>
          <div id="kit-key" aria-readonly="true" className="flex h-10 items-center rounded-md border bg-muted px-3 font-mono text-sm text-muted-foreground truncate">
            {key === "api-" ? "api-…" : key}
          </div>
          <Hint>Tiền tố tên tool mà model thấy: <code className="font-mono">&lt;key&gt;__&lt;tên op&gt;</code>.</Hint>
        </div>
        <div className="md:col-span-2">
          <FieldLabel htmlFor="kit-desc" badge={<SmallBadge>Nên có</SmallBadge>}>Mô tả</FieldLabel>
          <Textarea id="kit-desc" value={form.description} onChange={e => set({ description: e.target.value })} rows={2} />
          <Hint>Hiển thị cho người dùng khi chọn connector.</Hint>
        </div>
        <div className="md:col-span-2">
          <FieldLabel htmlFor="kit-base" required>Base URL</FieldLabel>
          <Input id="kit-base" value={form.baseUrl} onChange={e => set({ baseUrl: e.target.value })} className="font-mono"
            onBlur={base.onBlur} data-field="baseUrl" aria-invalid={base["aria-invalid"]} placeholder="https://api.example.com/v1" />
          <Hint>Bắt buộc https://, không chứa query hay fragment. Mọi path của operation được nối vào sau.</Hint>
          <ErrorText>{base.error}</ErrorText>
        </div>
      </div>
    </SectionCard>
  );
}

function SuccessDialog({ payload, kitKeyValue, onClose }: { payload: KitPayload; kitKeyValue: string; onClose: () => void }) {
  const oauth = payload.authType === "oauth2";
  const ops = payload.operations ?? [];
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[520px] rounded-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
            Đã tạo tool kit "{payload.name}" <SmallBadge>Bản mô phỏng</SmallBadge>
          </DialogTitle>
          <DialogDescription>
            {oauth
              ? "Tool sẽ được lấy từ server sau khi người dùng kết nối và cấp quyền."
              : <>{ops.length} tool sẵn sàng gắn vào agent. Key <code className="font-mono text-foreground">{kitKeyValue}</code>.</>}
          </DialogDescription>
        </DialogHeader>
        {!oauth && ops.length > 0 && (
          <ul className="max-h-64 overflow-y-auto rounded-md border divide-y">
            {ops.map(o => (
              <li key={o.name} className="flex items-center gap-2.5 px-3 py-2">
                <MethodBadge method={o.method} />
                <span className="font-mono text-sm truncate">{kitKeyValue}__{o.name}</span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" onClick={onClose}>Xong</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STEPS: { n: Step; title: string; sub: string }[] = [
  { n: 1, title: "Import OpenAPI / Swagger", sub: "Không có file thì chuyển sang nhập tay" },
  { n: 2, title: "Thông tin kit", sub: "Kiểm tra, bổ sung rồi lưu" },
];

/** Two-step header: the current step uses primary, a finished step shows a check. */
function Stepper({ step, onStep }: { step: Step; onStep: (s: Step) => void }) {
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4" aria-label="Các bước">
      {STEPS.map((s, i) => {
        const active = s.n === step;
        const done = s.n < step;
        return (
          <li key={s.n} className="flex items-center gap-3 sm:gap-4 min-w-0">
            {i > 0 && <span className="hidden sm:block h-px w-10 bg-border shrink-0" aria-hidden="true" />}
            <button
              type="button"
              onClick={() => onStep(s.n)}
              aria-current={active ? "step" : undefined}
              className="flex items-center gap-3 rounded-md text-left min-w-0 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-medium tabular-nums ${
                active ? "border-primary bg-primary text-primary-foreground" : done ? "border-primary text-primary" : "text-muted-foreground"
              }`}>
                {done ? <Icon icon={Tick02Icon} /> : s.n}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>Bước {s.n}: {s.title}</span>
                <span className="block text-xs text-muted-foreground">{s.sub}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** "Tạo tool kit" — declare a list of REST operations; each one becomes a tool an agent can call. */
export default function CreateToolkit() {
  const navigate = useNavigate();
  // Step 1: import an OpenAPI / Swagger file (or skip). Step 2: kit info, auth and operations —
  // prefilled from the file when one was imported — then "Tạo tool kit".
  const [step, setStep] = useState<Step>(1);
  const [{ form, expanded }, setState] = useState(() => ({ form: emptyForm(), expanded: new Set<string>() }));
  const [importedFrom, setImportedFrom] = useState<{ name: string; count: number } | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [created, setCreated] = useState<string[]>([]);
  const [success, setSuccess] = useState<KitPayload | null>(null);

  const validation = useMemo(() => validate(form, [...existingKitNames, ...created]), [form, created]);
  const visibleError = (k: string) => (submitted || touched.has(k) ? validation.errors.get(k) : undefined);
  const fieldCtx = useMemo(() => ({
    error: visibleError,
    touch: (k: string) => setTouched(t => (t.has(k) ? t : new Set(t).add(k))),
  }), [validation, touched, submitted]); // eslint-disable-line react-hooks/exhaustive-deps

  const setForm = (fn: (f: KitForm) => KitForm) => setState(s => ({ ...s, form: fn(s.form) }));
  const set = (p: Partial<KitForm>) => setForm(f => ({ ...f, ...p }));
  const setExpanded = (fn: (e: Set<string>) => Set<string>) => setState(s => ({ ...s, expanded: fn(s.expanded) }));
  const reset = (next: KitForm, open: string[] = []) => {
    setState({ form: next, expanded: new Set(open) });
    setTouched(new Set());
    setSubmitted(false);
  };

  const key = kitKey(form.name);
  const showOps = !isOAuth(form.authType);

  const statusFor = (opId: string): OpStatus => {
    const prefix = `op.${opId}.`;
    const keys = [...validation.errors.keys()].filter(k => k.startsWith(prefix));
    return {
      errors: keys.length,
      visibleErrors: keys.filter(k => visibleError(k)).length,
      warnings: validation.warnings.filter(w => w.opId === opId),
    };
  };

  const focusField = (k: string) => {
    if (k.startsWith("op.")) {
      const opId = k.split(".")[1];
      setExpanded(e => new Set(e).add(opId));
    }
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${k}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
    }, 80);
  };

  const save = () => {
    setSubmitted(true);
    const errs = [...validation.errors.keys()];
    if (errs.length) {
      toast.error(`Còn ${errs.length} lỗi cần sửa trước khi lưu.`);
      focusField(errs[0]);
      return;
    }
    const payload = buildPayload(form);
    console.log("POST /console/v1/workspaces/{ws}/api-connectors", payload);
    setCreated(c => [...c, form.name.trim()]);
    setSuccess(payload);
  };

  const updateOp = (op: Operation) => setForm(f => ({ ...f, operations: f.operations.map(o => (o.id === op.id ? op : o)) }));
  const addOp = () => {
    const op = emptyOperation();
    setForm(f => ({ ...f, operations: [...f.operations, op] }));
    setExpanded(e => new Set(e).add(op.id));
    window.setTimeout(() => document.getElementById(`${op.id}-name`)?.focus(), 80);
  };
  const duplicateOp = (id: string) => {
    const src = form.operations.find(o => o.id === id);
    if (!src) return;
    const copy: Operation = {
      ...src, id: uid("op"),
      name: `${src.name}_copy`.slice(0, 48),
      staticQuery: src.staticQuery.map(q => ({ ...q, id: uid("q") })),
    };
    setForm(f => {
      const i = f.operations.findIndex(o => o.id === id);
      const ops = [...f.operations];
      ops.splice(i + 1, 0, copy);
      return { ...f, operations: ops };
    });
    setExpanded(e => new Set(e).add(copy.id));
  };
  const deleteOp = (id: string) => {
    const index = form.operations.findIndex(o => o.id === id);
    const op = form.operations[index];
    if (!op) return;
    setForm(f => ({ ...f, operations: f.operations.filter(o => o.id !== id) }));
    toast(`Đã xóa operation ${op.name || op.path || ""}`.trim(), {
      action: {
        label: "Hoàn tác",
        onClick: () => setForm(f => {
          const ops = [...f.operations];
          ops.splice(Math.min(index, ops.length), 0, op);
          return { ...f, operations: ops };
        }),
      },
    });
  };

  const goToStep2 = () => { setStep(2); window.scrollTo({ top: 0 }); };
  const applyImported = (next: KitForm, count: number) => {
    reset(next, next.operations[0] ? [next.operations[0].id] : []);
    setImportedFrom({ name: next.name || "file", count });
    goToStep2();
    toast.success(`Đã trích ${count} operation từ file.`);
  };
  const skipImport = () => { setImportedFrom(null); goToStep2(); };

  return (
    <FieldContext.Provider value={fieldCtx}>
      <div className="min-h-screen bg-background">
        {/* Top bar — same pattern as the Agent detail page: back, parent link / icon tile + title, actions on the right. */}
        <div className="sticky top-0 z-20 h-14 border-b bg-surface flex items-center gap-3 px-4">
          <Button type="button" variant="ghost" size="icon" aria-label="Quay lại Custom Connectors" onClick={() => navigate("/connectors?section=custom")} className="h-8 w-8 shrink-0 text-muted-foreground">
            <Icon icon={ArrowLeft01Icon} />
          </Button>
          <Link to="/connectors?section=custom" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">Connectors</Link>
          <span className="hidden sm:inline text-sm text-muted-foreground/50 shrink-0" aria-hidden="true">/</span>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-md bg-muted border flex items-center justify-center shrink-0 text-muted-foreground">
              <Icon icon={ApiIcon} />
            </div>
            <h1 className="font-semibold text-sm truncate">Tạo tool kit</h1>
          </div>
          {step === 2 && (
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <Button type="button" variant="ghost" size="sm" onClick={() => { reset(emptyForm()); setImportedFrom(null); }}>Xóa form</Button>
              <Button type="button" size="sm" onClick={save}><Icon icon={Tick02Icon} /> Tạo tool kit</Button>
            </div>
          )}
        </div>

        <div className="px-4 md:px-8 py-6 space-y-5">
          <p className="text-sm text-muted-foreground">
            Khai báo danh sách REST API. Mỗi operation thành một tool mà agent gọi được, tên dạng <code className="font-mono text-foreground">&lt;key&gt;__&lt;tên op&gt;</code>
          </p>

          <Stepper step={step} onStep={s => (s === 1 ? setStep(1) : goToStep2())} />

          {step === 1 && (
            <div className="space-y-4">
              <OpenApiCard onApply={applyImported} onSkip={skipImport} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {importedFrom && (
                <div className="flex items-start gap-2 rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
                  <Icon icon={Upload04Icon} className="mt-0.5 shrink-0" />
                  <span>Đã điền sẵn từ file <span className="font-medium text-foreground">{importedFrom.name}</span>: {importedFrom.count} operation. Kiểm tra lại rồi bấm "Tạo tool kit".</span>
                </div>
              )}
              <KitInfoCard form={form} set={set} />
              <AuthCard form={form} set={set} />
              {showOps && (
                <OperationsCard
                  ops={form.operations}
                  kitKey={key}
                  baseUrl={form.baseUrl.trim()}
                  expanded={expanded}
                  statusFor={statusFor}
                  onToggle={id => setExpanded(e => { const n = new Set(e); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                  onChange={updateOp}
                  onAdd={addOp}
                  onDuplicate={duplicateOp}
                  onDelete={deleteOp}
                />
              )}
              <div className="flex items-center justify-between gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  <Icon icon={ArrowLeft01Icon} /> Quay lại bước Import
                </Button>
                <Button type="button" onClick={save}><Icon icon={Tick02Icon} /> Tạo tool kit</Button>
              </div>
            </div>
          )}
        </div>
      </div>
      {success && <SuccessDialog payload={success} kitKeyValue={kitKey(success.name)} onClose={() => setSuccess(null)} />}
    </FieldContext.Provider>
  );
}
