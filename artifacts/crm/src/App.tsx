import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { useAuth } from '@workspace/replit-auth-web';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { AppShell, SkeletonBlock } from '@/components/crm-ui';
import { Customers, Dashboard, FollowUps, LeadDetail, Leads, Login, SettingsPage } from '@/pages/crm-pages';
import { NewEnquiry } from '@/pages/enquiry';

const queryClient = new QueryClient();

function Router() {
  const { isLoading, isAuthenticated } = useAuth();
  if (isLoading) return <AppShell><div className="space-y-5"><SkeletonBlock className="h-5 w-24" /><SkeletonBlock className="h-12 w-80" /><div className="grid grid-cols-2 gap-4 md:grid-cols-5">{[1, 2, 3, 4, 5].map((item) => <SkeletonBlock key={item} className="h-32" />)}</div></div></AppShell>;
  if (!isAuthenticated) return <Login />;
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/leads" component={Leads} />
        <Route path="/leads/:id" component={LeadDetail} />
        <Route path="/enquiry" component={NewEnquiry} />
        <Route path="/follow-ups" component={FollowUps} />
        <Route path="/customers" component={Customers} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: import('react').ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
