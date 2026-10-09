import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";
import CreateToolkit from "@/pages/CreateToolkit";

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture ??= () => false;
});

const mount = () => render(<MemoryRouter><CreateToolkit /><Toaster /></MemoryRouter>);
const opRows = () => document.querySelectorAll("[data-op]");

describe("Tạo tool kit", () => {
  it("loads the sample: header, badge, key, 3 operations with get_order expanded", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Tạo tool kit" })).toBeTruthy();
    expect(screen.getByText("Dữ liệu mẫu")).toBeTruthy();
    expect(screen.getByText("api-order-service")).toBeTruthy();
    expect(opRows()).toHaveLength(3);
    expect(screen.getByText("3 operation")).toBeTruthy();
    const expanded = [...opRows()].filter(r => r.querySelector('[aria-expanded="true"]'));
    expect(expanded).toHaveLength(1);
    expect(expanded[0].textContent).toContain("get_order");
    expect(screen.getByText("api-order-service__get_order")).toBeTruthy();
  });

  it("editing clears the sample badge and updates the key", () => {
    mount();
    fireEvent.change(screen.getByLabelText(/Tên tool kit/), { target: { value: "Kho Hàng Đà Nẵng" } });
    expect(screen.queryByText("Dữ liệu mẫu")).toBeNull();
    expect(screen.getByText("api-kho-hang-da-nang")).toBeTruthy();
  });

  it("OAuth hides Operations; switching back restores them", () => {
    mount();
    const pick = (title: string) => {
      fireEvent.click(screen.getByRole("combobox", { name: /Auth type/ }));
      fireEvent.click(screen.getByRole("option", { name: new RegExp(title.replace(/[()]/g, "\\$&")) }));
    };
    pick("OAuth 2.1 (Tự động)");
    expect(screen.queryByText("Operations")).toBeNull();
    expect(screen.getByText(/RFC 9728, RFC 8414/)).toBeTruthy();
    fireEvent.click(screen.getByRole("combobox", { name: /Auth type/ }));
    fireEvent.click(screen.getByRole("option", { name: /^API key/ }));
    expect(opRows()).toHaveLength(3);
  });

  it("auth select works from the keyboard", () => {
    mount();
    fireEvent.click(screen.getByRole("combobox", { name: /Auth type/ }));
    const list = screen.getByRole("listbox");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(screen.getByText("Authorize URL")).toBeTruthy();
  });

  it("valid sample -> success dialog with 3 tools and the payload logged", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Tạo tool kit/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Đã tạo tool kit "Order Service"/)).toBeTruthy();
    expect(within(dialog).getByText("Bản mô phỏng")).toBeTruthy();
    expect(within(dialog).getByText(/3 tool sẵn sàng gắn vào agent/)).toBeTruthy();
    for (const n of ["list_orders", "get_order", "create_order"]) expect(within(dialog).getByText(`api-order-service__${n}`)).toBeTruthy();
    const [, payload] = log.mock.calls.find(c => String(c[0]).includes("api-connectors"))!;
    expect(payload.headers).toEqual({ "X-API-Key": "••••••" });
    log.mockRestore();
  });

  it("errors stay hidden until touched or save; save focuses the first error", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Xóa form" }));
    expect(screen.queryByText("Vui lòng nhập tên tool kit.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Tạo tool kit/ }));
    expect(await screen.findByText(/Còn 2 lỗi cần sửa trước khi lưu\./)).toBeTruthy();
    expect(screen.getByText("Vui lòng nhập tên tool kit.")).toBeTruthy();
    expect(screen.getByText("Vui lòng nhập Base URL.")).toBeTruthy();
    await act(() => new Promise(r => setTimeout(r, 120)));
    expect(document.activeElement?.getAttribute("data-field")).toBe("name");
  });

  it("delete shows an undo toast that restores the operation", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Xóa list_orders" }));
    expect(opRows()).toHaveLength(2);
    fireEvent.click(await screen.findByRole("button", { name: "Hoàn tác" }));
    expect(opRows()).toHaveLength(3);
    expect(opRows()[0].textContent).toContain("list_orders");
  });

  it("duplicate adds a _copy right after", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Nhân bản get_order" }));
    expect([...opRows()].map(r => r.textContent)[2]).toContain("get_order_copy");
  });

  it("path blur auto-adds missing path params", () => {
    mount();
    const path = document.querySelector<HTMLInputElement>('[data-field$=".path"]')!;
    fireEvent.change(path, { target: { value: "/orders/{order_id}/lines/{line_id}" } });
    expect(screen.getByText(/Path có/)).toBeTruthy();
    fireEvent.blur(path);
    expect(screen.queryByText(/Path có/)).toBeNull();
    expect(document.querySelector<HTMLTextAreaElement>('[data-field$=".params"]')!.value).toContain("line_id");
  });

  it("Dán JSON: sample payload -> back to Nhập tay", async () => {
    mount();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Dán JSON/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Dán JSON/ }));
    expect(screen.queryByRole("button", { name: /Tạo tool kit/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dán payload mẫu" }));
    fireEvent.click(screen.getByRole("button", { name: "Phân tích" }));
    expect(await screen.findByText("Đã nạp payload vào form.")).toBeTruthy();
    expect(opRows()).toHaveLength(3);
  });

  it("Import OpenAPI: sample file -> preview -> 3 selected ops into the form", async () => {
    mount();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Import OpenAPI/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Import OpenAPI/ }));
    fireEvent.click(screen.getByRole("button", { name: "Dùng file mẫu" }));
    expect(screen.getByText("Xem trước import")).toBeTruthy();
    expect(screen.getByText("Đã chọn 4 / 4")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    fireEvent.click(screen.getByRole("checkbox", { name: "Chọn delete_products_sku" }));
    fireEvent.click(screen.getByRole("button", { name: "Đưa 3 operation vào form" }));
    expect(await screen.findByText("Đã đưa 3 operation vào form.")).toBeTruthy();
    expect(opRows()).toHaveLength(3);
    expect((screen.getByLabelText(/Tên tool kit/) as HTMLInputElement).value).toBe("Inventory Service");
  });
});
