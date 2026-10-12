import { Suspense } from 'preact/compat';
import { useEffect } from 'preact/hooks';
import { Link, Redirect, Route, Switch, useLocation } from 'wouter-preact';
import { authStatus, login } from '../auth/session';
import { useMe } from '../features/account/useMe';
import { t } from '../i18n';
import { EmptyState } from '../ui/States';
import { PageSkeleton, Skeleton } from '../ui/Skeleton';
import { CallbackPage } from './CallbackPage';
import { ErrorBoundary } from './ErrorBoundary';
import { prefetchWhenIdle } from './prefetch';
import { AccountPage, AccountsPage, PaymentsPage, SiteWorkspace, SitesPage, loaders } from './routes';
import { Shell } from './Shell';

function Splash({ message }: { message: string }) {
  return (
    <div class="center-screen" role="status" aria-busy="true">
      <Skeleton height={14} width={160} />
      <p class="muted">{message}</p>
    </div>
  );
}

function StaffOnly() {
  const me = useMe();
  if (me.loading) return <PageSkeleton />;
  return me.data?.is_staff ? <AccountsPage /> : <NotFound />;
}

function NotFound() {
  return (
    <div class="page">
      <EmptyState
        icon="alert"
        title={t('common.not_found')}
        action={
          <Link href="/sites" class="btn btn-primary btn-md">
            {t('sites.title')}
          </Link>
        }
      />
    </div>
  );
}

function Authenticated() {
  useEffect(() => prefetchWhenIdle([loaders.workspace, loaders.overview]), []);
  return (
    <Shell>
      <ErrorBoundary>
        <Suspense fallback={<PageSkeleton />}>
          <Switch>
            <Route path="/">
              <Redirect to="/sites" replace />
            </Route>
            <Route path="/sites" component={SitesPage} />
            <Route path="/sites/:id" nest>
              {(params: { id: string }) => <SiteWorkspace id={params.id} />}
            </Route>
            <Route path="/payments" component={PaymentsPage} />
            <Route path="/admin" component={StaffOnly} />
            <Route path="/account" component={AccountPage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
    </Shell>
  );
}

export function App() {
  const [location] = useLocation();
  const status = authStatus.value;
  const needsLogin = status === 'anonymous' && location !== '/auth/callback';

  useEffect(() => {
    if (needsLogin) void login(window.location.pathname + window.location.search);
  }, [needsLogin]);

  if (location === '/auth/callback') return <CallbackPage />;
  if (status === 'loading') return <Splash message={t('auth.loading')} />;
  if (needsLogin) return <Splash message={t('auth.redirecting')} />;
  return (
    <Authenticated />
  );
}
