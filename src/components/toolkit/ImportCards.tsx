import { useMemo, useRef, useState } from "react";
import { ArrowDown01Icon, FileUploadIcon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorText, Icon, MethodBadge, SectionCard } from "./parts";
import type { KitForm } from "./model";
import { parseSpec, SAMPLE_OPENAPI, type ImportResult } from "./openapi";

/* ───────────── Import OpenAPI / Swagger ───────────── */

const MAPPING: [string, string][] = [
  ["info.title / info.description", "Tên / mô tả kit"],
  ["servers[0].url", "Base URL"],
  ["apiKey header / bearer", "API key"],
  ["oauth2 authorizationCode", "OAuth 2.1 (Thủ công), điền sẵn các URL"],
  ["paths[p][method]", "Một operation"],
  ["operationId", "Tên snake_case (không có thì method_path)"],
  ["summary + description", "Mô tả cho model"],
  ["path / query params", "Params; header / cookie params bị bỏ qua kèm cảnh báo"],
  ["requestBody application/json properties", "Params in=body, Body kind json"],
  ["$ref", "Được resolve; object lồng nhau thành một param type=object"],
];

function ImportPreview({ result, onCancel, onApply }: { result: ImportResult; onCancel: () => void; onApply: (form: KitForm, count: number) => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(result.operations.map(o => o.op.id)));
  const [server, setServer] = useState(result.servers[0] ?? "");
  const total = result.operations.length;
  const allChecked = selected.size === total && total > 0;
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const apply = () => {
    const ops = result.operations.filter(o => selected.has(o.op.id)).map(o => o.op);
    onApply({
      name: result.name, description: result.description, baseUrl: server, authType: result.authType,
      headers: result.headers, oauth: result.oauth, operations: ops,
    }, ops.length);
  };

  return (
    <SectionCard
      title="Xem trước import"
      actions={<Badge variant="secondary" className="rounded-sm">Đã chọn {selected.size} / {total}</Badge>}
    >
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 text-sm mb-4">
        <div><dt className="text-muted-foreground">Tên kit</dt><dd className="font-medium">{result.name || "—"}</dd></div>
        <div><dt className="text-muted-foreground">Xác thực</dt><dd className="font-medium">{result.authLabel}</dd></div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground mb-1">Base URL</dt>
          {result.servers.length > 1 ? (
            <RadioGroup value={server} onValueChange={setServer} className="gap-1.5">
              {result.servers.map(s => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value={s} />
                  <span className="font-mono text-xs">{s}</span>
                </label>
              ))}
            </RadioGroup>
          ) : (
            <dd className="font-mono text-xs">{server || "—"}</dd>
          )}
        </div>
      </dl>
      {result.warnings.length > 0 && (
        <div className="mb-4 rounded-md bg-muted px-3 py-2.5 text-xs text-muted-foreground space-y-1">
          {result.warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked ? true : selected.size ? "indeterminate" : false}
                  onCheckedChange={v => setSelected(v ? new Set(result.operations.map(o => o.op.id)) : new Set())}
                  aria-label="Chọn tất cả"
                />
              </TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Tên tool</TableHead>
              <TableHead>Mô tả</TableHead>
              <TableHead className="text-right">Params</TableHead>
              <TableHead>Cảnh báo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.operations.map(({ op, paramsCount, warnings }) => (
              <TableRow key={op.id} data-state={selected.has(op.id) ? "selected" : undefined}>
                <TableCell><Checkbox checked={selected.has(op.id)} onCheckedChange={() => toggle(op.id)} aria-label={`Chọn ${op.name}`} /></TableCell>
                <TableCell><MethodBadge method={op.method} /></TableCell>
                <TableCell className="font-mono text-xs">{op.path}</TableCell>
                <TableCell className="font-mono text-xs">{op.name}</TableCell>
                <TableCell className="max-w-[260px]"><span className="line-clamp-2 text-xs text-muted-foreground">{op.description || "—"}</span></TableCell>
                <TableCell className="text-right tabular-nums">{paramsCount}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{warnings.length ? warnings.map((w, i) => <p key={i}>{w}</p>) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Hủy</Button>
        <Button type="button" onClick={apply} disabled={!selected.size}>Tiếp tục với {selected.size} operation</Button>
      </div>
    </SectionCard>
  );
}

export function OpenApiCard({ onApply, onSkip }: { onApply: (form: KitForm, count: number) => void; onSkip?: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const analyse = (content = text) => {
    try { setResult(parseSpec(content)); setError(undefined); }
    catch (e) { setResult(null); setError((e as Error).message); }
  };
  const readFile = async (file?: File) => {
    if (!file) return;
    const content = await file.text();
    setText(content);
    analyse(content);
  };
  const resultKey = useMemo(() => (result ? Math.random().toString(36) : ""), [result]);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Import OpenAPI 3 / Swagger 2"
        subtitle="Hỗ trợ file JSON hoặc YAML. Mỗi path + method thành một operation."
        actions={onSkip && (
          <>
            <span className="hidden md:inline text-sm text-muted-foreground">Không có file?</span>
            <Button type="button" variant="outline" size="sm" onClick={onSkip}>
              <Icon icon={PencilEdit02Icon} /> Nhập tay
            </Button>
          </>
        )}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); void readFile(e.dataTransfer.files[0]); }}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dragging ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
        >
          <Icon icon={FileUploadIcon} size={24} className="text-muted-foreground" />
          <p className="text-sm">Kéo thả file vào đây hoặc bấm để chọn</p>
          <p className="text-xs text-muted-foreground">.json, .yaml, .yml</p>
          <input ref={fileRef} type="file" accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml" className="hidden" onChange={e => void readFile(e.target.files?.[0])} />
        </div>
        <div className="mt-4">
          <label htmlFor="openapi-text" className="text-sm font-medium">Hoặc dán nội dung file</label>
          <Textarea id="openapi-text" value={text} onChange={e => { setText(e.target.value); setError(undefined); }} rows={10} spellCheck={false} className="mt-1.5 font-mono text-xs leading-relaxed" aria-invalid={!!error} />
          <ErrorText>{error}</ErrorText>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => analyse()} disabled={!text.trim()}>Phân tích</Button>
          <Button type="button" variant="outline" onClick={() => { setText(SAMPLE_OPENAPI); analyse(SAMPLE_OPENAPI); }}>Dùng file mẫu</Button>
        </div>
        <Collapsible open={mappingOpen} onOpenChange={setMappingOpen} className="mt-5 rounded-md border">
          <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-md hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Quy tắc map từ file sang form
            <Icon icon={ArrowDown01Icon} className={`text-muted-foreground transition-transform ${mappingOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3">
            <Table>
              <TableHeader><TableRow><TableHead>Trong file</TableHead><TableHead>Trong form</TableHead></TableRow></TableHeader>
              <TableBody>
                {MAPPING.map(([a, b]) => (
                  <TableRow key={a}><TableCell className="font-mono text-xs">{a}</TableCell><TableCell className="text-sm">{b}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CollapsibleContent>
        </Collapsible>
      </SectionCard>

      {result && <ImportPreview key={resultKey} result={result} onCancel={() => setResult(null)} onApply={onApply} />}
    </div>
  );
}
