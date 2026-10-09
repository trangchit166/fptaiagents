import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";
import CreateToolkit from "@/pages/CreateToolkit";

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Element.prototype.hasPointerCapture ??= () => false;
});

const mount = () => render(<MemoryRouter><CreateToolkit /><Toaster /></MemoryRouter>);
const opRows = () => document.querySelectorAll("[data-op]");
const type = (label: RegExp | string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });

/** Step 1 -> import the sample OpenAPI file -> step 2 (4 operations, api_key with empty value). */
function importSample() {
  fireEvent.click(screen.getByRole("button", { name: "Dùng file mẫu" }));
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục với 4 operation" }));
}
/** Fills what the sample file leaves incomplete so the kit can be saved. */
function completeImported() {
  fireEvent.change(document.querySelector<HTMLInputElement>('[data-field^="header."][data-field$=".value"]')!, { target: { value: "sk-123" } });
  const getProduct = [...opRows()].find(r => r.textContent?.includes("get_product"))!;
  fireEvent.click(within(getProduct as HTMLElement).getAllByRole("button")[0]);
  fireEvent.change(document.querySelector<HTMLTextAreaElement>(`[data-op="${getProduct.getAttribute("data-op")}"] [data-field$=".description"]`)!, { target: { value: "Lấy chi tiết một sản phẩm theo mã sku trong kho." } });
}

describe("Tạo tool kit — steps", () => {
  it("opens on step 1 with the agent-detail style header, no JSON paste, no save button yet", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Tạo tool kit" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Connectors" }).getAttribute("href")).toBe("/connectors?section=custom");
    expect(screen.getByText("Bước 1: Import OpenAPI / Swagger").closest("button")!.getAttribute("aria-current")).toBe("step");
    expect(screen.getByText("Import OpenAPI 3 / Swagger 2")).toBeTruthy();
    expect(screen.queryByText(/Dán JSON/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Tạo tool kit/ })).toBeNull();
  });

  it("no file -> 'Nhập tay' goes to step 2 with an empty form", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Nhập tay/ }));
    expect(screen.getByText("Bước 2: Thông tin kit").closest("button")!.getAttribute("aria-current")).toBe("step");
    expect((screen.getByLabelText(/Tên tool kit/) as HTMLInputElement).value).toBe("");
    expect(screen.getByText("0 operation")).toBeTruthy();
    expect(screen.queryByText(/Đã điền sẵn từ file/)).toBeNull();
  });

  it("import -> step 2 prefilled from the file (name, base URL, auth header, operations)", async () => {
    mount();
    importSample();
    expect(await screen.findByText("Đã trích 4 operation từ file.")).toBeTruthy();
    expect(screen.getByText(/Đã điền sẵn từ file/)).toBeTruthy();
    expect((screen.getByLabelText(/Tên tool kit/) as HTMLInputElement).value).toBe("Inventory Service");
    expect((screen.getByLabelText(/Base URL/) as HTMLInputElement).value).toBe("https://api.example.com/inventory/v2");
    expect(screen.getByText("api-inventory-service")).toBeTruthy();
    expect(opRows()).toHaveLength(4);
    expect((document.querySelector('[data-field^="header."][data-field$=".key"]') as HTMLInputElement).value).toBe("X-API-Key");
  });

  it("back to step 1 keeps the form; save validates, then succeeds", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    mount();
    importSample();
    fireEvent.click(screen.getByRole("button", { name: /Quay lại bước Import/ }));
    fireEvent.click(screen.getByText("Bước 2: Thông tin kit"));
    expect(opRows()).toHaveLength(4);

    fireEvent.click(screen.getAllByRole("button", { name: /Tạo tool kit/ })[0]);
    expect(await screen.findByText(/Còn 2 lỗi cần sửa trước khi lưu\./)).toBeTruthy();
    completeImported();
    fireEvent.click(screen.getAllByRole("button", { name: /Tạo tool kit/ })[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/4 tool sẵn sàng gắn vào agent/)).toBeTruthy();
    expect(within(dialog).getByText("api-inventory-service__list_products")).toBeTruthy();
    log.mockRestore();
  });
});

describe("Tạo tool kit — step 2 editing", () => {
  const toStep2 = () => { mount(); importSample(); };

  it("OAuth hides Operations; switching back restores them", () => {
    toStep2();
    const pick = (re: RegExp) => { fireEvent.click(screen.getByRole("combobox", { name: /Auth type/ })); fireEvent.click(screen.getByRole("option", { name: re })); };
    pick(/OAuth 2\.1 \(Tự động\)/);
    expect(screen.queryByText("Operations")).toBeNull();
    pick(/^API key/);
    expect(opRows()).toHaveLength(4);
  });

  it("auth select works from the keyboard", () => {
    toStep2();
    fireEvent.click(screen.getByRole("combobox", { name: /Auth type/ }));
    const list = screen.getByRole("listbox");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(screen.getByText("Authorize URL")).toBeTruthy();
  });

  it("errors stay hidden until save; save focuses the first error", async () => {
    toStep2();
    fireEvent.click(screen.getByRole("button", { name: "Xóa form" }));
    expect(screen.queryByText("Vui lòng nhập tên tool kit.")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /Tạo tool kit/ })[0]);
    expect(await screen.findByText(/Còn 2 lỗi cần sửa trước khi lưu\./)).toBeTruthy();
    await act(() => new Promise(r => setTimeout(r, 120)));
    expect(document.activeElement?.getAttribute("data-field")).toBe("name");
  });

  it("delete shows an undo toast that restores the operation; duplicate adds _copy", async () => {
    toStep2();
    fireEvent.click(screen.getByRole("button", { name: "Xóa list_products" }));
    expect(opRows()).toHaveLength(3);
    fireEvent.click(await screen.findByRole("button", { name: "Hoàn tác" }));
    expect(opRows()).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Nhân bản list_products" }));
    expect([...opRows()].map(r => r.textContent)[1]).toContain("list_products_copy");
  });

  it("path blur auto-adds missing path params", () => {
    toStep2();
    const path = document.querySelector<HTMLInputElement>('[data-field$=".path"]')!;
    fireEvent.change(path, { target: { value: "/products/{category_id}" } });
    expect(screen.getByText(/Path có/)).toBeTruthy();
    fireEvent.blur(path);
    expect(screen.queryByText(/Path có/)).toBeNull();
  });
});
