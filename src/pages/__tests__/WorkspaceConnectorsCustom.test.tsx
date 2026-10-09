import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

async function openCustomTab(emptyStores: boolean) {
  sessionStorage.clear();
  if (emptyStores) {
    // Mark both stores as already seeded but empty.
    sessionStorage.setItem("custom_connector_store_seeded_v1", "1");
    sessionStorage.setItem("custom_connector_store_v1", "[]");
    for (const k of ["custom_api_tool_store_seeded_v1", "custom_api_tool_store_seeded_v2"]) sessionStorage.setItem(k, "1");
  }
  vi.resetModules();
  const { default: WorkspaceConnectors } = await import("../WorkspaceConnectors");
  const { customApiToolStore } = await import("@/components/configure/customApiToolStore");
  const { OrgProvider } = await import("../organization/orgStore");
  const { RolesProvider } = await import("../organization/rolesStore");
  const { ConflictsProvider } = await import("../organization/conflictsStore");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  if (emptyStores) for (const t of customApiToolStore.list()) customApiToolStore.remove?.(t.id);
  render(<TooltipProvider><RolesProvider><OrgProvider><ConflictsProvider><MemoryRouter><WorkspaceConnectors /></MemoryRouter></ConflictsProvider></OrgProvider></RolesProvider></TooltipProvider>);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Custom Connectors" }));
  fireEvent.click(screen.getByRole("tab", { name: "Custom Connectors" }));
}

describe("Custom Connectors tab", () => {
  it("toolbar has search + add button, and no status/ownership pills", async () => {
    await openCustomTab(false);
    expect(screen.getByPlaceholderText("Tìm Custom Connectors…")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Thêm custom connector/ }).length).toBeGreaterThan(0);
    for (const t of ["Đã kết nối 1", "Chưa kết nối", "Của tôi", "Được chia sẻ", "Hệ thống"]) {
      expect(screen.queryByRole("button", { name: new RegExp(`^${t}`) }), t).toBeNull();
    }
    expect(screen.queryByText("FCI CRM")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Quản lý" }).length).toBeGreaterThan(0);
  });

  it("search filters the cards", async () => {
    await openCustomTab(false);
    fireEvent.change(screen.getByPlaceholderText("Tìm Custom Connectors…"), { target: { value: "zzzz-none" } });
    expect(screen.getByText("Không tìm thấy connector nào.")).toBeTruthy();
  });

  it("empty state, and adding an MCP server from it fills the list", async () => {
    await openCustomTab(true);
    expect(screen.getByText("Chưa có Custom Connector nào")).toBeTruthy();
    expect(screen.getByText("Thêm một MCP server để cấp thêm tool cho agent của bạn.")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: /Thêm custom connector/ });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(screen.queryByRole("menuitem", { name: /API Tool/ })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: /MCP tùy chỉnh/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Tên"), { target: { value: "new-srv" } });
    fireEvent.change(within(dialog).getByLabelText("URL"), { target: { value: "https://x.io/mcp" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu server" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Chưa có Custom Connector nào")).toBeNull();
    expect(screen.getByText("new-srv")).toBeTruthy();
    expect(screen.getByText("https://x.io/mcp")).toBeTruthy();
  });
});
