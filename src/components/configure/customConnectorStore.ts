// sessionStorage-backed CONSOLE-level Custom Connector store — tracks self-added ("Custom MCP")
// connector definitions a builder registers so their Agents can use that MCP server's tools.
// Scope is deliberately narrow: this store only ever holds CUSTOM connectors a user added
// themselves — the built-in Marketplace catalog (src/pages/WorkspaceConnectors.tsx's CONNECTORS)
// and the Agent-level "Kết nối" catalog (ConnectionsTab.tsx's CATALOG) are unrelated, fixed lists
// and never touch this store. Mirrors guardrailConsoleStore.ts's ownership/sharing/attached-agent
// bookkeeping field-for-field, since Knowledge is the reference pattern every shareable
// Console-level resource in this product follows: private-by-default, explicit share to Console.
import { loadMap, saveMap } from "@/lib/sessionPersist";
import { CURRENT_USER } from "@/components/knowledge/knowledgeBaseStore";
import type { Sharing } from "./customConnectorSharing";
import { discoverMcp, needsAuthorization, type McpTool } from "./mcpDiscovery";

export type ConnectorAuthType = "none" | "static_headers" | "oauth_auto" | "oauth_manual";

/** OAuth 2.1 settings. "oauth_auto" discovers the endpoints from the server itself (RFC 9728 /
 * RFC 8414) and registers a client (RFC 7591), so only the optional advanced fields apply;
 * "oauth_manual" is for servers that publish neither, so the Builder pastes them in. */
export interface ConnectorOAuth {
  authorizeUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
}

export interface ConnectorHeader {
  key: string;
  value: string;
}

export interface CustomConnector {
  id: string;
  name: string;
  url: string;
  authType: ConnectorAuthType;
  /** static_headers only */
  headers: ConnectorHeader[];
  /** oauth_auto / oauth_manual only */
  oauth?: ConnectorOAuth;
  /** What the last connect / "Sync" learned from the server (see mcpDiscovery.ts). */
  serverInfo?: { name: string; version: string };
  tools?: McpTool[];
  lastSyncedAt?: number;
  ownerId: string;
  ownerName: string;
  sharing: Sharing;
  /** Agent ids currently attaching this custom connector — drives the Delete warning
   * ("N Agent đang dùng custom connector này và sẽ mất..."). */
  attachedByAgentIds: string[];
  /** Agent this resource was created in. Kept after it is shared to the Space, so the Space
   * "Ai được dùng" popup still shows the "Chia sẻ lên Space" switch: turning it off moves the
   * resource back into that Agent. Unset for resources created in the Space library. */
  originAgentId?: string;
  createdAt: number;
  updatedAt: number;
  /** Set when the resource was deleted from the Space library ("Xóa" on Space). The record is
   * kept so Agents still linking it can show it as "Đã bị xóa" (and stay unpublishable until
   * they detach it). `keptForAgentId`: created in that Agent, which keeps using it; every other
   * Agent loses it. Unset `keptForAgentId`: gone for every Agent. Sharing it again (from the
   * Agent that kept it) puts it back on the Space. */
  deletedFromSpace?: {
    at: number; byId: string; byName: string; keptForAgentId?: string;
    /** "Gỡ khỏi Space" / "Chỉ Agent này": the resource went back into this Agent (other Agents
     * linking it show "Không khả dụng - Đã được kéo về Agent …"). Unset: deleted for good. */
    takenBackTo?: string;
  };
}

function cleanOAuth(o?: ConnectorOAuth): ConnectorOAuth {
  const out: ConnectorOAuth = {};
  for (const k of ["authorizeUrl", "tokenUrl", "clientId", "clientSecret", "scope"] as const) {
    const v = o?.[k]?.trim();
    if (v) out[k] = v;
  }
  return out;
}

export const CONNECTOR_AUTH_LABEL: Record<ConnectorAuthType, string> = {
  none: "Không xác thực",
  static_headers: "Static Headers",
  oauth_auto: "OAuth 2.1 (Auto)",
  oauth_manual: "OAuth 2.1 (Manual)",
};

const STORE_KEY = "custom_connector_store_v1";
const SEEDED_KEY = "custom_connector_store_seeded_v1";
const store = loadMap<string, CustomConnector>(STORE_KEY);
const persist = () => saveMap(STORE_KEY, store);

function seed() {
  if (sessionStorage.getItem(SEEDED_KEY)) return;
  sessionStorage.setItem(SEEDED_KEY, "1");
  const now = Date.now();
  const DAY = 86_400_000;
  const put = (c: CustomConnector) => store.set(c.id, c);

  // Owned by current user — private (default), already attached to an Agent so the delete
  // warning has something real to show.
  put({
    id: "cc-1", name: "internal-crm-mcp", url: "https://mcp.internal.fpt.com/crm",
    authType: "static_headers", headers: [{ key: "Authorization", value: "Bearer ••••••••" }],
    ownerId: CURRENT_USER.id, ownerName: CURRENT_USER.name,
    sharing: { mode: "all", people: [] },
    attachedByAgentIds: ["cskh"],
    createdAt: now - 14 * DAY, updatedAt: now - 2 * 3_600_000,
  });

  // Owned by current user — shared to all Console users
  put({
    id: "cc-2", originAgentId: "nightly-report", name: "finance-reporting-mcp", url: "https://mcp.finance.fpt.com/reports",
    authType: "none", headers: [],
    ownerId: CURRENT_USER.id, ownerName: CURRENT_USER.name,
    sharing: { mode: "all", people: [] },
    attachedByAgentIds: [],
    createdAt: now - 8 * DAY, updatedAt: now - DAY,
  });

  // Owned by someone else, private, never shared to current user — proves the sharing model
  // actually hides something, mirroring knowledgeBaseStore.ts's kb-7.
  put({
    id: "cc-3", name: "legal-search-mcp", url: "https://mcp.legal.fpt.com/search",
    authType: "none", headers: [],
    ownerId: "m-fsoft-vn-1", ownerName: "Duy Nguyen",
    sharing: { mode: "all", people: [] },
    attachedByAgentIds: [],
    createdAt: now - 20 * DAY, updatedAt: now - 20 * DAY,
  });

  persist();
}

export const customConnectorStore = {
  list(): CustomConnector[] {
    seed();
    return [...store.values()].filter(c => !c.deletedFromSpace).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  get(id: string): CustomConnector | undefined {
    seed();
    return store.get(id);
  },
  isDuplicateName(name: string, excludeId?: string): boolean {
    const n = name.trim().toLowerCase();
    return this.list().some(c => c.id !== excludeId && c.name.trim().toLowerCase() === n);
  },
  create(data: { name: string; url: string; authType: ConnectorAuthType; headers: ConnectorHeader[]; oauth?: ConnectorOAuth; sharing: Sharing }): CustomConnector {
    const id = `cc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    const c: CustomConnector = {
      id, name: data.name.trim(), url: data.url.trim(), authType: data.authType,
      headers: data.authType === "static_headers" ? data.headers.filter(h => h.key.trim()) : [],
      oauth: data.authType.startsWith("oauth") ? cleanOAuth(data.oauth) : undefined,
      ownerId: CURRENT_USER.id, ownerName: CURRENT_USER.name, sharing: data.sharing,
      attachedByAgentIds: [], createdAt: now, updatedAt: now,
    };
    store.set(id, c);
    persist();
    return this.sync(id) ?? c;
  },
  /** Re-reads the server's name/version and tool list ("Sync"). Keeps the permission a tool already
   * had, so syncing never silently loosens an Ask back to Auto. OAuth servers expose no tools until
   * authorised, so they sync to an empty list. */
  sync(id: string): CustomConnector | undefined {
    const cur = store.get(id);
    if (!cur) return undefined;
    const found = discoverMcp(cur.url);
    const prev = new Map((cur.tools ?? []).map(t => [t.name, t.permission]));
    const tools = needsAuthorization(cur) ? [] : found.tools.map(t => ({ ...t, permission: prev.get(t.name) ?? t.permission }));
    const next = { ...cur, serverInfo: found.server, tools, lastSyncedAt: Date.now() };
    store.set(id, next);
    persist();
    return next;
  },
  /** First sync on demand — connectors created before discovery existed have no tools yet. */
  ensureSynced(id: string): CustomConnector | undefined {
    const cur = store.get(id);
    return cur && !cur.lastSyncedAt ? this.sync(id) : cur;
  },
  updateSharing(id: string, sharing: Sharing) {
    const cur = store.get(id);
    if (!cur) return;
    store.set(id, { ...cur, sharing, deletedFromSpace: sharing.mode === "private" ? cur.deletedFromSpace : undefined, updatedAt: Date.now() });
    persist();
  },
  /** "Xóa" on the Space library - see deletedFromSpace. */
  removeFromSpace(id: string, by: { id: string; name: string }, keptForAgentId?: string, takenBackTo?: string) {
    const cur = store.get(id);
    if (!cur) return;
    store.set(id, { ...cur, sharing: { mode: "private", people: [] }, deletedFromSpace: { at: Date.now(), byId: by.id, byName: by.name, keptForAgentId, takenBackTo }, updatedAt: Date.now() });
    persist();
  },
  /** Records the Agent a resource was first created in (see originAgentId). */
  setOriginAgent(id: string, agentId: string) {
    const cur = store.get(id);
    if (!cur || cur.originAgentId) return;
    store.set(id, { ...cur, originAgentId: agentId });
    persist();
  },
  /** Edits an existing Custom Connector's connection details (Name/URL/Authentication). Sharing
   * is intentionally left untouched here — that's still the separate "Chia sẻ" modal's job — so
   * editing connection details never accidentally changes who can see the connector. */
  update(id: string, data: { name: string; url: string; authType: ConnectorAuthType; headers: ConnectorHeader[]; oauth?: ConnectorOAuth }) {
    const cur = store.get(id);
    if (!cur) return;
    store.set(id, {
      ...cur,
      name: data.name.trim(),
      url: data.url.trim(),
      authType: data.authType,
      headers: data.authType === "static_headers" ? data.headers.filter(h => h.key.trim()) : [],
      oauth: data.authType.startsWith("oauth") ? cleanOAuth(data.oauth) : undefined,
      updatedAt: Date.now(),
    });
    persist();
  },
  remove(id: string) {
    store.delete(id);
    persist();
  },
  addAttachingAgent(id: string, agentId: string) {
    const cur = store.get(id);
    if (!cur || cur.attachedByAgentIds.includes(agentId)) return;
    store.set(id, { ...cur, attachedByAgentIds: [...cur.attachedByAgentIds, agentId] });
    persist();
  },
  removeAttachingAgent(id: string, agentId: string) {
    const cur = store.get(id);
    if (!cur) return;
    store.set(id, { ...cur, attachedByAgentIds: cur.attachedByAgentIds.filter(a => a !== agentId) });
    persist();
  },
};
