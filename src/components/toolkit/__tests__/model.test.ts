import { describe, it, expect } from "vitest";
import {
  kitKey, toSnake, validate, sampleForm, buildPayload, formFromPayload, samplePayloadText, emptyOperation, pretty, uid,
  withPathParamsAdded, bodyFromParams, type KitForm,
} from "../model";
import { parseSpec, SAMPLE_OPENAPI } from "../openapi";

const errs = (f: KitForm) => Object.fromEntries(validate(f).errors);

describe("key & names", () => {
  it("builds the key from the name", () => {
    expect(kitKey("Order Service")).toBe("api-order-service");
    expect(kitKey("Đơn hàng Sài Gòn!")).toBe("api-don-hang-sai-gon");
    expect(toSnake("listProducts")).toBe("list_products");
    expect(toSnake("123 go")).toBe("op_123_go");
  });
});

describe("validation", () => {
  it("sample data is valid", () => {
    expect(validate(sampleForm()).errors.size).toBe(0);
  });

  it("kit name / base URL rules", () => {
    const f = sampleForm();
    expect(errs({ ...f, name: "" }).name).toBeTruthy();
    expect(errs({ ...f, name: "hubspot crm" }).name).toBe("Tên này đã có trong workspace.");
    for (const url of ["http://api.x.com", "https://api.x.com/v1?a=1", "https://api.x.com#x", "https://localhost/v1", "https://127.0.0.1", "https://10.1.2.3", "https://192.168.1.1", "https://172.20.0.1", "https://169.254.169.254"]) {
      expect(errs({ ...f, baseUrl: url }).baseUrl, url).toBeTruthy();
    }
    expect(errs({ ...f, baseUrl: "https://172.32.0.1" }).baseUrl).toBeUndefined();
    expect(validate({ ...f, description: "" }).warnings.some(w => w.key === "description")).toBe(true);
  });

  it("API key headers", () => {
    const f = sampleForm();
    expect(errs({ ...f, headers: [] }).headers).toBe("Cần ít nhất 1 header.");
    const a = { id: "a", key: "X-Key", value: "1" };
    const b = { id: "b", key: "x-key", value: "" };
    const e = errs({ ...f, headers: [a, b, { id: "c", key: "bad header", value: "1" }] });
    expect(e["header.b.key"]).toBe("Tên header bị trùng.");
    expect(e["header.b.value"]).toBeTruthy();
    expect(e["header.c.key"]).toBe("Tên header không hợp lệ.");
  });

  it("OAuth manual needs https URLs + client id, and skips operations", () => {
    const f = { ...sampleForm(), authType: "oauth_manual" as const };
    f.operations[0] = { ...f.operations[0], name: "BAD" };
    const e = errs(f);
    expect(e["oauth.authorizeUrl"]).toBeTruthy();
    expect(e["oauth.tokenUrl"]).toBeTruthy();
    expect(e["oauth.clientId"]).toBeTruthy();
    expect(Object.keys(e).some(k => k.startsWith("op."))).toBe(false);
    expect(errs({ ...f, oauth: { ...f.oauth, authorizeUrl: "http://a.b/x", tokenUrl: "https://a.b/t", clientId: "c" } })["oauth.authorizeUrl"]).toMatch(/https/);
  });

  it("operation rules", () => {
    const f = sampleForm();
    const [a, b, c] = f.operations;
    const e = errs({
      ...f,
      operations: [
        { ...a, name: "Bad-Name", description: "ngắn", path: "orders" },
        { ...b, name: "dup", path: "/orders/{order_id}/{x}?y=1" },
        { ...c, name: "dup", method: "GET" },
      ],
    });
    expect(e[`op.${a.id}.name`]).toMatch(/snake_case/);
    expect(e[`op.${a.id}.description`]).toMatch(/20/);
    expect(e[`op.${a.id}.path`]).toMatch(/bắt đầu/);
    expect(e[`op.${b.id}.name`]).toBe("Tên operation bị trùng.");
    expect(e[`op.${b.id}.path`]).toMatch(/\?/);
    expect(e[`op.${c.id}.params`]).toBe("GET không được có param in=body.");
    const e2 = errs({ ...f, operations: [{ ...b, path: "/orders/{order_id}/{line}" }, { ...a, paramsJson: pretty([{ name: "id", in: "path", type: "string" }]) }] });
    expect(e2[`op.${b.id}.params`]).toBe("Path có {line} chưa có trong Parameters.");
    expect(e2[`op.${a.id}.params`]).toMatch(/không có trong path/);
    const e3 = errs({ ...f, operations: [{ ...a, paramsJson: "[{" }, { ...b, responseJson: '{"kind":"html"}' }] });
    expect(e3[`op.${a.id}.params`]).toMatch(/JSON không hợp lệ/);
    expect(e3[`op.${b.id}.response`]).toMatch(/Response/);
  });

  it("warnings: param without description, POST without params", () => {
    const f = sampleForm();
    const post = { ...emptyOperation(), name: "make_it", method: "POST" as const, path: "/x", description: "Mô tả đủ dài cho model đọc." };
    const w = validate({ ...f, operations: [post, { ...f.operations[1], paramsJson: pretty([{ name: "order_id", in: "path", type: "string" }]) }] }).warnings;
    expect(w.some(x => x.opId === post.id && /POST/.test(x.message))).toBe(true);
    expect(w.some(x => /chưa có mô tả/.test(x.message))).toBe(true);
  });
});

describe("helpers", () => {
  it("adds missing path params and builds the body from params", () => {
    const op = { ...emptyOperation(), path: "/a/{x}/{y}", paramsJson: pretty([{ name: "x", in: "path", type: "string" }]) };
    expect(JSON.parse(withPathParamsAdded(op).paramsJson).map((p: { name: string }) => p.name)).toEqual(["x", "y"]);
    const post = sampleForm().operations[2];
    expect(JSON.parse(bodyFromParams({ ...post, bodyJson: "" })!)).toEqual({ kind: "json", shape: { sku: "{sku}", qty: "{qty}" } });
  });
});

describe("payload", () => {
  it("api_key payload: masked headers, risk, static query, body", () => {
    const p = buildPayload(sampleForm());
    expect(p.authType).toBe("api_key");
    expect(p.headers).toEqual({ "X-API-Key": "••••••" });
    expect(p.operations!.map(o => [o.name, o.risk, o.bodyType])).toEqual([["list_orders", "read", "none"], ["get_order", "read", "none"], ["create_order", "write", "json"]]);
    expect(p.operations![0].staticQuery).toEqual({ format: "json" });
    expect(p.oauth).toBeUndefined();
  });
  it("oauth payload omits operations", () => {
    const f: KitForm = { ...sampleForm(), authType: "oauth_manual", oauth: { authorizeUrl: "https://a/x", tokenUrl: "https://a/t", clientId: "c", clientSecret: "s", scopes: "read, write" } };
    const p = buildPayload(f);
    expect(p.authType).toBe("oauth2");
    expect(p.operations).toBeUndefined();
    expect(p.oauth).toEqual({ mode: "manual", authorizationUrl: "https://a/x", tokenUrl: "https://a/t", clientId: "c", clientSecret: "••••••", scopes: ["read", "write"] });
  });
  it("sample payload pastes back into an equivalent form", () => {
    const r = formFromPayload(samplePayloadText());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(validate(r.value).errors.size).toBe(0);
    expect(buildPayload(r.value)).toEqual(buildPayload(sampleForm()));
    expect(formFromPayload("{").ok).toBe(false);
    expect(formFromPayload('{"name":"a","baseUrl":"https://x","authType":"basic"}').ok).toBe(false);
  });
});

describe("OpenAPI import", () => {
  it("maps the sample file", () => {
    const r = parseSpec(SAMPLE_OPENAPI);
    expect(r.name).toBe("Inventory Service");
    expect(r.servers).toHaveLength(2);
    expect(r.authType).toBe("api_key");
    expect(r.headers.map(h => h.key)).toEqual(["X-API-Key"]);
    const names = r.operations.map(o => o.op.name);
    expect(names).toEqual(["list_products", "create_product", "get_product", "delete_products_sku"]);
    const list = r.operations[0];
    expect(list.warnings.join(" ")).toMatch(/header param "X-Request-Id"/);
    const create = r.operations[1];
    const params = JSON.parse(create.op.paramsJson);
    expect(params.find((p: { name: string }) => p.name === "dimensions").type).toBe("object");
    expect(params.find((p: { name: string }) => p.name === "sku")).toMatchObject({ in: "body", required: true });
    expect(JSON.parse(create.op.bodyJson).kind).toBe("json");
    expect(r.operations[2].warnings.join(" ")).toMatch(/20 ký tự/);
    expect(JSON.parse(r.operations[3].op.paramsJson)[0]).toMatchObject({ name: "sku", in: "path" });
  });
  it("reports bad input", () => {
    expect(() => parseSpec("")).toThrow();
    expect(() => parseSpec("a: [")).toThrow(/Không đọc được/);
    expect(() => parseSpec("foo: 1")).toThrow(/openapi/);
  });
  it("swagger 2 with oauth accessCode -> OAuth manual", () => {
    const r = parseSpec(JSON.stringify({
      swagger: "2.0", info: { title: "S2" }, host: "api.s2.io", basePath: "/v1", schemes: ["https"],
      securityDefinitions: { o: { type: "oauth2", flow: "accessCode", authorizationUrl: "https://a/auth", tokenUrl: "https://a/token", scopes: { read: "" } } },
      paths: { "/things/{id}": { get: { operationId: "getThing", parameters: [{ name: "id", in: "path", type: "string", required: true }] } } },
    }));
    expect(r.servers).toEqual(["https://api.s2.io/v1"]);
    expect(r.authType).toBe("oauth_manual");
    expect(r.oauth).toMatchObject({ authorizeUrl: "https://a/auth", tokenUrl: "https://a/token", scopes: "read" });
    expect(uid()).toBeTruthy();
  });
});

describe("body from in=body parameters", () => {
  it("builds a JSON body from the in=body parameters, none for GET", () => {
    const f = sampleForm();
    const ops = buildPayload({ ...f, operations: f.operations.map(o => ({ ...o, bodyJson: "" })) }).operations!;
    expect(ops[2]).toMatchObject({ bodyType: "json", body: { kind: "json", shape: { sku: "{sku}", qty: "{qty}" } } });
    expect(ops[0].bodyType).toBe("none");
  });
});
