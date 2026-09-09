
/**
 * Skeleton - Shimmer placeholder element for progressive loading.
 */
export function Skeleton({ width = '100%', height = '16px', borderRadius = '6px', className = '', style = {} }) {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: '#e2e8f0',
        ...style
      }}
    />
  );
}

export function SkeletonCard({ height = '120px', style = {} }) {
  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: '14px',
        padding: '20px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height,
        ...style
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width="40px" height="40px" borderRadius="10px" />
        <Skeleton width="60px" height="20px" borderRadius="999px" />
      </div>
      <div>
        <Skeleton width="80px" height="28px" style={{ marginBottom: '8px' }} />
        <Skeleton width="120px" height="14px" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }) {
  return (
    <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} width={`${100 / cols}%`} height="18px" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: '16px', padding: '12px 0', borderBottom: r < rows - 1 ? '1px solid #f8fafc' : 'none' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} width={`${100 / cols}%`} height="14px" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
