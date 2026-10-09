import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ReactNode, useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import WorkspaceLayout from "./components/layout/WorkspaceLayout";
import Home from "./pages/Home";
import MyAgents from "./pages/MyAgents";
import AgentsList from "./pages/AgentsList";
import ExternalAgentsList from "./pages/ExternalAgentsList";
import ExternalAgentDetail from "./pages/ExternalAgentDetail";
import ExternalAgentIntegrationGuide from "./pages/ExternalAgentIntegrationGuide";
import AgentBuilder from "./pages/AgentBuilder";
import AgentScaffold from "./pages/AgentScaffold";
import Inventor from "./pages/Inventor";
import TaskEditor from "./pages/TaskEditor";
import ToolBuilder from "./pages/ToolBuilder";
import CreateToolkit from "./pages/CreateToolkit";
import ConversationTrace from "./pages/ConversationTrace";
import OrgGeneral from "./pages/organization/General";
import OrgStructure from "./pages/organization/Structure";
import OrgChart from "./pages/organization/OrgChart";
import OrgMembers from "./pages/organization/Members";
import OrgRoles from "./pages/organization/Roles";
import { RolesProvider } from "./pages/organization/rolesStore";
import { OrgProvider, useOrg } from "./pages/organization/orgStore";
import OrgSetupWizard from "./pages/organization/OrgSetupWizard";
import SuperAdminOrgs from "./pages/superadmin/SuperAdminOrgs";
import { ConflictsProvider } from "./pages/organization/conflictsStore";
import PlaceholderPage from "./pages/PlaceholderPage";
import KnowledgeList from "./pages/KnowledgeList";
import KnowledgeDetail from "./pages/KnowledgeDetail";
import WorkforceList from "./pages/WorkforceList";
import WorkforceCanvasPage from "./pages/WorkforceCanvasPage";
import WorkforceTracePage from "./pages/WorkforceTracePage";
import Skills from "./pages/Skills";
import SkillDetail from "./pages/SkillDetail";
import WorkspaceGuardrails from "./pages/WorkspaceGuardrails";
import WorkspaceConnectors from "./pages/WorkspaceConnectors";
import GovernanceRequests from "./pages/GovernanceRequests";
import GovernanceLibraryRequests from "./pages/GovernanceLibraryRequests";
import GovernanceRequestDetail from "./pages/GovernanceRequestDetail";
import GovernanceLibraryRequestDetail from "./pages/GovernanceLibraryRequestDetail";
import GovernanceAuditLog from "./pages/GovernanceAuditLog";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound.tsx";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import { getUser } from "@/lib/onboarding";

const queryClient = new QueryClient();

/**
 * Gates General/Structure/Members/Roles behind the Organization setup wizard when the ACTIVE
 * Space has no Organization configured yet (a freshly-created Space — see `addTenant` in
 * spaceStore.ts). FPT's existing seed Spaces are always configured, so this is a no-op for
 * them; it only ever intercepts a brand-new Space's first visit to these pages.
 */
function RequireOrgConfigured({ children }: { children: ReactNode }) {
  const { isConfigured } = useOrg();
  const loc = useLocation();
  // "/organization" itself is the natural first stop (it just renders the wizard directly) —
  // no dialog needed there. Jumping straight to Structure/Members/Roles (nav, back button, a
  // typed URL) while unconfigured *is* an intentional block, so say so with something a lot
  // more visible than a corner toast, instead of silently swapping in the wizard — which
  // otherwise reads as the click having done nothing.
  const shouldNotify = !isConfigured && loc.pathname !== "/organization";
  const [dialogOpen, setDialogOpen] = useState(shouldNotify);
  useEffect(() => {
    if (shouldNotify) setDialogOpen(true);
  }, [loc.pathname, shouldNotify]);

  if (!isConfigured) {
    return (
      <>
        <OrgSetupWizard />
        <Dialog open={dialogOpen && shouldNotify} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <div className="w-11 h-11 rounded-full bg-primary-soft text-primary flex items-center justify-center mb-2">
                <Building2 size={20} />
              </div>
              <DialogTitle>Hoàn tất thiết lập doanh nghiệp/tổ chức</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground leading-relaxed py-1">
              Doanh nghiệp/Tổ chức của bạn chưa được thiết lập. Vui lòng hoàn tất bước này trước khi tiếp tục.
            </p>
            <DialogFooter>
              <button onClick={() => setDialogOpen(false)} className="btn-primary h-9 px-4">Đã hiểu</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }
  return <>{children}</>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const user = getUser();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (
    user.firstTime &&
    loc.pathname !== "/onboarding" &&
    loc.pathname !== "/inventor"
  )
    return <Navigate to="/onboarding?step=industry" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <RolesProvider>
        <OrgProvider>
        <ConflictsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<Onboarding />} />

            <Route element={<RequireAuth><WorkspaceLayout /></RequireAuth>}>
              <Route path="/" element={<Home />} />
              <Route path="/my-agents" element={<MyAgents />} />
              <Route path="/agents" element={<AgentsList />} />
              <Route path="/agents/new" element={<AgentBuilder />} />
              <Route path="/agents/:id" element={<AgentBuilder />} />
              <Route path="/agents/:id/tasks/:taskId" element={<TaskEditor />} />
              <Route path="/external-agents" element={<ExternalAgentsList />} />
              <Route path="/external-agents/guides/integration" element={<ExternalAgentIntegrationGuide />} />
              <Route path="/external-agents/guides/per-user-connector" element={<Navigate to="/external-agents/guides/integration#per-user-connector" replace />} />
              <Route path="/external-agents/guides/how-it-works" element={<Navigate to="/external-agents/guides/integration" replace />} />
              <Route path="/external-agents/:id" element={<ExternalAgentDetail />} />
            </Route>
            <Route path="/inventor" element={<RequireAuth><Inventor /></RequireAuth>} />
            <Route path="/connectors/custom/toolkits/new" element={<RequireAuth><CreateToolkit /></RequireAuth>} />
            <Route path="/agents/:id/tools/new" element={<RequireAuth><ToolBuilder /></RequireAuth>} />
            <Route path="/agents/:id/tools/:toolId" element={<RequireAuth><ToolBuilder /></RequireAuth>} />
            <Route path="/agents/:id/trace/:conversationId" element={<RequireAuth><ConversationTrace /></RequireAuth>} />
            <Route element={<RequireAuth><WorkspaceLayout /></RequireAuth>}>
              <Route path="/knowledge" element={<KnowledgeList />} />
              <Route path="/knowledge/:id" element={<KnowledgeDetail />} />
              <Route path="/workforce" element={<WorkforceList />} />
              <Route path="/workforce/:id" element={<WorkforceCanvasPage />} />
              <Route path="/workforce/:id/trace/:runId" element={<WorkforceTracePage />} />
              <Route path="/members" element={<RequireOrgConfigured><OrgMembers /></RequireOrgConfigured>} />
              <Route path="/roles" element={<RequireOrgConfigured><OrgRoles /></RequireOrgConfigured>} />
              <Route path="/organization" element={<RequireOrgConfigured><OrgGeneral /></RequireOrgConfigured>} />
              <Route path="/organization/structure" element={<RequireOrgConfigured><OrgStructure /></RequireOrgConfigured>} />
              <Route path="/organization/chart" element={<RequireOrgConfigured><OrgChart /></RequireOrgConfigured>} />
              <Route path="/super-admin/organizations" element={<SuperAdminOrgs />} />
              <Route path="/connectors" element={<WorkspaceConnectors />} />
              <Route path="/tools" element={<Skills />} />
              <Route path="/tools/:id" element={<SkillDetail />} />
              <Route path="/guardrails" element={<WorkspaceGuardrails />} />
              <Route path="/governance/requests" element={<GovernanceRequests />} />
              <Route path="/governance/library-requests" element={<GovernanceLibraryRequests />} />
              <Route path="/governance/requests/:id" element={<GovernanceRequestDetail />} />
              <Route path="/governance/library-requests/:id" element={<GovernanceLibraryRequestDetail />} />
              <Route path="/governance/audit-log" element={<GovernanceAuditLog />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/models" element={<PlaceholderPage title="Models" />} />
              <Route path="/api-keys" element={<PlaceholderPage title="API Keys" />} />
              <Route path="/docs" element={<PlaceholderPage title="Document Center" />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </ConflictsProvider>
        </OrgProvider>
      </RolesProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
