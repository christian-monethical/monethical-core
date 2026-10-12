interface Props {
  height?: number | string;
  width?: number | string;
  class?: string;
}

/** Shimmering placeholder; fixed dimensions keep the layout from shifting. */
export function Skeleton({ height = 16, width = '100%', class: cls }: Props) {
  return <span class={`skeleton${cls ? ` ${cls}` : ''}`} style={{ height, width }} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 5, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div class="skeleton-rows" role="status" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3, height = 120 }: { count?: number; height?: number }) {
  return (
    <div class="card-grid" role="status" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </div>
  );
}

/** Route-level fallback while a lazy chunk loads. */
export function PageSkeleton() {
  return (
    <div class="page" role="status" aria-busy="true">
      <Skeleton height={34} width={240} />
      <div class="stack-lg">
        <Skeleton height={96} />
        <Skeleton height={96} />
        <Skeleton height={96} />
      </div>
    </div>
  );
}
