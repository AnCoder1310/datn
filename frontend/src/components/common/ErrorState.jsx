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
        backgroundColor: '#FFFFFF',
        border: '1px solid #E5EAEE',
        borderRadius: 14,
        gap: 12,
      }}
    >
      <div style={{ color: '#172B3A', width: 36, height: 36, borderRadius: '50%', backgroundColor: '#F5F8FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AlertCircleIcon style={{ width: 20, height: 20 }} />
      </div>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#172B3A' }}>{title}</h3>
      <p style={{ fontSize: '0.88rem', color: '#64748B', maxWidth: 440 }}>{message}</p>
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
