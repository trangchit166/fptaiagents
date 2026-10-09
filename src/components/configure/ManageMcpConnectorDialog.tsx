import { useState } from "react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { ServerStack01Icon, ArrowReloadHorizontalIcon, Delete02Icon } from "@hugeicons/core-free-icons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { customConnectorStore, CONNECTOR_AUTH_LABEL, type CustomConnector } from "./customConnectorStore";
import { needsAuthorization, type McpToolPermission } from "./mcpDiscovery";

type IconData = Parameters<typeof HugeiconsIcon>[0]["icon"];
const Icon = ({ icon, size = 16, className = "" }: { icon: IconData; size?: number; className?: string }) =>
  <HugeiconsIcon icon={icon} size={size} strokeWidth={1.5} className={className} aria-hidden="true" />;

const TRIGGER = "h-full flex-none rounded-md border border-transparent px-3 py-1 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-0";

const PERMISSION: Record<McpToolPermission, { label: string; cls: string }> = {
  auto: { label: "Auto", cls: "border-success/40 text-success" },
  ask: { label: "Ask", cls: "border-warning/50 text-warning" },
};

function authLabel(c: CustomConnector): string {
  if (c.authType === "none") return "No authentication";
  if (c.authType === "static_headers") return `Static headers (${c.headers.length})`;
  return CONNECTOR_AUTH_LABEL[c.authType];
}

const fmtTime = (t?: number) =>
  t ? new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Never";

/** "Manage" for a Custom MCP connector: server details + Sync, and the tools the server grants
 * (with their default Auto/Ask permission — the per-agent override happens once it's attached). */
export default function ManageMcpConnectorDialog({ connectorId, canRemove, onClose, onRemove, onChanged }: {
  connectorId: string;
  canRemove: boolean;
  onClose: () => void;
  /** Hands off to the page's existing delete flow (in-use check + confirm). */
  onRemove: (c: CustomConnector) => void;
  onChanged?: () => void;
}) {
  const [c, setC] = useState(() => customConnectorStore.ensureSynced(connectorId));
  const [syncing, setSyncing] = useState(false);
  if (!c) return null;
  const pending = needsAuthorization(c);
  const tools = c.tools ?? [];

  const sync = () => {
    setSyncing(true);
    window.setTimeout(() => {
      const next = customConnectorStore.sync(c.id);
      if (next) setC(next);
      setSyncing(false);
      onChanged?.();
      toast.success(`Synced ${c.name}.`);
    }, 600);
  };

  const rows: [string, React.ReactNode][] = [
    ["Endpoint", <span className="font-mono text-sm break-all">{c.url}</span>],
    ["Server", c.serverInfo ? `${c.serverInfo.name} v${c.serverInfo.version}` : "—"],
    ["Authentication", authLabel(c)],
    ["Last synced", <span className="tabular-nums">{fmtTime(c.lastSyncedAt)}</span>],
  ];

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="z-[70] sm:max-w-[760px] p-0 gap-0 rounded-lg flex flex-col h-[min(730px,90vh)] overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-5 text-left space-y-0">
          <div className="flex items-start gap-4 pr-8">
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
              <Icon icon={ServerStack01Icon} size={24} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-xl font-semibold truncate">{c.name}</DialogTitle>
                {pending
                  ? <span className="inline-flex items-center rounded-full border border-warning/50 px-2.5 py-0.5 text-xs font-medium text-warning">Authorization required</span>
                  : <span className="inline-flex items-center rounded-full border border-success/40 bg-success/5 px-2.5 py-0.5 text-xs font-medium text-success">Connected</span>}
              </div>
              <DialogDescription className="mt-1">Manage the MCP server and review the tools it grants to agents.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="configure" className="flex-1 min-h-0 flex flex-col px-6">
          <TabsList className="h-9 w-fit rounded-lg bg-muted p-[3px] text-muted-foreground">
            <TabsTrigger value="configure" className={TRIGGER}>Configure</TabsTrigger>
            <TabsTrigger value="permissions" className={TRIGGER}>Available permissions ({tools.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="configure" className="mt-5 flex-1 min-h-0 overflow-y-auto">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-medium">Server details</h3>
              <Button type="button" variant="outline" size="sm" onClick={sync} disabled={syncing}>
                <Icon icon={ArrowReloadHorizontalIcon} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : "Sync"}
              </Button>
            </div>
            <dl className="rounded-lg border divide-y">
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-6 px-4 py-3.5">
                  <dt className="text-sm text-muted-foreground shrink-0">{label}</dt>
                  <dd className="text-sm text-right min-w-0">{value}</dd>
                </div>
              ))}
            </dl>
          </TabsContent>

          <TabsContent value="permissions" className="mt-5 flex-1 min-h-0 overflow-y-auto">
            <p className="text-sm text-muted-foreground mb-3">You'll be able to configure the specific permissions once connected to an agent.</p>
            {tools.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                {pending ? "Tools appear after the server is authorized." : "This server didn't expose any tools. Try Sync."}
              </div>
            ) : (
              <ul className="rounded-lg border divide-y">
                {tools.map(t => (
                  <li key={t.name} className="flex items-start gap-4 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium break-words">{t.name}</p>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5" title={t.description}>{t.description}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${PERMISSION[t.permission].cls}`}>
                      {PERMISSION[t.permission].label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 px-6 py-5">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          {canRemove && (
            <Button type="button" variant="destructive" onClick={() => onRemove(c)}>
              <Icon icon={Delete02Icon} /> Remove
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
