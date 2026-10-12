import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { completeLogin, login } from '../auth/session';
import { t } from '../i18n';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Skeleton } from '../ui/Skeleton';

/** `/auth/callback`: exchanges the authorization code (PKCE) and returns to the requested route. */
export function CallbackPage() {
  const [, navigate] = useLocation();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // the code is single-use: never exchange it twice
    started.current = true;
    completeLogin(window.location.search)
      .then((to) => navigate(to, { replace: true }))
      .catch(() => setFailed(true));
  }, [navigate]);

  if (failed) {
    return (
      <div class="center-screen" role="alert">
        <span class="empty-icon">
          <Icon name="alert" size={26} />
        </span>
        <h1>{t('auth.failed')}</h1>
        <p class="muted">{t('auth.failed_hint')}</p>
        <Button variant="primary" onClick={() => void login('/')}>
          {t('auth.retry')}
        </Button>
      </div>
    );
  }
  return (
    <div class="center-screen" role="status" aria-busy="true">
      <Skeleton height={14} width={160} />
      <p class="muted">{t('auth.signing_in')}</p>
    </div>
  );
}
