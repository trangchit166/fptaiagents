// "Tạo tool kit" — form model, sample data, validation and the create payload.
// A tool kit is a list of REST operations on one base URL; each operation becomes one tool the
// agent can call, named `<key>__<op name>`. No backend: the page keeps this in React state.

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
export type AuthType = "none" | "api_key" | "oauth_auto" | "oauth_manual";
export const isOAuth = (t: AuthType) => t === "oauth_auto" || t === "oauth_manual";

export interface KV { id: string; key: string; value: string }

export interface Operation {
  id: string;
  name: string;
  displayName: string;
  description: string;
  method: HttpMethod;
  path: string;
  staticQuery: KV[];
  /** Raw JSON text the Builder edits; parsed by parseParams/parseBody/parseResponse. */
  paramsJson: string;
  bodyJson: string;
  responseJson: string;
}

export interface OAuthFields {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
}

export interface KitForm {
  name: string;
  description: string;
  baseUrl: string;
  authType: AuthType;
  headers: KV[];
  oauth: OAuthFields;
  operations: Operation[];
}

export type ParamIn = "path" | "query" | "body";
export type ParamType = "string" | "integer" | "number" | "boolean" | "array" | "object";
export interface Param {
  name: string;
  in: ParamIn;
  type: ParamType;
  required?: boolean;
  description?: string;
  default?: unknown;
  enum?: unknown[];
}
export type Body =
  | { kind: "json" | "form"; shape: Record<string, unknown> }
  | { kind: "text"; from: string };
export type ResponseKind = "json" | "text";

/** Kit names already taken in the workspace (mock) — plus anything created in this session. */
export const existingKitNames = ["Jira Cloud", "HubSpot CRM", "Google Drive"];

let seq = 0;
export const uid = (p = "id") => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/* ───────────── key / naming ───────────── */

export function slugify(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
export const kitKey = (name: string) => `api-${slugify(name)}`;

export const OP_NAME_RE = /^[a-z][a-z0-9_]{0,47}$/;
export function toSnake(s: string): string {
  let out = s
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/_+/g, "_");
  if (!out) out = "op";
  if (!/^[a-z]/.test(out)) out = `op_${out}`;
  return out.slice(0, 48).replace(/_+$/, "");
}

export const pathVars = (path: string) => Array.from(path.matchAll(/\{([^{}]+)\}/g), m => m[1]);
export const joinUrl = (base: string, path: string) => `${base.replace(/\/+$/, "")}${path}`;

export const RISK: Record<HttpMethod, "read" | "write" | "destructive"> = {
  GET: "read", POST: "write", PUT: "write", PATCH: "write", DELETE: "destructive",
};
export const methodAllowsBody = (m: HttpMethod) => m !== "GET" && m !== "DELETE";

/* ───────────── JSON fields ───────────── */

type Parsed<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };

function parseJson(text: string): Parsed<unknown> {
  try { return { ok: true, value: JSON.parse(text) }; }
  catch (e) { return { ok: false, error: `JSON không hợp lệ: ${(e as Error).message}` }; }
}

const PARAM_INS: ParamIn[] = ["path", "query", "body"];
const PARAM_TYPES: ParamType[] = ["string", "integer", "number", "boolean", "array", "object"];

/** Empty means "no params declared" (the system then adds a single `query: string` param). */
export function parseParams(text: string): Parsed<Param[]> {
  if (!text.trim()) return { ok: true, value: [] };
  const j = parseJson(text);
  if (j.ok === false) return { ok: false, error: j.error };
  if (!Array.isArray(j.value)) return { ok: false, error: "Parameters phải là một mảng JSON." };
  const out: Param[] = [];
  for (let i = 0; i < j.value.length; i++) {
    const p = j.value[i] as Record<string, unknown>;
    const at = `Parameters[${i}]`;
    if (!p || typeof p !== "object" || Array.isArray(p)) return { ok: false, error: `${at} phải là một object.` };
    if (typeof p.name !== "string" || !p.name.trim()) return { ok: false, error: `${at}.name là chuỗi bắt buộc.` };
    if (!PARAM_INS.includes(p.in as ParamIn)) return { ok: false, error: `${at}.in phải là path, query hoặc body.` };
    if (!PARAM_TYPES.includes(p.type as ParamType)) return { ok: false, error: `${at}.type phải là ${PARAM_TYPES.join(", ")}.` };
    if (p.required !== undefined && typeof p.required !== "boolean") return { ok: false, error: `${at}.required phải là true/false.` };
    if (p.description !== undefined && typeof p.description !== "string") return { ok: false, error: `${at}.description phải là chuỗi.` };
    if (p.enum !== undefined && !Array.isArray(p.enum)) return { ok: false, error: `${at}.enum phải là một mảng.` };
    out.push(p as unknown as Param);
  }
  return { ok: true, value: out };
}

/** Empty means the operation sends no body. */
export function parseBody(text: string): Parsed<Body | null> {
  if (!text.trim()) return { ok: true, value: null };
  const j = parseJson(text);
  if (j.ok === false) return { ok: false, error: j.error };
  const b = j.value as Record<string, unknown>;
  if (!b || typeof b !== "object" || Array.isArray(b)) return { ok: false, error: "Body phải là một object JSON." };
  if (b.kind === "json" || b.kind === "form") {
    if (!b.shape || typeof b.shape !== "object" || Array.isArray(b.shape)) return { ok: false, error: `Body kind "${b.kind}" cần "shape" là một object.` };
    return { ok: true, value: { kind: b.kind, shape: b.shape as Record<string, unknown> } };
  }
  if (b.kind === "text") {
    if (typeof b.from !== "string" || !b.from.trim()) return { ok: false, error: 'Body kind "text" cần "from" là tên một param.' };
    return { ok: true, value: { kind: "text", from: b.from } };
  }
  return { ok: false, error: 'Body.kind phải là "json", "form" hoặc "text".' };
}

/** Empty means json. */
export function parseResponse(text: string): Parsed<ResponseKind> {
  if (!text.trim()) return { ok: true, value: "json" };
  const j = parseJson(text);
  if (j.ok === false) return { ok: false, error: j.error };
  const r = j.value as Record<string, unknown>;
  if (!r || typeof r !== "object" || (r.kind !== "json" && r.kind !== "text")) return { ok: false, error: 'Response phải là {"kind": "json"} hoặc {"kind": "text"}.' };
  return { ok: true, value: r.kind };
}

export const pretty = (v: unknown) => JSON.stringify(v, null, 2);

/** Path variables that are used in `path` but not declared as in=path params. */
export function missingPathParams(op: Operation): string[] {
  const p = parseParams(op.paramsJson);
  const declared = new Set(p.ok ? p.value.filter(x => x.in === "path").map(x => x.name) : []);
  return pathVars(op.path).filter(v => !declared.has(v));
}

/** Adds the missing path params; returns the op unchanged when Params doesn't parse. */
export function withPathParamsAdded(op: Operation): Operation {
  const p = parseParams(op.paramsJson);
  if (!p.ok) return op;
  const missing = missingPathParams(op);
  if (!missing.length) return op;
  const next = [...p.value, ...missing.map(name => ({ name, in: "path" as const, type: "string" as const, required: true, description: "" }))];
  return { ...op, paramsJson: pretty(next) };
}

/** {"kind": "json", "shape": {"sku": "{sku}"}} from the in=body params. */
export function bodyFromParams(op: Operation): string | null {
  const p = parseParams(op.paramsJson);
  if (!p.ok) return null;
  const cur = parseBody(op.bodyJson);
  const kind = cur.ok && cur.value && cur.value.kind !== "text" ? cur.value.kind : "json";
  const shape = Object.fromEntries(p.value.filter(x => x.in === "body").map(x => [x.name, `{${x.name}}`]));
  return pretty({ kind, shape });
}

/* ───────────── validation ───────────── */

export interface Issue { key: string; message: string; opId?: string }
export interface Validation {
  /** Field key -> message, in on-screen order (first entry = first error to scroll to). */
  errors: Map<string, string>;
  warnings: Issue[];
}

const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

function privateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "0.0.0.0") return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

export function httpsUrlError(v: string, label: string): string | undefined {
  const s = v.trim();
  if (!s) return `Vui lòng nhập ${label}.`;
  if (!/^https:\/\//i.test(s)) return `${label} phải bắt đầu bằng https://.`;
  try { new URL(s); } catch { return `${label} không hợp lệ.`; }
  return undefined;
}

export function baseUrlError(v: string): string | undefined {
  const e = httpsUrlError(v, "Base URL");
  if (e) return e;
  if (/[?#]/.test(v)) return "Base URL không được chứa query (?) hay fragment (#).";
  const host = new URL(v.trim()).hostname;
  if (privateHost(host)) return "Base URL không được trỏ tới localhost hay địa chỉ mạng nội bộ.";
  return undefined;
}

export function validate(form: KitForm, takenNames: string[] = existingKitNames): Validation {
  const errors = new Map<string, string>();
  const warnings: Issue[] = [];
  const err = (key: string, message: string) => { if (!errors.has(key)) errors.set(key, message); };

  const name = form.name.trim();
  if (!name) err("name", "Vui lòng nhập tên tool kit.");
  else if (name.length > 80) err("name", "Tối đa 80 ký tự.");
  else if (takenNames.some(n => n.toLowerCase() === name.toLowerCase())) err("name", "Tên này đã có trong workspace.");
  if (!form.description.trim()) warnings.push({ key: "description", message: "Nên có mô tả để người dùng biết kit này làm gì." });
  const be = baseUrlError(form.baseUrl);
  if (be) err("baseUrl", be);

  if (form.authType === "api_key") {
    if (!form.headers.length) err("headers", "Cần ít nhất 1 header.");
    const seen = new Set<string>();
    for (const h of form.headers) {
      const k = h.key.trim();
      if (!k) err(`header.${h.id}.key`, "Vui lòng nhập tên header.");
      else if (!HEADER_NAME_RE.test(k)) err(`header.${h.id}.key`, "Tên header không hợp lệ.");
      else if (seen.has(k.toLowerCase())) err(`header.${h.id}.key`, "Tên header bị trùng.");
      seen.add(k.toLowerCase());
      if (!h.value.trim()) err(`header.${h.id}.value`, "Vui lòng nhập giá trị.");
    }
  }
  if (form.authType === "oauth_manual") {
    const a = httpsUrlError(form.oauth.authorizeUrl, "Authorize URL");
    if (a) err("oauth.authorizeUrl", a);
    const t = httpsUrlError(form.oauth.tokenUrl, "Token URL");
    if (t) err("oauth.tokenUrl", t);
    if (!form.oauth.clientId.trim()) err("oauth.clientId", "Vui lòng nhập Client ID.");
  }

  if (!isOAuth(form.authType)) {
    const names = new Map<string, number>();
    for (const op of form.operations) names.set(op.name.trim(), (names.get(op.name.trim()) ?? 0) + 1);
    for (const op of form.operations) {
      const k = (f: string) => `op.${op.id}.${f}`;
      const n = op.name.trim();
      if (!n) err(k("name"), "Vui lòng nhập tên operation.");
      else if (!OP_NAME_RE.test(n)) err(k("name"), "Dùng snake_case: chữ thường, số, dấu _, bắt đầu bằng chữ, tối đa 48 ký tự.");
      else if ((names.get(n) ?? 0) > 1) err(k("name"), "Tên operation bị trùng.");
      if (op.description.trim().length < 20) err(k("description"), "Mô tả cho model cần tối thiểu 20 ký tự.");
      if (!op.path.trim()) err(k("path"), "Vui lòng nhập path.");
      else if (!op.path.startsWith("/")) err(k("path"), "Path phải bắt đầu bằng /.");
      else if (op.path.includes("?")) err(k("path"), "Path không chứa ?. Dùng Static query hoặc param in=query.");

      const params = parseParams(op.paramsJson);
      if (!params.ok) err(k("params"), params.error);
      else {
        const pathParams = params.value.filter(p => p.in === "path").map(p => p.name);
        const vars = pathVars(op.path);
        const missing = vars.filter(v => !pathParams.includes(v));
        const unused = pathParams.filter(p => !vars.includes(p));
        if (missing.length) err(k("params"), `Path có {${missing.join("}, {")}} chưa có trong Parameters.`);
        else if (unused.length) err(k("params"), `Param in=path "${unused[0]}" không có trong path.`);
        else if (!methodAllowsBody(op.method) && params.value.some(p => p.in === "body")) err(k("params"), `${op.method} không được có param in=body.`);
        const undocumented = params.value.filter(p => !p.description?.trim()).length;
        if (undocumented) warnings.push({ key: k("params"), opId: op.id, message: `${undocumented} param chưa có mô tả.` });
        if (methodAllowsBody(op.method) && params.value.length === 0) warnings.push({ key: k("params"), opId: op.id, message: `${op.method} nhưng chưa khai báo param nào.` });
      }
      const resp = parseResponse(op.responseJson);
      if (!resp.ok) err(k("response"), resp.error);
    }
  }
  return { errors, warnings };
}

/* ───────────── payload ───────────── */

export interface OperationPayload {
  name: string; displayName: string; description: string; method: HttpMethod; path: string;
  risk: "read" | "write" | "destructive"; bodyType: "none" | "json" | "form" | "text";
  /** The body definition itself (shape / from) so the payload can be pasted back in losslessly. */
  body?: Body;
  staticQuery: Record<string, string>; params: Param[]; responseKind: ResponseKind;
}
export interface KitPayload {
  name: string; description: string; baseUrl: string;
  authType: "none" | "api_key" | "oauth2";
  headers?: Record<string, string>;
  oauth?: { mode: "auto" | "manual"; authorizationUrl?: string; tokenUrl?: string; clientId?: string; clientSecret?: string; scopes?: string[] };
  operations?: OperationPayload[];
}

export const MASK = "••••••";

/** Request body for POST /console/v1/workspaces/{ws}/api-connectors. Secrets are masked —
 * header values and the client secret are write-only. */
export function buildPayload(form: KitForm, { mask = true } = {}): KitPayload {
  const base: KitPayload = {
    name: form.name.trim(),
    description: form.description.trim(),
    baseUrl: form.baseUrl.trim(),
    authType: form.authType === "api_key" ? "api_key" : isOAuth(form.authType) ? "oauth2" : "none",
  };
  if (form.authType === "api_key") {
    base.headers = Object.fromEntries(form.headers.filter(h => h.key.trim()).map(h => [h.key.trim(), mask ? MASK : h.value]));
  }
  if (isOAuth(form.authType)) {
    const scopes = form.oauth.scopes.split(/[\s,]+/).filter(Boolean);
    base.oauth = {
      mode: form.authType === "oauth_auto" ? "auto" : "manual",
      ...(form.authType === "oauth_manual" ? { authorizationUrl: form.oauth.authorizeUrl.trim(), tokenUrl: form.oauth.tokenUrl.trim(), clientId: form.oauth.clientId.trim() } : {}),
      ...(form.oauth.clientSecret ? { clientSecret: mask ? MASK : form.oauth.clientSecret } : {}),
      ...(scopes.length ? { scopes } : {}),
    };
    return base;
  }
  base.operations = form.operations.map(op => {
    const params = parseParams(op.paramsJson);
    const resp = parseResponse(op.responseJson);
    // No body editor: the request body is built from the in=body parameters (JSON).
    const bodyParams = params.ok && methodAllowsBody(op.method) ? params.value.filter(p => p.in === "body") : [];
    const b: Body | null = bodyParams.length ? { kind: "json", shape: Object.fromEntries(bodyParams.map(p => [p.name, `{${p.name}}`])) } : null;
    return {
      name: op.name.trim(), displayName: op.displayName.trim(), description: op.description.trim(),
      method: op.method, path: op.path.trim(), risk: RISK[op.method],
      bodyType: b ? b.kind : "none",
      ...(b ? { body: b } : {}),
      staticQuery: Object.fromEntries(op.staticQuery.filter(q => q.key.trim()).map(q => [q.key.trim(), q.value])),
      params: params.ok ? (params.value.length ? params.value : [{ name: "query", in: "query", type: "string" }]) : [],
      responseKind: resp.ok ? resp.value : "json",
    };
  });
  return base;
}

/** "Dán JSON": the create payload back into the form. Masked secrets come back empty. */
export function formFromPayload(text: string): Parsed<KitForm> {
  const j = parseJson(text);
  if (j.ok === false) return { ok: false, error: j.error };
  const p = j.value as Partial<KitPayload>;
  if (!p || typeof p !== "object" || Array.isArray(p)) return { ok: false, error: "Payload phải là một object JSON." };
  if (typeof p.name !== "string") return { ok: false, error: 'Thiếu "name".' };
  if (typeof p.baseUrl !== "string") return { ok: false, error: 'Thiếu "baseUrl".' };
  if (!["none", "api_key", "oauth2"].includes(p.authType as string)) return { ok: false, error: '"authType" phải là "none", "api_key" hoặc "oauth2".' };
  const authType: AuthType = p.authType === "oauth2" ? (p.oauth?.mode === "manual" ? "oauth_manual" : "oauth_auto") : (p.authType as AuthType);
  const ops = p.operations ?? [];
  if (!Array.isArray(ops)) return { ok: false, error: '"operations" phải là một mảng.' };
  const operations: Operation[] = [];
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i] as Partial<OperationPayload>;
    if (!o || typeof o !== "object") return { ok: false, error: `operations[${i}] phải là một object.` };
    const method = String(o.method ?? "GET").toUpperCase() as HttpMethod;
    if (!METHODS.includes(method)) return { ok: false, error: `operations[${i}].method không hợp lệ.` };
    const params = (o.params ?? []).filter(x => !(x.name === "query" && x.in === "query" && (o.params ?? []).length === 1 && !x.description));
    operations.push({
      id: uid("op"), name: o.name ?? "", displayName: o.displayName ?? "", description: o.description ?? "",
      method, path: o.path ?? "",
      staticQuery: Object.entries(o.staticQuery ?? {}).map(([key, value]) => ({ id: uid("q"), key, value: String(value) })),
      paramsJson: params.length ? pretty(params) : "",
      bodyJson: o.body ? pretty(o.body) : o.bodyType && o.bodyType !== "none" ? pretty(o.bodyType === "text" ? { kind: "text", from: "" } : { kind: o.bodyType, shape: {} }) : "",
      responseJson: pretty({ kind: o.responseKind === "text" ? "text" : "json" }),
    });
  }
  return {
    ok: true,
    value: {
      name: p.name, description: p.description ?? "", baseUrl: p.baseUrl, authType,
      headers: Object.entries(p.headers ?? {}).map(([key, v]) => ({ id: uid("h"), key, value: v === MASK ? "" : String(v) })),
      oauth: {
        authorizeUrl: p.oauth?.authorizationUrl ?? "", tokenUrl: p.oauth?.tokenUrl ?? "", clientId: p.oauth?.clientId ?? "",
        clientSecret: p.oauth?.clientSecret && p.oauth.clientSecret !== MASK ? p.oauth.clientSecret : "", scopes: (p.oauth?.scopes ?? []).join(" "),
      },
      operations,
    },
  };
}

/* ───────────── sample / empty ───────────── */

export const emptyOAuth = (): OAuthFields => ({ authorizeUrl: "", tokenUrl: "", clientId: "", clientSecret: "", scopes: "" });

export const emptyOperation = (): Operation => ({
  id: uid("op"), name: "", displayName: "", description: "", method: "GET", path: "",
  staticQuery: [], paramsJson: "", bodyJson: "", responseJson: pretty({ kind: "json" }),
});

export const emptyForm = (): KitForm => ({
  name: "", description: "", baseUrl: "", authType: "none", headers: [], oauth: emptyOAuth(), operations: [],
});

export function sampleForm(): KitForm {
  const ops: Operation[] = [
    {
      id: uid("op"), name: "list_orders", displayName: "Danh sách đơn hàng",
      description: "Liệt kê đơn hàng, lọc theo trạng thái. Dùng khi người dùng muốn xem các đơn gần đây; trả về mảng đơn hàng.",
      method: "GET", path: "/orders",
      staticQuery: [{ id: uid("q"), key: "format", value: "json" }],
      paramsJson: pretty([
        { name: "status", in: "query", type: "string", required: false, description: "Trạng thái đơn", enum: ["pending", "paid", "shipped"] },
        { name: "limit", in: "query", type: "integer", required: false, description: "Số đơn tối đa trả về", default: 20 },
      ]),
      bodyJson: "", responseJson: pretty({ kind: "json" }),
    },
    {
      id: uid("op"), name: "get_order", displayName: "Chi tiết đơn hàng",
      description: "Lấy chi tiết một đơn hàng theo mã đơn. Cần order_id; trả về trạng thái, sản phẩm và tổng tiền.",
      method: "GET", path: "/orders/{order_id}", staticQuery: [],
      paramsJson: pretty([{ name: "order_id", in: "path", type: "string", required: true, description: "Mã đơn hàng, ví dụ ORD-1024" }]),
      bodyJson: "", responseJson: pretty({ kind: "json" }),
    },
    {
      id: uid("op"), name: "create_order", displayName: "Tạo đơn hàng",
      description: "Tạo đơn hàng mới cho một sản phẩm. Cần sku và số lượng; trả về đơn hàng vừa tạo kèm mã đơn.",
      method: "POST", path: "/orders", staticQuery: [],
      paramsJson: pretty([
        { name: "sku", in: "body", type: "string", required: true, description: "Mã sản phẩm" },
        { name: "qty", in: "body", type: "integer", required: false, description: "Số lượng", default: 1 },
      ]),
      bodyJson: pretty({ kind: "json", shape: { sku: "{sku}", qty: "{qty}" } }),
      responseJson: pretty({ kind: "json" }),
    },
  ];
  return {
    name: "Order Service", description: "Tra cứu và tạo đơn hàng", baseUrl: "https://api.example.com/v1",
    authType: "api_key", headers: [{ id: uid("h"), key: "X-API-Key", value: "sk-demo-1234567890" }],
    oauth: emptyOAuth(), operations: ops,
  };
}

export function samplePayloadText(): string {
  return pretty(buildPayload(sampleForm(), { mask: false }));
}
