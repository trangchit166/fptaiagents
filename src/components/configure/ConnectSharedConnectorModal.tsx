import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon, Cancel01Icon, ArrowLeft01Icon, CheckmarkCircle01Icon, Add01Icon,
  Building02Icon, BoltIcon, Touchpad01Icon, ShieldBanIcon, Loading01Icon,
} from "@hugeicons/core-free-icons";
import {
  sharedConnectorAccountStore, type SharedConnectorAccount,
} from "./sharedConnectorAccountStore";
import {
  connectorActionStore, ACTION_PERMISSION_LABEL, type ActionPermission,
} from "./connectorActionStore";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface ConnectableConnector {
  id: string;
  name: string;
  logo: string;
  category: string;
}

/** Steps of the Shared-connector flow. "pick" -> "account" -> (optionally "oauth") ->
 * "permissions". The account step is never skipped: adding a Shared connector always states
 * which workspace account the agent will run as, even when that account already existed. */
type Step = "pick" | "account" | "oauth" | "permissions";

const PERMISSION_OPTIONS: { value: ActionPermission; icon: any }[] = [
  { value: "auto", icon: BoltIcon },
  { value: "ask", icon: Touchpad01Icon },
  { value: "block", icon: ShieldBanIcon },
];

/** Suggests a plausible address for the mock OAuth screen so the tester doesn't have to invent
 * one, while still allowing a different address to be typed (that's how a second account for the
 * same connector gets created). */
function suggestedEmail(connectorId: string, taken: SharedConnectorAccount[]): string {
  const base = `${connectorId}-workspace@fpt.com`;
  if (!taken.some(a => a.email.toLowerCase() === base.toLowerCase())) return base;
  return `${connectorId}-workspace${taken.length + 1}@fpt.com`;
}

/** Adding a Shared connector to an agent: pick one connector, say which workspace account it
 * runs as (authorising a new one if needed), then set the per-action governance level.
 *
 * Separate from ConnectorPickerModal (still used for the per-user scope) because the two
 * genuinely differ: a personal connector is authorised by each end user at run time, so it has
 * no account to choose here and can be toggled on several at a time; a Shared connector is one
 * workspace account per connector, which only makes sense one connector at a time. */
export default function ConnectSharedConnectorModal({
  connectors, alreadyConnectedIds, agentId, currentUserName, onClose, onConnected, onSwitchScope,
}: {
  connectors: ConnectableConnector[];
  alreadyConnectedIds: string[];
  agentId: string;
  currentUserName: string;
  onClose: () => void;
  /** Fired once the connector is attached, so the caller can refresh its list. */
  onConnected: (connectorId: string, accountId: string) => void;
  /** "Đổi" next to the scope badge — hands back to the scope menu. */
  onSwitchScope?: () => void;
}) {
  const [step, setStep] = useState<Step>("pick");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chosenAccountId, setChosenAccountId] = useState<string | null>(null);
  const [oauthEmail, setOauthEmail] = useState("");
  const [authorising, setAuthorising] = useState(false);
  const [tick, setTick] = useState(0);
  void tick;

  const selected = connectors.find(c => c.id === selectedId) ?? null;
  const accounts = useMemo(
    () => (selectedId ? sharedConnectorAccountStore.listForConnector(selectedId) : []),
    [selectedId, tick],
  );

  const filtered = connectors.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  /** Step 2: always the same screen — the workspace accounts for this connector as a list, with
   * "Connect a new account" at the end of it. Zero accounts is just that list empty rather than
   * a different screen, so the add-account action never moves around between connectors. */
  const openAccountStep = (connectorId: string) => {
    const existing = sharedConnectorAccountStore.listForConnector(connectorId);
    setChosenAccountId(existing[0]?.id ?? null);
    setStep("account");
  };

  const startConnect = () => {
    if (!selectedId) return;
    openAccountStep(selectedId);
  };

  /** Mock OAuth: no real provider to call, so authorising always succeeds after a short beat —
   * enough to show the round trip without pretending to validate anything. Lands back on the
   * account list with the new account selected: authorising an account and choosing which one
   * this agent runs as are two different decisions, and the second one is still open. */
  const authorise = () => {
    if (!selected || !oauthEmail.trim()) return;
    setAuthorising(true);
    setTimeout(() => {
      const account = sharedConnectorAccountStore.add(selected.id, oauthEmail, currentUserName);
      setAuthorising(false);
      setChosenAccountId(account.id);
      setTick(t => t + 1);
      setStep("account");
      toast.success(`Đã thêm tài khoản ${account.email}.`);
    }, 700);
  };

  /** Attaches the connector to the agent and moves on to the per-action step. */
  const attach = (accountId: string) => {
    if (!selected) return;
    onConnected(selected.id, accountId);
    setStep("permissions");
  };

  const useChosenAccount = () => {
    if (!chosenAccountId) return;
    attach(chosenAccountId);
  };

  const addAnotherAccount = () => {
    if (!selected) return;
    setOauthEmail(suggestedEmail(selected.id, accounts));
    setStep("oauth");
  };

  const chosenAccount = chosenAccountId ? sharedConnectorAccountStore.get(chosenAccountId) : undefined;

  const header = (() => {
    if (step === "pick") return { title: "Thêm kết nối Dùng chung", sub: "Chọn một connector để kết nối cho agent này." };
    if (step === "account") return { title: `Tài khoản cho ${selected?.name}`, sub: "Chọn tài khoản workspace mà agent sẽ chạy dưới quyền." };
    if (step === "oauth") return { title: `Đăng nhập ${selected?.name}`, sub: "Cấp quyền cho tài khoản dùng chung của workspace." };
    return { title: `Quyền cho ${selected?.name}`, sub: "Chọn mức xử lý cho từng action của connector." };
  })();

  const goBack = () => {
    if (step === "account") { setStep("pick"); return; }
    // The account list is always a real step now, so OAuth always has somewhere to go back to.
    if (step === "oauth") { setStep("account"); return; }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl bg-card rounded-lg shadow-sm border flex flex-col max-h-[85vh] animate-fade-up">
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 shrink-0 border-b">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {(step === "account" || step === "oauth") && (
                <button
                  type="button"
                  onClick={goBack}
                  aria-label="Quay lại"
                  className="w-7 h-7 -ml-1 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
                </button>
              )}
              <h2 className="text-lg font-semibold truncate">{header.title}</h2>
              <span className="inline-flex items-center gap-1 text-xs font-medium rounded-sm px-1.5 py-0.5 bg-primary/10 text-primary whitespace-nowrap">
                <HugeiconsIcon icon={Building02Icon} size={12} /> Dùng chung
              </span>
              {step === "pick" && onSwitchScope && (
                <button type="button" onClick={onSwitchScope} className="text-sm font-medium text-primary hover:underline shrink-0">
                  Đổi
                </button>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{header.sub}</p>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors shrink-0">
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </button>
        </div>

        {/* ── Step 1: pick exactly one connector ── */}
        {step === "pick" && (
          <>
            <div className="px-6 pt-4 pb-3 shrink-0">
              <div className="relative">
                <HugeiconsIcon icon={Search01Icon} size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm connector..."
                  className="w-full h-9 pl-9 pr-3 rounded-md border bg-transparent text-sm placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-4">
              <div className="grid grid-cols-2 gap-2">
                {filtered.map(c => {
                  const already = alreadyConnectedIds.includes(c.id);
                  const active = selectedId === c.id;
                  const accountCount = sharedConnectorAccountStore.listForConnector(c.id).length;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={already}
                      onClick={() => setSelectedId(c.id)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                        already
                          ? "opacity-50 cursor-not-allowed"
                          : active
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted"
                      }`}
                    >
                      <span className="w-9 h-9 rounded-md border bg-card flex items-center justify-center text-xs font-semibold shrink-0">{c.logo}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{c.name}</span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {already ? "Đã kết nối" : accountCount > 0 ? `${accountCount} tài khoản sẵn có` : "Chưa có tài khoản dùng chung"}
                        </span>
                      </span>
                      {active && <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} className="text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Không tìm thấy connector phù hợp.</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t shrink-0">
              <button onClick={onClose} className="h-9 px-4 rounded-md border bg-transparent hover:bg-muted text-sm font-medium transition-colors">Hủy</button>
              <button
                onClick={startConnect}
                disabled={!selectedId}
                className="h-9 px-5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Connect
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: which Shared account ── */}
        {step === "account" && selected && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <p className="text-sm font-medium mb-2">Tài khoản dùng chung của workspace</p>
              <div className="space-y-2">
                {accounts.length === 0 && (
                  // Empty is still the same list, not a different screen — so the add-account
                  // action stays exactly where it is for every connector.
                  <div className="rounded-md border border-dashed px-3.5 py-5 text-center">
                    <p className="text-sm text-muted-foreground">
                      Chưa có tài khoản dùng chung nào cho {selected.name}.
                    </p>
                  </div>
                )}
                {accounts.map(a => {
                  const active = chosenAccountId === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setChosenAccountId(a.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-md border text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                        active ? "border-primary bg-primary/5" : "hover:bg-muted"
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? "border-primary" : "border-border"}`}>
                        {active && <span className="w-2 h-2 rounded-full bg-primary" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate">Connected as {a.email}</span>
                        <span className="block text-xs text-muted-foreground truncate">Đã kết nối bởi {a.connectedBy}</span>
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={addAnotherAccount}
                  className="w-full flex items-center gap-2 px-3.5 py-3 rounded-md border border-dashed text-sm font-medium text-primary hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <HugeiconsIcon icon={Add01Icon} size={16} /> Connect a new account
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t shrink-0">
              <button onClick={onClose} className="h-9 px-4 rounded-md border bg-transparent hover:bg-muted text-sm font-medium transition-colors">Hủy</button>
              {chosenAccountId ? (
                <button
                  onClick={useChosenAccount}
                  className="h-9 px-5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors"
                >
                  Connect
                </button>
              ) : (
                // A disabled <button> swallows its own hover events, so the tooltip hangs off a
                // wrapper span — same pattern the Knowledge export modal uses.
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      className="h-9 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center opacity-40 cursor-not-allowed outline-none"
                    >
                      Connect
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Thêm tài khoản để connect.</TooltipContent>
                </Tooltip>
              )}
            </div>
          </>
        )}

        {/* ── Step 2b: mock OAuth ── */}
        {step === "oauth" && selected && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="max-w-sm mx-auto text-center">
                <span className="w-14 h-14 rounded-lg border bg-card flex items-center justify-center text-lg font-semibold mx-auto">{selected.logo}</span>
                <p className="text-sm font-medium mt-4">Đăng nhập để cấp quyền cho {selected.name}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Tài khoản này trở thành tài khoản dùng chung của workspace cho {selected.name}.
                </p>
                <div className="mt-5 text-left">
                  <label className="text-sm font-medium mb-2 block">Tài khoản {selected.name}</label>
                  <input
                    autoFocus
                    value={oauthEmail}
                    onChange={e => setOauthEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") authorise(); }}
                    placeholder="ten@congty.com"
                    className="w-full h-9 px-3 rounded-md border bg-transparent text-sm placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                </div>
                <div className="mt-4 rounded-md border bg-muted/40 px-3.5 py-3 text-left">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quyền sẽ cấp</p>
                  <ul className="mt-1.5 space-y-1">
                    {connectorActionStore.listFor(agentId, selected.id).slice(0, 4).map(a => (
                      <li key={a.action} className="flex items-center gap-2 text-sm">
                        <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} className="text-muted-foreground shrink-0" />
                        {a.action}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t shrink-0">
              <button onClick={goBack} className="h-9 px-4 rounded-md border bg-transparent hover:bg-muted text-sm font-medium transition-colors">Quay lại</button>
              <button
                onClick={authorise}
                disabled={!oauthEmail.trim() || authorising}
                className="h-9 px-5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {authorising && <HugeiconsIcon icon={Loading01Icon} size={14} className="animate-spin" />}
                {authorising ? "Đang xác thực..." : "Allow access"}
              </button>
            </div>
          </>
        )}

        {/* ── Step 3+4: connected, now set per-action governance ── */}
        {step === "permissions" && selected && (
          <>
            <div className="px-6 pt-4 shrink-0">
              <div className="flex items-center gap-3 rounded-md border border-success/20 bg-success/10 px-3.5 py-3">
                <HugeiconsIcon icon={CheckmarkCircle01Icon} size={18} className="text-success shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{selected.name} đã kết nối</p>
                  {chosenAccount && <p className="text-xs text-muted-foreground truncate">Connected as {chosenAccount.email}</p>}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="rounded-md border overflow-hidden">
                {connectorActionStore.listFor(agentId, selected.id).map((a, i) => (
                  <div key={a.action} className={`flex items-center gap-3 px-3.5 py-2.5 ${i > 0 ? "border-t" : ""}`}>
                    <span className="text-sm flex-1 min-w-0 truncate">{a.action}</span>
                    <div className="flex items-center gap-0.5 rounded-md border p-0.5 shrink-0">
                      {PERMISSION_OPTIONS.map(opt => {
                        const active = a.permission === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => { connectorActionStore.set(agentId, selected.id, a.action, opt.value); setTick(t => t + 1); }}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                              active
                                ? opt.value === "block"
                                  ? "bg-destructive/10 text-destructive"
                                  : opt.value === "ask"
                                    ? "bg-muted text-foreground"
                                    : "bg-success/15 text-success"
                                : "text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            <HugeiconsIcon icon={opt.icon} size={12} /> {ACTION_PERMISSION_LABEL[opt.value]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
                Auto: agent tự chạy. Ask: hỏi người dùng trước khi chạy. Block: không cho chạy action này.
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 px-6 py-4 border-t shrink-0">
              <button
                onClick={() => { setSelectedId(null); setChosenAccountId(null); setSearch(""); setStep("pick"); }}
                className="h-9 px-4 rounded-md border bg-transparent hover:bg-muted text-sm font-medium flex items-center gap-1.5 transition-colors"
              >
                <HugeiconsIcon icon={Add01Icon} size={14} /> Thêm connector khác
              </button>
              <button
                onClick={() => { toast.success(`Đã kết nối ${selected.name}.`); onClose(); }}
                className="h-9 px-5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors"
              >
                Xong
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
