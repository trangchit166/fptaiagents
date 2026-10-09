// OpenAPI 3 / Swagger 2 -> tool kit form. Each path + method becomes one operation.
import { load as loadYaml } from "js-yaml";
import {
  METHODS, OP_NAME_RE, emptyOAuth, pretty, toSnake, uid,
  type AuthType, type HttpMethod, type KitForm, type KV, type Operation, type Param, type ParamType,
} from "./model";

export interface ImportedOperation {
  op: Operation;
  paramsCount: number;
  warnings: string[];
}
export interface ImportResult {
  name: string;
  description: string;
  servers: string[];
  authType: AuthType;
  authLabel: string;
  headers: KV[];
  oauth: KitForm["oauth"];
  operations: ImportedOperation[];
  warnings: string[];
}

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const PARAM_TYPES: ParamType[] = ["string", "integer", "number", "boolean", "array", "object"];

function resolver(root: Obj) {
  const resolve = (node: any, seen = new Set<string>()): any => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (node && typeof node === "object" && typeof node.$ref === "string") {
      const ref: string = node.$ref;
      if (!ref.startsWith("#/") || seen.has(ref)) return {};
      seen.add(ref);
      const target = ref.slice(2).split("/").map(s => s.replace(/~1/g, "/").replace(/~0/g, "~")).reduce<any>((o, k) => (o == null ? o : o[k]), root); // eslint-disable-line @typescript-eslint/no-explicit-any
      return resolve(target ?? {}, seen);
    }
    return node;
  };
  return resolve;
}

function typeOf(schema: Obj | undefined): ParamType {
  const t = schema?.type;
  if (PARAM_TYPES.includes(t)) return t;
  if (schema?.properties) return "object";
  return "string";
}

function param(name: string, where: Param["in"], schema: Obj | undefined, required: boolean, description?: string): Param {
  const p: Param = { name, in: where, type: typeOf(schema), required };
  const desc = description ?? schema?.description;
  if (desc) p.description = String(desc);
  if (schema?.default !== undefined) p.default = schema.default;
  if (Array.isArray(schema?.enum)) p.enum = schema.enum;
  return p;
}

export function parseSpec(text: string): ImportResult {
  let doc: unknown;
  const t = text.trim();
  if (!t) throw new Error("Chưa có nội dung file.");
  try {
    doc = t.startsWith("{") ? JSON.parse(t) : loadYaml(t);
  } catch (e) {
    throw new Error(`Không đọc được file: ${(e as Error).message.split("\n")[0]}`);
  }
  const spec = doc as Obj;
  if (!spec || typeof spec !== "object") throw new Error("File không phải OpenAPI / Swagger.");
  const isV3 = typeof spec.openapi === "string" && spec.openapi.startsWith("3");
  const isV2 = String(spec.swagger ?? "").startsWith("2");
  if (!isV3 && !isV2) throw new Error('Không tìm thấy "openapi: 3.x" hoặc "swagger: 2.0".');
  if (!spec.paths || typeof spec.paths !== "object") throw new Error('File không có "paths".');
  const resolve = resolver(spec);
  const warnings: string[] = [];

  // Servers
  let servers: string[] = [];
  if (isV3) servers = (spec.servers ?? []).map((s: Obj) => String(s.url ?? "")).filter(Boolean);
  else if (spec.host) {
    const schemes: string[] = spec.schemes ?? ["https"];
    servers = [`${schemes.includes("https") ? "https" : schemes[0]}://${spec.host}${spec.basePath ?? ""}`];
  }
  servers = servers.map(s => s.replace(/\/+$/, ""));
  if (!servers.length) warnings.push("File không khai báo server; hãy nhập Base URL sau khi đưa vào form.");

  // Auth
  const schemes: Obj = isV3 ? spec.components?.securitySchemes ?? {} : spec.securityDefinitions ?? {};
  let authType: AuthType = "none";
  let authLabel = "Không xác thực";
  const headers: KV[] = [];
  const oauth = emptyOAuth();
  for (const [key, raw] of Object.entries(schemes)) {
    const s = resolve(raw) as Obj;
    if (s.type === "apiKey" && s.in === "header" && authType === "none") {
      authType = "api_key"; authLabel = `API key (header ${s.name})`;
      headers.push({ id: uid("h"), key: String(s.name), value: "" });
    } else if (s.type === "http" && String(s.scheme).toLowerCase() === "bearer" && authType === "none") {
      authType = "api_key"; authLabel = "API key (Bearer token)";
      headers.push({ id: uid("h"), key: "Authorization", value: "" });
    } else if (s.type === "oauth2") {
      const flow = isV3 ? s.flows?.authorizationCode : s.flow === "accessCode" ? s : undefined;
      if (flow) {
        authType = "oauth_manual"; authLabel = "OAuth 2.1 (Thủ công)";
        oauth.authorizeUrl = flow.authorizationUrl ?? "";
        oauth.tokenUrl = flow.tokenUrl ?? "";
        oauth.scopes = Object.keys(flow.scopes ?? {}).join(" ");
      } else warnings.push(`Bỏ qua scheme OAuth "${key}": chỉ hỗ trợ authorizationCode.`);
    } else if (s.type === "apiKey" && s.in !== "header") {
      warnings.push(`Bỏ qua scheme "${key}": API key đặt trên ${s.in} chưa hỗ trợ, chỉ hỗ trợ header.`);
    }
  }

  // Operations
  const operations: ImportedOperation[] = [];
  const used = new Map<string, number>();
  for (const [path, rawItem] of Object.entries(spec.paths as Obj)) {
    const item = resolve(rawItem) as Obj;
    const shared: Obj[] = (item.parameters ?? []).map((p: Obj) => resolve(p));
    for (const m of ["get", "post", "put", "patch", "delete"]) {
      const opSpec = item[m] ? (resolve(item[m]) as Obj) : null;
      if (!opSpec) continue;
      const method = m.toUpperCase() as HttpMethod;
      if (!METHODS.includes(method)) continue;
      const opWarnings: string[] = [];

      let name = toSnake(opSpec.operationId ? String(opSpec.operationId) : `${m}_${path.replace(/[{}]/g, "")}`);
      if (!OP_NAME_RE.test(name)) name = toSnake(`${m}_op`);
      const count = (used.get(name) ?? 0) + 1;
      used.set(name, count);
      if (count > 1) {
        const renamed = `${name.slice(0, 45)}_${count}`;
        opWarnings.push(`Trùng tên ${name}, đổi thành ${renamed}.`);
        name = renamed;
      }

      const description = [opSpec.summary, opSpec.description].filter(Boolean).map(String).join(". ").replace(/\.\./g, ".").trim();
      if (!description) opWarnings.push("Thiếu mô tả.");
      else if (description.length < 20) opWarnings.push("Mô tả ngắn hơn 20 ký tự.");

      const params: Param[] = [];
      const byKey = new Map<string, Obj>();
      for (const p of [...shared, ...(opSpec.parameters ?? []).map((x: Obj) => resolve(x))]) byKey.set(`${p.in}:${p.name}`, p);
      let body: Obj | null = null;
      for (const p of byKey.values()) {
        if (p.in === "path" || p.in === "query") {
          params.push(param(String(p.name), p.in, isV3 ? resolve(p.schema ?? {}) : p, p.in === "path" ? true : !!p.required, p.description));
        } else if (p.in === "header" || p.in === "cookie") {
          opWarnings.push(`Bỏ qua ${p.in} param "${p.name}".`);
        } else if (p.in === "body" && isV2) {
          body = { kind: "json", schema: resolve(p.schema ?? {}) };
        } else if (p.in === "formData" && isV2) {
          params.push(param(String(p.name), "body", p, !!p.required, p.description));
          body = body ?? { kind: "form", schema: null };
        }
      }
      if (isV3 && opSpec.requestBody) {
        const rb = resolve(opSpec.requestBody) as Obj;
        const content: Obj = rb.content ?? {};
        if (content["application/json"]) body = { kind: "json", schema: resolve(content["application/json"].schema ?? {}) };
        else if (content["application/x-www-form-urlencoded"]) body = { kind: "form", schema: resolve(content["application/x-www-form-urlencoded"].schema ?? {}) };
        else if (Object.keys(content).length) opWarnings.push(`Bỏ qua body ${Object.keys(content)[0]}.`);
      }
      let bodyJson = "";
      if (body && method !== "GET" && method !== "DELETE") {
        const schema = body.schema as Obj | null;
        const required: string[] = schema?.required ?? [];
        for (const [prop, ps] of Object.entries((schema?.properties ?? {}) as Obj)) {
          params.push(param(prop, "body", resolve(ps), required.includes(prop)));
        }
        const shape = Object.fromEntries(params.filter(p => p.in === "body").map(p => [p.name, `{${p.name}}`]));
        bodyJson = pretty({ kind: body.kind, shape });
      }

      const okCodes = Object.entries((opSpec.responses ?? {}) as Obj).filter(([c]) => c.startsWith("2"));
      const types = okCodes.flatMap(([, r]) => Object.keys((resolve(r) as Obj).content ?? {}));
      const responseKind = types.length && !types.some(t2 => t2.includes("json")) ? "text" : "json";

      operations.push({
        op: {
          id: uid("op"), name, displayName: opSpec.summary ? String(opSpec.summary) : "", description,
          method, path, staticQuery: [],
          paramsJson: params.length ? pretty(params) : "",
          bodyJson, responseJson: pretty({ kind: responseKind }),
        },
        paramsCount: params.length,
        warnings: opWarnings,
      });
    }
  }
  if (!operations.length) warnings.push("Không tìm thấy operation GET/POST/PUT/PATCH/DELETE nào.");

  return {
    name: String(spec.info?.title ?? "").slice(0, 80),
    description: String(spec.info?.description ?? ""),
    servers, authType, authLabel, headers, oauth, operations, warnings,
  };
}

export const SAMPLE_OPENAPI = `openapi: 3.0.3
info:
  title: Inventory Service
  description: Tra cứu tồn kho và cập nhật sản phẩm
servers:
  - url: https://api.example.com/inventory/v2
  - url: https://staging.example.com/inventory/v2
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
  schemas:
    Product:
      type: object
      required: [sku, name]
      properties:
        sku: { type: string, description: Mã sản phẩm }
        name: { type: string, description: Tên sản phẩm }
        price: { type: number, description: Giá bán }
        dimensions:
          type: object
          properties:
            width: { type: number }
            height: { type: number }
paths:
  /products:
    get:
      operationId: listProducts
      summary: Danh sách sản phẩm
      description: Liệt kê sản phẩm còn hàng, có thể lọc theo danh mục.
      parameters:
        - name: category
          in: query
          schema: { type: string }
          description: Mã danh mục
        - name: X-Request-Id
          in: header
          schema: { type: string }
      responses:
        "200": { description: OK, content: { application/json: {} } }
    post:
      operationId: createProduct
      summary: Tạo sản phẩm mới trong kho
      requestBody:
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Product" }
      responses:
        "201": { description: Created }
  /products/{sku}:
    parameters:
      - name: sku
        in: path
        required: true
        schema: { type: string }
        description: Mã sản phẩm
    get:
      operationId: getProduct
      summary: Chi tiết
      responses:
        "200": { description: OK }
    delete:
      summary: Xóa sản phẩm khỏi kho, không khôi phục được
      responses:
        "204": { description: Deleted }
`;
