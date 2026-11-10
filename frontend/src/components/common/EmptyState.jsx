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
        backgroundColor: '#FFFFFF',
        border: '1px solid #E5E5E5',
        borderRadius: 14,
        gap: 12,
      }}
    >
      {icon && <div style={{ color: '#666666', marginBottom: 4 }}>{icon}</div>}
      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#111111' }}>{title}</h3>
      <p style={{ fontSize: '0.88rem', color: '#666666', maxWidth: 420 }}>{description}</p>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
