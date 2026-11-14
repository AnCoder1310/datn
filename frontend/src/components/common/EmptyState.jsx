export function EmptyState({
  icon = null,
  title = 'Không có dữ liệu',
  description = 'Hiện tại chưa có thông tin nào được hiển thị.',
  action = null,
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        backgroundColor: 'var(--color-white)',
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        gap: 12,
      }}
    >
      {icon && <div style={{ color: 'var(--color-text-secondary)', marginBottom: 4 }}>{icon}</div>}
      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</h3>
      <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', maxWidth: 420 }}>{description}</p>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
