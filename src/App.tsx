import { AppStateProvider } from "./store";
import { useHashRoute } from "./hooks/useHashRoute";
import { Rail, Topbar } from "./components/Layout";
import { OverviewPage } from "./pages/OverviewPage";
import { ProcessExplorer as ProcessesPage } from "./pages/ProcessExplorer";
import { DetectionsPage } from "./pages/DetectionsPage";
import { ProcessGraphPage } from "./pages/ProcessGraphPage";
import { AuditPage } from "./pages/AuditPage";
import { ChunksPage } from "./pages/ChunksPage";

function RouteOutlet({ route }: { route: ReturnType<typeof useHashRoute>[0] }) {
  switch (route) {
    case "overview":
      return <OverviewPage />;
    case "processes":
      return <ProcessesPage />;
    case "detections":
      return <DetectionsPage />;
    case "graph":
      return <ProcessGraphPage />;
    case "audit":
      return <AuditPage />;
    case "chunks":
      return <ChunksPage />;
  }
}

export default function App() {
  const [route, navigate] = useHashRoute();

  return (
    <AppStateProvider>
      <div className="app-shell">
        <Rail route={route} navigate={navigate} />
        <Topbar route={route} />
        <main className="main-scroll">
          <RouteOutlet route={route} />
        </main>
      </div>
    </AppStateProvider>
  );
}
