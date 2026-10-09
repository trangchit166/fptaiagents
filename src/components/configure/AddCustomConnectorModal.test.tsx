import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import AddCustomConnectorModal from "./AddCustomConnectorModal";
import { customConnectorStore } from "./customConnectorStore";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const setup = () => {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(<AddCustomConnectorModal onClose={onClose} onCreated={onCreated} />);
  return { onCreated, onClose };
};
const type = (label: string | RegExp, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });

describe("Thêm MCP tùy chỉnh", () => {
  it("has the spec'd header, fields, auth options (default none) and footer", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Thêm MCP tùy chỉnh" })).toBeTruthy();
    expect(screen.getByText("Kết nối một MCP server để cấp các tool của nó cho agent.")).toBeTruthy();
    expect(screen.getByPlaceholderText("my-mcp-server")).toBe(document.activeElement);
    expect(screen.getByPlaceholderText("https://api.example.com/mcp")).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios.map(r => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false"]);
    for (const l of ["Không xác thực", "Static Headers", "OAuth 2.1 (Auto)", "OAuth 2.1 (Manual)"]) expect(screen.getByLabelText(l)).toBeTruthy();
    expect(screen.getByText(/OAuth 2.1 \(Tự động\) sẽ đọc metadata/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hủy" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lưu server" })).toBeTruthy();
  });

  it("validates name and URL inline", () => {
    const { onCreated } = setup();
    fireEvent.blur(screen.getByLabelText("Tên"));
    expect(screen.queryByText("Vui lòng nhập tên.")).toBeNull();
    type("URL", "not a url"); fireEvent.blur(screen.getByLabelText("URL"));
    expect(screen.getByText("Nhập một URL http(s) hợp lệ.")).toBeTruthy();
    type("URL", "");
    fireEvent.click(screen.getByRole("button", { name: "Lưu server" }));
    expect(screen.getByText("Vui lòng nhập tên.")).toBeTruthy();
    expect(screen.getByText("Vui lòng nhập URL.")).toBeTruthy();
    type("Tên", "x"); type("URL", "ftp://bad");
    fireEvent.click(screen.getByRole("button", { name: "Lưu server" }));
    expect(screen.getByText("Nhập một URL http(s) hợp lệ.")).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("Static Headers: one empty row, eye toggle, trash, dashed add", () => {
    setup();
    fireEvent.click(screen.getByLabelText("Static Headers"));
    expect(screen.getByText("Headers (tuỳ chọn)")).toBeTruthy();
    expect(screen.getAllByPlaceholderText("Authorization")).toHaveLength(1);
    const value = screen.getByPlaceholderText("Bearer …") as HTMLInputElement;
    expect(value.type).toBe("password");
    fireEvent.click(screen.getByLabelText("Hiện giá trị"));
    expect(value.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: /Thêm header/ }));
    expect(screen.getAllByPlaceholderText("Authorization")).toHaveLength(2);
    fireEvent.click(screen.getAllByLabelText("Xoá header")[0]);
    expect(screen.getAllByPlaceholderText("Authorization")).toHaveLength(1);
    expect(screen.getByText(/Key dùng chung cho cả workspace/)).toBeTruthy();
  });

  it("OAuth Auto swaps the help text and has a closed 'Nâng cao'", () => {
    setup();
    fireEvent.click(screen.getByLabelText("OAuth 2.1 (Auto)"));
    expect(screen.getByText(/RFC 9728, RFC 8414/)).toBeTruthy();
    expect(screen.queryByText(/OAuth 2.1 \(Tự động\) sẽ đọc metadata/)).toBeNull();
    expect(screen.queryByLabelText("Scope (không bắt buộc)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Nâng cao/ }));
    expect(screen.getByLabelText("Scope (không bắt buộc)")).toBeTruthy();
  });

  it("OAuth Manual requires Authorize URL, Token URL, Client ID, then saves", () => {
    const { onCreated } = setup();
    type("Tên", "manual-srv"); type("URL", "https://mcp.example.com/mcp");
    fireEvent.click(screen.getByLabelText("OAuth 2.1 (Manual)"));
    expect(screen.getByText(/Dành cho server không công bố metadata/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lưu server" }));
    expect(screen.getByText("Vui lòng nhập Authorize URL.")).toBeTruthy();
    expect(screen.getByText("Vui lòng nhập Token URL.")).toBeTruthy();
    expect(screen.getByText("Vui lòng nhập Client ID.")).toBeTruthy();
    type("Authorize URL", "https://auth.example.com/authorize");
    type("Token URL", "https://auth.example.com/token");
    type("Client ID", "abc");
    fireEvent.click(screen.getByRole("button", { name: /Nâng cao/ }));
    expect(screen.getByText(/PKCE đã bảo vệ public client/)).toBeTruthy();
    type("Scope (không bắt buộc)", "read write");
    fireEvent.click(screen.getByRole("button", { name: "Lưu server" }));
    expect(onCreated).toHaveBeenCalledTimes(1);
    const saved = customConnectorStore.list().find(c => c.name === "manual-srv")!;
    expect(saved.authType).toBe("oauth_manual");
    expect(saved.oauth).toEqual({ authorizeUrl: "https://auth.example.com/authorize", tokenUrl: "https://auth.example.com/token", clientId: "abc", scope: "read write" });
  });
});
