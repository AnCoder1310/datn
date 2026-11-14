import { AlertCircleIcon, RefreshIcon } from './Icons';
import { Button } from './Button';

export function ErrorState({
  title = 'Đã có sự cố xảy ra',
  message = 'Không thể tải dữ liệu vào lúc này. Vui lòng thử lại sau.',
  onRetry = null,
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        textAlign: 'center',
        backgroundColor: 'var(--color-white)',
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        gap: 12,
      }}
    >
      <div style={{ color: 'var(--color-text-primary)', width: 36, height: 36, borderRadius: '50%', backgroundColor: 'var(--color-white)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AlertCircleIcon style={{ width: 20, height: 20 }} />
      </div>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</h3>
      <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', maxWidth: 440 }}>{message}</p>
      {onRetry && (
        <div style={{ marginTop: 8 }}>
          <Button variant="outline" onClick={onRetry} icon={<RefreshIcon style={{ width: 14, height: 14 }} />}>
            Thử lại
          </Button>
        </div>
      )}
    </div>
  );
}
