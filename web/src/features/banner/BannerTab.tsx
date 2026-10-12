import { useQuery } from '../../api/hooks';
import { K } from '../../api/keys';
import { SkeletonRows } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/States';
import type { TabProps } from '../sites/tabs';
import { getBanner } from './api';
import { BannerEditor } from './BannerEditor';

export default function BannerTab({ site }: TabProps) {
  const banner = useQuery(K.banner(site.site_id), () => getBanner(site.site_id));
  if (banner.data) return <BannerEditor key={banner.data.version} siteId={site.site_id} stored={banner.data} />;
  if (banner.error !== undefined) return <ErrorState error={banner.error} onRetry={() => void banner.refetch()} />;
  return <SkeletonRows rows={6} height={56} />;
}
