export function Skeleton({ width = '100%', height = '16px', borderRadius = '6px', className = '', style = {} }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}

export function ScenarioCardSkeleton() {
  return (
    <div className="card-white" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Skeleton width="120px" height="22px" borderRadius="999px" />
        <Skeleton width="90px" height="22px" borderRadius="999px" />
        <Skeleton width="70px" height="22px" borderRadius="999px" />
      </div>
      <Skeleton width="85%" height="24px" />
      <div style={{ padding: 14, backgroundColor: '#F5F8FA', borderRadius: 10, display: 'flex', gap: 12 }}>
        <Skeleton width="40px" height="40px" borderRadius="50%" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton width="60%" height="16px" />
          <Skeleton width="90%" height="14px" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <Skeleton width="90px" height="22px" borderRadius="999px" />
        <Skeleton width="110px" height="22px" borderRadius="999px" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <Skeleton width="130px" height="16px" />
        <Skeleton width="140px" height="36px" borderRadius="999px" />
      </div>
    </div>
  );
}
