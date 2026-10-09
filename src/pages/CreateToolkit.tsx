import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PencilEdit02Icon, SourceCodeIcon, Upload04Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ErrorText, FieldContext, FieldLabel, Hint, Icon, MethodBadge, SectionCard, SmallBadge, useField,
} from "@/components/toolkit/parts";
import AuthCard from "@/components/toolkit/AuthCard";
import OperationsCard, { type OpStatus } from "@/components/toolkit/OperationsCard";
import { OpenApiCard, PasteJsonCard } from "@/components/toolkit/ImportCards";
import {
  buildPayload, emptyForm, emptyOperation, existingKitNames, isOAuth, kitKey, sampleForm, uid, validate,
  type KitForm, type KitPayload, type Operation,
} from "@/components/toolkit/model";

type Mode = "manual" | "json" | "openapi";

function initial() {
  const form = sampleForm();
  const getOrder = form.operations.find(o => o.name === "get_order");
  return { form, expanded: new Set(getOrder ? [getOrder.id] : []) };
}

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

/** "Tạo tool kit" — declare a list of REST operations; each one becomes a tool an agent can call. */
export default function CreateToolkit() {
  const [mode, setMode] = useState<Mode>("manual");
  const [{ form, expanded }, setState] = useState(initial);
  const [isSample, setIsSample] = useState(true);
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

  const setForm = (fn: (f: KitForm) => KitForm) => { setState(s => ({ ...s, form: fn(s.form) })); setIsSample(false); };
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

  const applyImported = (next: KitForm, message: string) => {
    reset(next);
    setIsSample(false);
    setMode("manual");
    toast.success(message);
  };

  return (
    <FieldContext.Provider value={fieldCtx}>
      <div className="min-h-screen bg-muted/50">
        <div className="px-4 md:px-8 py-6 space-y-5">
          <header className="space-y-3">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink asChild><Link to="/connectors">Connectors</Link></BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbLink asChild><Link to="/connectors?section=custom">Custom</Link></BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbPage>Tạo tool kit</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">Tạo tool kit</h1>
                  {isSample && <Badge variant="secondary" className="rounded-sm font-medium">Dữ liệu mẫu</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Khai báo danh sách REST API. Mỗi operation thành một tool mà agent gọi được, tên dạng <code className="font-mono text-foreground">&lt;key&gt;__&lt;tên op&gt;</code>
                </p>
              </div>
              {mode === "manual" && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button type="button" variant="ghost" onClick={() => { reset(emptyForm()); setIsSample(false); }}>Xóa form</Button>
                  <Button type="button" variant="outline" onClick={() => { const s = initial(); reset(s.form, [...s.expanded]); setIsSample(true); }}>Nạp lại mẫu</Button>
                  <Button type="button" onClick={save}><Icon icon={Tick02Icon} /> Tạo tool kit</Button>
                </div>
              )}
            </div>
          </header>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={mode} onValueChange={v => setMode(v as Mode)}>
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="manual" className="gap-1.5"><Icon icon={PencilEdit02Icon} size={15} /> Nhập tay</TabsTrigger>
                <TabsTrigger value="json" className="gap-1.5"><Icon icon={SourceCodeIcon} size={15} /> Dán JSON</TabsTrigger>
                <TabsTrigger value="openapi" className="gap-1.5"><Icon icon={Upload04Icon} size={15} /> Import OpenAPI / Swagger</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-xs text-muted-foreground">Import xong vẫn quay về đây để chỉnh và lưu.</p>
          </div>

          {mode === "manual" && (
            <div className="space-y-4">
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
            </div>
          )}
          {mode === "json" && <PasteJsonCard onApply={f => applyImported(f, "Đã nạp payload vào form.")} />}
          {mode === "openapi" && <OpenApiCard onApply={(f, n) => applyImported(f, `Đã đưa ${n} operation vào form.`)} />}
        </div>
      </div>
      {success && <SuccessDialog payload={success} kitKeyValue={kitKey(success.name)} onClose={() => setSuccess(null)} />}
    </FieldContext.Provider>
  );
}
