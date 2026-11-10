import { CloseIcon, CheckIcon } from '../common/Icons';

export function NotificationDrawer({ isOpen, onClose, notifications, onMarkAllRead, onSelectNotification }) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'rgba(0, 0, 0,0.4)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          height: '100%',
          backgroundColor: '#FFFFFF',
          boxShadow: '-8px 0 24px rgba(0, 0, 0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E5E5E5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111111' }}>Thông báo hệ thống</h3>
            <span style={{ fontSize: '0.75rem', color: '#666666' }}>VinFast Sales Enablement Hub</span>
          </div>
          <button onClick={onClose} style={{ padding: 6, color: '#666666' }} aria-label="Đóng">
            <CloseIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ padding: '12px 24px', borderBottom: '1px solid #E5E5E5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: '#666666' }}>
            {notifications.filter((n) => !n.read).length} thông báo chưa đọc
          </span>
          <button
            onClick={onMarkAllRead}
            style={{ fontSize: '0.78rem', color: '#111111', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <CheckIcon style={{ width: 12, height: 12 }} /> Đánh dấu đã đọc
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {notifications.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                onSelectNotification(item);
                onClose();
              }}
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                backgroundColor: item.read ? '#FFFFFF' : '#FFFFFF',
                border: '1px solid #E5E5E5',
                marginBottom: 10,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: item.read ? 600 : 700, color: '#111111' }}>
                  {!item.read && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#111111', marginRight: 6 }} />}
                  {item.title}
                </h4>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#666666', lineHeight: 1.4, marginBottom: 8 }}>{item.content}</p>
              <span style={{ fontSize: '0.72rem', color: '#999999' }}>{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
