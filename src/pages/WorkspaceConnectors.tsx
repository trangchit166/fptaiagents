import { useState, useMemo, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SpaceDeleteDialog, performSpaceDelete, spaceDeleteLabel, SpaceUnshareDialog, notifySpaceOwner, useSpaceActor } from "@/components/governance/spaceDelete";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Search, CheckCircle2, ChevronRight, ChevronDown, Plug, MoreVertical, AlertTriangle, X, Rocket, Globe, BarChart3, Plus, Server, Layers, type LucideIcon } from "lucide-react";
import RequestPublishModal from "@/components/governance/RequestPublishModal";
import { governanceStore } from "@/components/governance/governanceStore";
import { StatusBadge } from "@/components/governance/governanceUi";
import { resourceBlockStore } from "@/components/governance/resourceBlockStore";
import { useGroupAccess, isOwnedOrShared } from "@/pages/organization/scopeAccess";
import { CURRENT_USER } from "@/components/knowledge/knowledgeBaseStore";
import { customConnectorStore, CONNECTOR_AUTH_LABEL, type CustomConnector } from "@/components/configure/customConnectorStore";
import { isAccessibleTo as isCustomConnectorAccessibleTo } from "@/components/configure/customConnectorSharing";
import AddCustomConnectorModal from "@/components/configure/AddCustomConnectorModal";
import CustomConnectorShareModal from "@/components/configure/CustomConnectorShareModal";
import { customApiToolStore, AUTH_TYPE_LABEL, type CustomApiTool, type HttpMethod } from "@/components/configure/customApiToolStore";
import AddCustomApiToolModal from "@/components/configure/AddCustomApiToolModal";
import { getAgent } from "@/components/configure/agentStore";
import { useMyPermissions } from "@/pages/organization/useMyPermissions";
import AgentResourceDetailModal from "@/components/configure/AgentResourceDetailModal";
import {
  isShared, ownershipTags,
  type OwnershipTag,
} from "@/components/governance/resourceOwnership";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

/* ─── Types ─────────────────────────────────────────── */
type Tab = "all" | "connected" | "available";
/** Top-level split, mirroring the real product's "Marketplace Connectors" / "Custom Connectors"
 * tabs at console-agents.fpt.ai/connectors. "Custom" is scoped ONLY to self-added (Custom MCP)
 * connectors — the Marketplace tab below is entirely unrelated pre-built catalog and is untouched
 * by this split. */
type Section = "marketplace" | "custom";

interface Connector {
  id: string;
  name: string;
  desc: string;
  /** Plain display tag shown on the card footer (e.g. "Analytics", "Productivity") per the
   * Oct 2026 Marketplace redesign — the flat 3-col grid has no category grouping anymore, so
   * this is no longer matched against a CATEGORIES lookup. */
  category: string;
  connected: boolean;
  soon: boolean;
  requestedBy?: string[];
  /** Only meaningful once `connected` — who set up this workspace connection, and who else it
   * was explicitly shared with. An unconnected catalog entry isn't anyone's resource yet, so
   * it's never restricted by Scope; only established connections are. */
  ownerId?: string;
  sharedWith?: string[];
  /** How to render the card's logo tile: a real brand image, the shared FPT 3-color mark (for
   * the internal FCI toolkits, which have no public logo), or a Lucide icon placeholder. */
  logoKind: "image" | "fpt" | "icon";
  logo?: string;
  icon?: LucideIcon;
  iconBg?: string;
  iconColor?: string;
}

/* ─── Logo URLs ──────────────────────────────────────── */
const LOGO: Record<string, string> = {
  outlook:    "https://upload.wikimedia.org/wikipedia/commons/d/df/Microsoft_Office_Outlook_%282018%E2%80%93present%29.svg",
  sharepoint: "https://upload.wikimedia.org/wikipedia/commons/e/e1/Microsoft_Office_SharePoint_%282018%E2%80%93present%29.svg",
  onedrive:   "https://upload.wikimedia.org/wikipedia/commons/3/3c/Microsoft_Office_OneDrive_%282019%E2%80%93present%29.svg",
  gmail:      "https://upload.wikimedia.org/wikipedia/commons/7/7e/Gmail_icon_%282020%29.svg",
  slack:      "https://upload.wikimedia.org/wikipedia/commons/d/d5/Slack_icon_2019.svg",
  notion:     "https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png",
  github:     "https://upload.wikimedia.org/wikipedia/commons/9/91/Octicons-mark-github.svg",
  figma:      "https://upload.wikimedia.org/wikipedia/commons/3/33/Figma-logo.svg",
  linear:     "https://asset.brandfetch.io/idFdo8ulhr/idg1AZBV8h.png",
  supabase:   "https://upload.wikimedia.org/wikipedia/commons/b/b8/Supabase_Logo.svg",
  vercel:     "https://upload.wikimedia.org/wikipedia/commons/5/5e/Vercel_logo_black.svg",
  openai:     "https://upload.wikimedia.org/wikipedia/commons/4/4d/OpenAI_Logo.svg",
  discord:    "https://upload.wikimedia.org/wikipedia/commons/9/98/Discord_logo.svg",
  zoom:       "https://upload.wikimedia.org/wikipedia/commons/1/11/Zoom_Logo_2022.svg",
  telegram:   "https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg",
  teams:      "https://upload.wikimedia.org/wikipedia/commons/c/c9/Microsoft_Office_Teams_%282018%E2%80%93present%29.svg",
  twilio:     "https://upload.wikimedia.org/wikipedia/commons/7/7e/Twilio-logo-red.svg",
  sheets:     "https://upload.wikimedia.org/wikipedia/commons/a/ae/Google_Sheets_2020_Logo.svg",
  stripe:     "https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg",
  salesforce: "https://upload.wikimedia.org/wikipedia/commons/f/f9/Salesforce.com_logo.svg",
  clickup:    "https://upload.wikimedia.org/wikipedia/commons/3/37/ClickUp_Logo.png",
  trello:     "https://upload.wikimedia.org/wikipedia/commons/1/13/Trello-logo.svg",
  dropbox:    "https://upload.wikimedia.org/wikipedia/commons/7/74/Dropbox_logo_2017.svg",
  gdrive:     "https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg",
  gitlab:     "https://upload.wikimedia.org/wikipedia/commons/e/e1/GitLab_logo.svg",
  gcalendar:  "https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg",
};

/* ─── Seed data (Marketplace Connectors) ─────────────── */
const CONNECTORS: Connector[] = [
  {
    id: "datasuite", name: "DataSuite", category: "Analytics",
    desc: "FPT Cloud DataSuite BI: quản lý dataset, xây dựng và đọc dashboard, trang và biểu đồ, chạy truy vấn OLAP cube, sao chép hoặc dùng mẫu báo cáo. Kết nối bằng session token của DataSuite (Authorization: Bearer <JWT>).",
    connected: false, soon: false,
    logoKind: "icon", icon: BarChart3, iconBg: "bg-blue-50 border-blue-200", iconColor: "text-blue-600",
  },
  {
    id: "fci-crm", name: "FCI CRM", category: "Productivity",
    desc: "Đọc dữ liệu khách hàng/CRM từ hệ thống FCI CRM (vtiger): liệt kê module, mô tả field và chạy truy vấn SQL chỉ-đọc. Là 1 trong 3 toolkit FCI ĐỘC LẬP, dùng credential username + access-key riêng.",
    connected: false, soon: false, logoKind: "fpt",
  },
  {
    id: "fci-member", name: "FCI Member", category: "Productivity",
    desc: "Onboarding thành viên (nhân viên/cộng tác viên) trong hệ thống FCI HR: tạo member và kiểm tra trạng thái member. Là 1 trong 3 toolkit FCI ĐỘC LẬP, dùng credential api-key riêng.",
    connected: false, soon: false, logoKind: "fpt",
  },
  {
    id: "fci-tickets", name: "FCI Tickets", category: "Ticketing",
    desc: "Phiếu yêu cầu dịch vụ và quy trình duyệt trong FCI (FPT SMS): tạo, hủy và tra cứu ticket. Là 1 trong 3 toolkit FCI ĐỘC LẬP, dùng credential S-Token riêng.",
    connected: false, soon: false, logoKind: "fpt",
  },
  {
    id: "onedrive", name: "OneDrive", category: "Documents",
    desc: "Duyệt, tải xuống, chỉnh sửa và chia sẻ file trên Microsoft OneDrive.",
    connected: false, soon: false, logoKind: "image", logo: LOGO.onedrive,
  },
  {
    id: "outlook", name: "Outlook", category: "Email",
    desc: "Đọc, tìm kiếm và gửi email từ hộp thư Microsoft 365 Outlook của bạn.",
    connected: false, soon: false, logoKind: "image", logo: LOGO.outlook,
  },
  {
    id: "sharepoint", name: "SharePoint", category: "Documents",
    desc: "Duyệt, tìm kiếm và đọc file cùng dữ liệu Excel trên Microsoft 365 SharePoint / OneDrive của bạn.",
    connected: true, soon: false, ownerId: CURRENT_USER.id,
    logoKind: "image", logo: LOGO.sharepoint,
  },
  {
    id: "tavily", name: "Tavily", category: "Web Search",
    desc: "Tìm kiếm web và crawl site bằng Tavily, dùng API key Tavily riêng của tenant (toàn bộ chi phí tính vào key đó). Kết nối bằng Tavily API key (tvly-…).",
    connected: false, soon: false,
    logoKind: "icon", icon: Globe, iconBg: "bg-teal-50 border-teal-200", iconColor: "text-teal-600",
  },
];

const MARKETPLACE_TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "connected", label: "Đã kết nối" },
  { key: "available", label: "Chưa kết nối" },
];

/* ─── Main page ──────────────────────────────────────── */
export default function WorkspaceConnectors() {
  const access = useGroupAccess("connectors");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>(searchParams.get("section") === "custom" ? "custom" : "marketplace");
  const [tab, setTab]     = useState<Tab>("all");
  const [query, setQuery] = useState("");

  // Custom Connectors section state — kept separate from the Marketplace tab/query state above
  // since the two lists are unrelated data sources.
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  void tick;
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [publishTarget, setPublishTarget] = useState<CustomConnector | null>(null);
  const [editTarget, setEditTarget] = useState<CustomConnector | null>(null);
  const [shareTarget, setShareTarget] = useState<CustomConnector | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomConnector | null>(null);
  // API Tool — a separate "Custom Tool" kind (a single REST endpoint definition) alongside
  // Custom MCP connectors above, with the same sharing / in-use rules.
  const [shareApiToolTarget, setShareApiToolTarget] = useState<CustomApiTool | null>(null);
  const { can } = useMyPermissions();
  const canCreateConnector = can("connectors.create");
  // Owner, or a Space Admin (may turn sharing off / delete anyone's connector or API Tool).
  const actor = useSpaceActor();
  const manages = (ownerId?: string) => actor.isAdmin || ownerId === CURRENT_USER.id;
  const [editApiToolTarget, setEditApiToolTarget] = useState<CustomApiTool | null>(null);
  const [deleteApiToolTarget, setDeleteApiToolTarget] = useState<CustomApiTool | null>(null);
  const [unshareTarget, setUnshareTarget] = useState<{ kind: "connector"; c: CustomConnector } | { kind: "apiTool"; a: CustomApiTool } | null>(null);
  const unshareRes = unshareTarget ? (unshareTarget.kind === "connector" ? unshareTarget.c : unshareTarget.a) : null;
  const [customQuery, setCustomQuery] = useState("");
  // Clicking a custom connector card shows its details (same popup as in an Agent's Instructions).
  const [detailConnectorId, setDetailConnectorId] = useState<string | null>(null);
  const [detailApiToolId, setDetailApiToolId] = useState<string | null>(null);


  // Marketplace connector cards — `connectedIds` is a session-local override on top of the
  // static seed array so "Kết nối" / "Ngắt kết nối" (from the detail modal) actually do
  // something, without standing up a full persisted store for a static seed array.
  const [detailTarget, setDetailTarget] = useState<Connector | null>(null);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(
    () => new Set(CONNECTORS.filter(c => c.connected).map(c => c.id)),
  );
  const effectiveConnectors = useMemo(
    () => CONNECTORS.map(c => ({ ...c, connected: connectedIds.has(c.id) })),
    [connectedIds],
  );
  const customConnectors = customConnectorStore.list();
  const accessibleCustomConnectors = actor.isAdmin ? customConnectors : customConnectors.filter(c => isCustomConnectorAccessibleTo(c.sharing, c.ownerId, CURRENT_USER.id));
  // Custom section = MCP servers and API Tools people added themselves. The internal FCI toolkits
  // live in the Marketplace tab only.
  type CustomItem =
    | { kind: "custom"; c: CustomConnector; tags: OwnershipTag[] }
    | { kind: "apitool"; a: CustomApiTool; tags: OwnershipTag[] };
  const customApiTools = actor.isAdmin ? customApiToolStore.list() : customApiToolStore.listAccessible(CURRENT_USER.id);
  const customItems: CustomItem[] = [
    ...accessibleCustomConnectors.map(c => ({ kind: "custom" as const, c, tags: ownershipTags({ ownerId: c.ownerId, sharing: c.sharing, userId: CURRENT_USER.id, admin: actor.isAdmin }) })),
    ...customApiTools.map(a => ({ kind: "apitool" as const, a, tags: ownershipTags({ ownerId: a.ownerId, sharing: a.sharing, userId: CURRENT_USER.id, admin: actor.isAdmin }) })),
  ];
  const cq = customQuery.trim().toLowerCase();
  const customFiltered = !cq ? customItems : customItems.filter(i => {
    const hay = i.kind === "custom" ? `${i.c.name} ${i.c.url}` : `${i.a.name} ${i.a.url} ${i.a.description}`;
    return hay.toLowerCase().includes(cq);
  });

  // Only an established connection is really "someone's resource" — browsing the catalog of
  // not-yet-connected services is never restricted. A role whose Connectors View Scope is
  // "Own & Shared" (or with no View permission at all) only sees connections it set up or that
  // were shared with it.
  const isConnectorVisible = (c: Connector) =>
    !c.connected || access.canSeeAll || isOwnedOrShared(c, access.userId);

  const visibleConnectors = useMemo(
    () => effectiveConnectors.filter(isConnectorVisible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveConnectors, access.canSeeAll, access.userId],
  );
  const tabCounts: Record<Tab, number> = {
    all: visibleConnectors.length,
    connected: visibleConnectors.filter(c => c.connected).length,
    available: visibleConnectors.filter(c => !c.connected).length,
  };

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return visibleConnectors.filter(c => {
      if (tab === "connected" && !c.connected) return false;
      if (tab === "available" && c.connected) return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.desc.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tab, query, visibleConnectors]);

  const handleConnect = (c: Connector) => {
    setConnectedIds(prev => new Set(prev).add(c.id));
    toast.success(`Đã kết nối ${c.name}.`);
  };

  return (
    <div className="px-8 py-8 max-w-[1200px] mx-auto animate-fade-up">
      {/* Page header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="w-11 h-11 rounded-xl bg-primary-soft border border-primary/20 flex items-center justify-center shrink-0">
          <Plug size={20} className="text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">Kết nối</h1>
          <p className="text-sm text-muted-foreground line-clamp-2 max-w-2xl">
            Kết nối Agent với Marketplace Connectors, Custom Connectors và các hệ thống bên ngoài để truy vấn dữ liệu và thực thi hành động.
          </p>
        </div>
      </div>

      {/* Marketplace / Custom split — segmented control */}
      <Tabs value={section} onValueChange={v => setSection(v as Section)} className="mb-6">
        <TabsList className="h-auto p-1 rounded-xl bg-surface-muted">
          <TabsTrigger
            value="marketplace"
            className="rounded-lg px-4 h-8 text-sm font-medium text-muted-foreground data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            Marketplace Connectors
          </TabsTrigger>
          <TabsTrigger
            value="custom"
            className="rounded-lg px-4 h-8 text-sm font-medium text-muted-foreground data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            Custom Connectors
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {section === "marketplace" && (
        <>
          {/* Toolbar: search (left) + status filter pills (right) */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
            <div className="relative w-full md:w-[360px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Tìm Marketplace Connectors…"
                className="h-10 w-full pl-9 pr-3 rounded-lg bg-surface-muted border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <div className="flex items-center gap-2">
              {MARKETPLACE_TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`h-8 pl-3 pr-2 rounded-full border text-sm font-medium flex items-center gap-1.5 transition-base ${
                    tab === t.key ? "bg-primary-soft border-primary/30 text-primary" : "border-border text-muted-foreground hover:bg-surface-muted"
                  }`}
                >
                  {t.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? "bg-primary/10" : "bg-surface-sunken"}`}>
                    {tabCounts[t.key]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Card grid */}
          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map(c => (
                <MarketplaceConnectorCard
                  key={c.id}
                  connector={c}
                  onConnect={() => handleConnect(c)}
                  onManage={() => setDetailTarget(c)}
                />
              ))}
            </div>
          ) : (
            <div className="py-20 text-center text-muted-foreground text-sm">Không tìm thấy connector nào.</div>
          )}
        </>
      )}

      {section === "custom" && (
        <div>
          {/* Toolbar: search (left) + add (right). No status filter pills on this tab. */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
            <div className="relative w-full md:w-[320px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={customQuery}
                onChange={e => setCustomQuery(e.target.value)}
                placeholder="Tìm Custom Connectors…"
                aria-label="Tìm Custom Connectors"
                className="h-10 w-full pl-9 pr-3 rounded-lg bg-surface-muted border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <AddCustomConnectorMenu
              disabled={!canCreateConnector}
              disabledReason="Vai trò của bạn chưa có quyền tạo connector."
              onPickMcp={() => canCreateConnector && setShowAddCustom(true)}
              onPickToolkit={() => canCreateConnector && navigate("/connectors/custom/toolkits/new")}
            />
          </div>

          {customItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border min-h-[300px] flex flex-col items-center justify-center text-center px-6 py-10">
              <div className="w-12 h-12 rounded-xl bg-surface-muted flex items-center justify-center mb-4">
                <Server size={22} className="text-muted-foreground" />
              </div>
              <p className="text-base font-semibold mb-1">Chưa có Custom Connector nào</p>
              <p className="text-sm text-muted-foreground max-w-[260px] mb-5">Thêm một MCP server để cấp thêm tool cho agent của bạn.</p>
              <AddCustomConnectorMenu
                disabled={!canCreateConnector}
                disabledReason="Vai trò của bạn chưa có quyền tạo connector."
                onPickMcp={() => canCreateConnector && setShowAddCustom(true)}
              onPickToolkit={() => canCreateConnector && navigate("/connectors/custom/toolkits/new")}
              />
            </div>
          ) : customFiltered.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground text-sm">Không tìm thấy connector nào.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {customFiltered.map(i => {
                if (i.kind === "apitool") {
                  const a = i.a;
                  return (
                    <CustomApiToolCard
                      key={a.id}
                      tool={a}
                      tags={i.tags}
                      onOpen={() => setDetailApiToolId(a.id)}
                      onEdit={a.ownerId === CURRENT_USER.id ? () => setEditApiToolTarget(a) : undefined}
                      onShare={manages(a.ownerId) ? () => setShareApiToolTarget(a) : undefined}
                      onDelete={manages(a.ownerId) ? () => setDeleteApiToolTarget(a) : undefined}
                      onUnshare={() => setUnshareTarget({ kind: "apiTool", a })}
                    />
                  );
                }
                const c = i.c;
                const isMine = c.ownerId === CURRENT_USER.id;
                return (
                  <CustomConnectorCard
                    key={c.id}
                    connector={c}
                    tags={i.tags}
                    isMine={isMine}
                    onOpen={() => setDetailConnectorId(c.id)}
                    onEdit={isMine ? () => setEditTarget(c) : undefined}
                    onShare={manages(c.ownerId) ? () => setShareTarget(c) : undefined}
                    onPublish={isMine ? () => setPublishTarget(c) : undefined}
                    onDelete={manages(c.ownerId) ? () => setDeleteTarget(c) : undefined}
                    onUnshare={() => setUnshareTarget({ kind: "connector", c })}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {detailConnectorId && (
        <AgentResourceDetailModal
          agentId=""
          target={{ kind: "connector", id: detailConnectorId }}
          onClose={() => setDetailConnectorId(null)}
          onChanged={refresh}
        />
      )}

      {detailApiToolId && (
        <AgentResourceDetailModal
          agentId=""
          target={{ kind: "apiTool", id: detailApiToolId }}
          onClose={() => setDetailApiToolId(null)}
          onChanged={refresh}
        />
      )}

      {shareApiToolTarget && (
        <CustomConnectorShareModal
          open
          noun="API Tool"
          name={shareApiToolTarget.name}
          ownerName={shareApiToolTarget.ownerName}
          sharing={shareApiToolTarget.sharing}
          resourceOwnerId={shareApiToolTarget.ownerId}
          attachedAgentIds={shareApiToolTarget.attachedByAgentIds}
          onSave={sharing => {
            customApiToolStore.updateSharing(shareApiToolTarget.id, sharing);
            if (sharing.mode === "private" && shareApiToolTarget.sharing.mode !== "private") notifySpaceOwner("resource_unshared", actor, shareApiToolTarget, "API Tool", "/connectors");
            refresh();
          }}
          onClose={() => setShareApiToolTarget(null)}
        />
      )}

      {showAddCustom && (
        <AddCustomConnectorModal
          onClose={() => setShowAddCustom(false)}
          onCreated={() => { setShowAddCustom(false); refresh(); }}
        />
      )}


      {editApiToolTarget && (
        <AddCustomApiToolModal
          editing={editApiToolTarget}
          onClose={() => setEditApiToolTarget(null)}
          onUpdated={() => { setEditApiToolTarget(null); toast.success("Đã lưu thay đổi."); refresh(); }}
        />
      )}

      {publishTarget && (
        <RequestPublishModal
          resourceType="connector" resourceId={publishTarget.id} resourceName={publishTarget.name}
          onClose={() => setPublishTarget(null)}
        />
      )}

      {editTarget && (
        <AddCustomConnectorModal
          editing={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={() => { setEditTarget(null); toast.success("Đã lưu thay đổi."); refresh(); }}
        />
      )}

      {shareTarget && (
        <CustomConnectorShareModal
          open
          name={shareTarget.name}
          ownerName={shareTarget.ownerName}
          sharing={shareTarget.sharing}
          resourceOwnerId={shareTarget.ownerId}
          attachedAgentIds={shareTarget.attachedByAgentIds}
          onSave={sharing => {
            customConnectorStore.updateSharing(shareTarget.id, sharing);
            if (sharing.mode === "private" && shareTarget.sharing.mode !== "private") notifySpaceOwner("resource_unshared", actor, shareTarget, "kết nối", "/connectors");
            refresh();
          }}
          onClose={() => setShareTarget(null)}
        />
      )}

      {unshareTarget && unshareRes && (
        <SpaceUnshareDialog
          open
          noun={unshareTarget.kind === "connector" ? "kết nối" : "API Tool"}
          name={unshareRes.name}
          ownerName={unshareRes.ownerName}
          ownerId={unshareRes.ownerId}
          attachedAgentIds={unshareRes.attachedByAgentIds}
          actor={actor}
          onClose={() => setUnshareTarget(null)}
          onConfirm={() => {
            if (unshareTarget.kind === "connector") customConnectorStore.updateSharing(unshareRes.id, { mode: "private", people: [] });
            else customApiToolStore.updateSharing(unshareRes.id, { mode: "private", people: [] });
            notifySpaceOwner("resource_unshared", actor, unshareRes, unshareTarget.kind === "connector" ? "kết nối" : "API Tool", "/connectors");
            refresh();
          }}
        />
      )}
      {deleteTarget && (
        <SpaceDeleteDialog
          open
          noun="kết nối"
          name={deleteTarget.name}
          originAgentId={deleteTarget.originAgentId}
          attachedAgentIds={deleteTarget.attachedByAgentIds}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            performSpaceDelete("connector", deleteTarget, actor, "kết nối", "/connectors");
            refresh();
          }}
        />
      )}
      {deleteApiToolTarget && (
        <SpaceDeleteDialog
          open
          noun="API Tool"
          name={deleteApiToolTarget.name}
          originAgentId={deleteApiToolTarget.originAgentId}
          attachedAgentIds={deleteApiToolTarget.attachedByAgentIds}
          onClose={() => setDeleteApiToolTarget(null)}
          onConfirm={() => {
            performSpaceDelete("apiTool", deleteApiToolTarget, actor, "API Tool", "/connectors");
            refresh();
          }}
        />
      )}

      {detailTarget && (
        <ConnectorDetailModal
          connector={detailTarget}
          onClose={() => setDetailTarget(null)}
          onDisconnect={() => {
            setConnectedIds(prev => { const next = new Set(prev); next.delete(detailTarget.id); return next; });
            toast.success(`Đã ngắt kết nối ${detailTarget.name}.`);
            setDetailTarget(null);
          }}
        />
      )}

    </div>
  );
}

/* ─── Connector card (Marketplace) ───────────────────── */
function ConnectorLogo({ connector: c }: { connector: Connector }) {
  if (c.logoKind === "fpt") {
    return (
      <div className="w-11 h-11 rounded-xl border border-border bg-white flex items-center justify-center shrink-0 overflow-hidden">
        <FptMark />
      </div>
    );
  }
  if (c.logoKind === "icon" && c.icon) {
    const Icon = c.icon;
    return (
      <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${c.iconBg ?? "bg-surface-muted border-border"}`}>
        <Icon size={20} className={c.iconColor ?? "text-muted-foreground"} />
      </div>
    );
  }
  return (
    <div className="w-11 h-11 rounded-xl border border-border bg-white flex items-center justify-center shrink-0 overflow-hidden p-1.5">
      <img
        src={c.logo}
        alt={c.name}
        className="w-full h-full object-contain"
        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    </div>
  );
}

/** Placeholder brand mark for the 3 internal FCI toolkits (FCI CRM / Member / Tickets) — FPT's
 * 3-brand-color motif, drawn inline since these internal systems have no public logo asset. */
function FptMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="7" height="24" rx="2" fill="#F36F21" />
      <rect x="9.5" y="1" width="7" height="24" rx="2" fill="#00A651" />
      <rect x="18" y="1" width="7" height="24" rx="2" fill="#0071BC" />
    </svg>
  );
}

function MarketplaceConnectorCard({ connector: c, onConnect, onManage }: {
  connector: Connector; onConnect: () => void; onManage: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-[18px] flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <ConnectorLogo connector={c} />
        {c.connected ? (
          <span className="chip chip-success shrink-0"><CheckCircle2 size={12} /> Đã kết nối</span>
        ) : (
          <span className="chip chip-muted shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-current" /> Chưa kết nối</span>
        )}
      </div>
      <p className="text-sm font-semibold mb-1">{c.name}</p>
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 min-h-[32px] mb-3 flex-1">{c.desc}</p>
      <Separator className="mb-3" />
      <div className="flex items-center justify-between gap-2">
        <span className="chip chip-muted text-[11px] px-2 py-0.5 shrink-0">{c.category}</span>
        {c.connected ? (
          <button onClick={onManage} className="btn-secondary shrink-0">Quản lý</button>
        ) : (
          <button onClick={onConnect} className="btn-primary shrink-0"><Plug size={13} /> Kết nối</button>
        )}
      </div>
    </div>
  );
}

/* ─── Custom Connector card + row menu ───────────────── */
function CustomConnectorRowMenu({ onView, onEdit, onShare, onPublish, onToggleBlock, isBlocked, onDelete, onToggleShare, toggleShareLabel, deleteLabel = "Xóa" }: {
  onView?: () => void; onEdit?: () => void; onShare?: () => void; onPublish?: () => void; onToggleBlock?: () => void; isBlocked?: boolean; onDelete?: () => void;
  /** "Tắt chia sẻ" (asks once) or "Chia sẻ" (opens "Ai được dùng"). */
  onToggleShare?: () => void; toggleShareLabel?: string;
  /** "Gỡ khỏi Space" when the Agent it came from keeps it, else "Xóa". */
  deleteLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Tuỳ chọn custom connector"
        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-base"
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-40 bg-white rounded-xl border border-border shadow-lg py-1 animate-fade-up">
          {/* Gap fix: this menu used to offer only Chia sẻ/Xóa — there was no way to correct a
           * wrong URL or rotate a header/API key on an existing connector without deleting and
           * recreating it (losing sharing config and breaking any Agent already attached). */}
          {onView && (
            <button onClick={() => { setOpen(false); onView(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-surface-muted transition-base">
              Xem chi tiết
            </button>
          )}
          {onEdit && (
            <button onClick={() => { setOpen(false); onEdit(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-surface-muted transition-base">
              Chỉnh sửa
            </button>
          )}
          {onShare && (
            <button onClick={() => { setOpen(false); onShare(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-surface-muted transition-base">
              Ai được dùng
            </button>
          )}
          {onToggleShare && (
            <button onClick={() => { setOpen(false); onToggleShare(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-surface-muted transition-base">
              {toggleShareLabel}
            </button>
          )}
          {onPublish && (
            <button onClick={() => { setOpen(false); onPublish(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-surface-muted transition-base">
              Publish
            </button>
          )}
          {onToggleBlock && (
            <button onClick={() => { setOpen(false); onToggleBlock(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-surface-muted transition-base">
              {isBlocked ? "Bỏ chặn agent mới" : "Chặn dùng trong Agent mới"}
            </button>
          )}
          {onDelete && (
            <button onClick={() => { setOpen(false); onDelete(); }} className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-destructive/5 transition-base">
              {deleteLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Shared shell for Custom tab cards — same layout as the Marketplace card (logo, badge, name,
 * URL/description, separator, footer chip + "Quản lý"), plus the ⋮ menu with the owner actions. */
function CustomCardShell({ icon, badge, name, description, mono, chip, extra, menu, onManage }: {
  icon: ReactNode; badge: ReactNode; name: string; description: string; mono?: boolean;
  chip: ReactNode; extra?: ReactNode; menu: ReactNode; onManage: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-[18px] flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="w-11 h-11 rounded-xl border border-border bg-surface-muted flex items-center justify-center shrink-0 text-muted-foreground">{icon}</div>
        <div className="flex items-center gap-1 shrink-0">{badge}{menu}</div>
      </div>
      <p className="text-sm font-semibold mb-1 truncate" title={name}>{name}</p>
      <p className={`text-xs text-muted-foreground leading-relaxed min-h-[32px] mb-3 flex-1 ${mono ? "font-mono truncate" : "line-clamp-2"}`} title={description}>{description}</p>
      <Separator className="mb-3" />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">{chip}{extra}</div>
        <button onClick={onManage} className="btn-secondary shrink-0">Quản lý</button>
      </div>
    </div>
  );
}

function CustomConnectorCard({ connector: c, isMine, onOpen, onEdit, onShare, onPublish, onToggleBlock, onDelete, onUnshare }: {
  connector: CustomConnector; tags: OwnershipTag[]; isMine: boolean; onOpen: () => void; onEdit?: () => void; onShare?: () => void; onPublish?: () => void; onToggleBlock?: () => void; onDelete?: () => void; onUnshare?: () => void;
}) {
  void isMine;
  const openReq = governanceStore.getOpenRequestForResource("connector", c.id);
  const isApproved = governanceStore.isResourceApproved("connector", c.id);
  const isBlocked = resourceBlockStore.isBlocked("connector", c.id);
  // OAuth 2.1 servers still need someone to authorise them; the other kinds work as saved.
  const needsAuth = c.authType === "oauth_auto" || c.authType === "oauth_manual";
  return (
    <CustomCardShell
      icon={<Server size={20} />}
      badge={needsAuth
        ? <span className="chip chip-muted shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-current" /> Chưa uỷ quyền</span>
        : <span className="chip chip-success shrink-0"><CheckCircle2 size={12} /> Đã kết nối</span>}
      name={c.name}
      description={c.url}
      mono
      chip={<span className="chip chip-muted text-[11px] px-2 py-0.5 shrink-0">{CONNECTOR_AUTH_LABEL[c.authType]}</span>}
      extra={(openReq || isApproved) ? <StatusBadge status={openReq ? openReq.status : "approved"} /> : undefined}
      menu={<CustomConnectorRowMenu onEdit={onEdit} onShare={onShare} onPublish={onPublish} onToggleBlock={onToggleBlock} isBlocked={isBlocked} onDelete={onDelete}
        onToggleShare={onShare ? (isShared(c.sharing) ? onUnshare : onShare) : undefined} toggleShareLabel={isShared(c.sharing) ? "Tắt chia sẻ" : "Chia sẻ"} deleteLabel={spaceDeleteLabel(c)} />}
      onManage={onOpen}
    />
  );
}

/** One "+ Thêm custom connector" button that asks which kind to add — MCP server or API Tool —
 * instead of two sibling buttons that read as unrelated actions. */
function AddCustomConnectorMenu({ onPickMcp, onPickToolkit, disabled, disabledReason }: {
  onPickMcp: () => void; onPickToolkit: () => void; disabled?: boolean; disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const options = [
    { icon: Server, label: "MCP tùy chỉnh", sub: "Kết nối một MCP server để cấp các tool của nó cho agent.", onPick: onPickMcp },
    { icon: Layers, label: "Tool kit (REST API)", sub: "Khai báo nhiều REST API trên một base URL; mỗi operation thành một tool.", onPick: onPickToolkit },
  ];
  return (
    <div className="relative shrink-0" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        className="h-10 px-4 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-base flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus size={15} /> Thêm custom connector
        <ChevronDown size={14} className={`transition-base ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-30 w-80 text-left bg-white rounded-2xl border border-border shadow-elev p-1.5 animate-fade-up">
          {options.map((o, i) => (
            <div key={o.label}>
              {i > 0 && <div className="h-px bg-border mx-2.5 my-1" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); o.onPick(); }}
                className="w-full flex items-start gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-surface-muted transition-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="w-8 h-8 rounded-lg bg-primary-soft text-primary flex items-center justify-center shrink-0">
                  <o.icon size={16} />
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="block text-sm font-semibold text-foreground">{o.label}</span>
                  <span className="block text-xs leading-relaxed text-muted-foreground mt-0.5">{o.sub}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const API_METHOD_CLASS: Record<HttpMethod, string> = {
  GET: "bg-[hsl(var(--success-soft))] text-[hsl(var(--success-strong))]",
  POST: "bg-primary-soft text-primary",
  PUT: "bg-amber-100 text-amber-700",
  PATCH: "bg-purple-100 text-purple-700",
  DELETE: "bg-destructive/10 text-destructive",
};

/** API Tool card — same shell as a Custom Connector card, with the HTTP method as the chip. */
function CustomApiToolCard({ tool: a, onOpen, onEdit, onShare, onDelete, onUnshare }: {
  tool: CustomApiTool; tags: OwnershipTag[]; onOpen: () => void; onEdit?: () => void; onShare?: () => void; onDelete?: () => void; onUnshare?: () => void;
}) {
  return (
    <CustomCardShell
      icon={<Globe size={20} />}
      badge={<span className="chip chip-success shrink-0"><CheckCircle2 size={12} /> Sẵn sàng</span>}
      name={a.name}
      description={a.description || a.url}
      chip={<>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${API_METHOD_CLASS[a.method]}`}>{a.method}</span>
        <span className="chip chip-muted text-[11px] px-2 py-0.5 shrink-0">API Tool · {AUTH_TYPE_LABEL[a.auth.type]}</span>
      </>}
      menu={<CustomConnectorRowMenu onEdit={onEdit} onShare={onShare} onDelete={onDelete}
        onToggleShare={onShare ? (isShared(a.sharing) ? onUnshare : onShare) : undefined} toggleShareLabel={isShared(a.sharing) ? "Tắt chia sẻ" : "Chia sẻ"} deleteLabel={spaceDeleteLabel(a)} />}
      onManage={onOpen}
    />
  );
}

/* ─── Connector detail modal (Marketplace, connected only) ───────────────
 * Marketplace connector cards used to render a hover state + chevron with no
 * click handler at all — a dead end. This gives "connected" cards somewhere
 * real to go: which Agents depend on it, and a way to disconnect. */
function ConnectorDetailModal({ connector, onClose, onDisconnect }: {
  connector: Connector; onClose: () => void; onDisconnect: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[480px] bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-fade-up">
        <div className="flex items-start justify-between px-6 py-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <ConnectorLogo connector={connector} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold truncate">{connector.name}</h2>
              <p className="text-xs text-success font-medium flex items-center gap-1 mt-0.5"><CheckCircle2 size={12} /> Đã kết nối</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-surface-muted flex items-center justify-center text-muted-foreground transition-base mt-0.5 shrink-0">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          <p className="text-sm text-muted-foreground leading-relaxed">{connector.desc}</p>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Agent đang dùng connector này</p>
            {connector.requestedBy && connector.requestedBy.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {connector.requestedBy.map(name => (
                  <div key={name} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface text-sm">
                    <span className="w-6 h-6 rounded-full bg-primary-soft text-primary flex items-center justify-center text-[10px] font-bold shrink-0">{name.slice(0, 1).toUpperCase()}</span>
                    {name}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Chưa có Agent nào dùng connector này.</p>
            )}
          </div>
          {confirming && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-[hsl(var(--destructive-soft))] px-3.5 py-3">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-destructive" />
              <p className="text-xs text-destructive leading-relaxed">
                Ngắt kết nối {connector.name}? {connector.requestedBy && connector.requestedBy.length > 0
                  ? `${connector.requestedBy.length} Agent (${connector.requestedBy.join(", ")}) `
                  : "Các Agent đang dùng connector này "}sẽ mất quyền truy cập ngay lập tức.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border shrink-0">
          {confirming ? (
            <>
              <button onClick={() => setConfirming(false)} className="h-9 px-4 rounded-lg border border-border bg-white hover:bg-surface-muted text-sm font-medium transition-base">Hủy bỏ</button>
              <button onClick={onDisconnect} className="h-9 px-4 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 text-sm font-medium transition-base">Ngắt kết nối</button>
            </>
          ) : (
            <>
              <button onClick={() => setConfirming(true)} className="h-9 px-4 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/5 text-sm font-medium transition-base">Ngắt kết nối</button>
              <button onClick={onClose} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary-glow text-sm font-medium transition-base">Đóng</button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
