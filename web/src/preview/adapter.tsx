/**
 * The ONLY file that knows where the widget previews come from: the real widgets package
 * (alias `@widgets` -> ../widgets/src). It is imported lazily by `./lazy.tsx`, never by the entry bundle.
 * Widgets render inside a Shadow DOM, so console CSS cannot leak in or out; the host is `position: relative`.
 */
import * as widgets from '@widgets/preview';

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BannerConfig, FormConfig, ItemConfig, NewsletterConfig, SurveyConfig } from '../api/types';
import { t } from '../i18n';
import { Icon } from '../ui/Icon';
import { Segmented } from '../ui/Segmented';
import { toWidgetBanner, toWidgetForm, toWidgetItem, toWidgetNewsletter, toWidgetSurvey } from './convert';

type Mount<C> = (host: HTMLElement, config: C) => { update(config: C): void; destroy(): void };
type Viewport = 'desktop' | 'mobile';

function PreviewFrame<C>({ mount, config }: { mount: Mount<C>; config: C }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<ReturnType<Mount<C>> | null>(null);
  const latest = useRef(config);
  latest.current = config;
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    try {
      handle.current = mount(host.current, latest.current);
    } catch {
      setFailed(true);
    }
    return () => {
      handle.current?.destroy();
      handle.current = null;
    };
  }, [mount]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        handle.current?.update(config);
      } catch {
        setFailed(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [config]);

  return (
    <div class="preview">
      <div class="preview-bar">
        <span class="preview-title">
          <Icon name="eye" size={15} /> {t('preview.title')}
        </span>
        <Segmented<Viewport>
          label={t('preview.viewport')}
          hideLabel
          value={viewport}
          onChange={setViewport}
          options={[
            { value: 'desktop', title: t('preview.desktop'), label: <Icon name="desktop" size={16} /> },
            { value: 'mobile', title: t('preview.mobile'), label: <Icon name="mobile" size={16} /> },
          ]}
        />
      </div>
      <div class="preview-canvas">
        <div class={`preview-stage is-${viewport}`} ref={host} />
        {failed && <p class="field-error">{t('preview.failed')}</p>}
      </div>
    </div>
  );
}

export function BannerPreview({ config }: { config: BannerConfig }) {
  return <PreviewFrame mount={widgets.mountBannerPreview} config={useMemo(() => toWidgetBanner(config), [config])} />;
}
export function FormPreview({ config }: { config: FormConfig }) {
  return <PreviewFrame mount={widgets.mountFormPreview} config={useMemo(() => toWidgetForm(config), [config])} />;
}
export function NewsletterPreview({ config }: { config: NewsletterConfig }) {
  return <PreviewFrame mount={widgets.mountNewsletterPreview} config={useMemo(() => toWidgetNewsletter(config), [config])} />;
}
export function SurveyPreview({ config }: { config: SurveyConfig }) {
  return <PreviewFrame mount={widgets.mountSurveyPreview} config={useMemo(() => toWidgetSurvey(config), [config])} />;
}
export function ItemPreview({ config }: { config: ItemConfig }) {
  return <PreviewFrame mount={widgets.mountItemPreview} config={useMemo(() => toWidgetItem(config), [config])} />;
}
