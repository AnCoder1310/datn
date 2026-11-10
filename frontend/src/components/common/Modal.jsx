import { useEffect } from 'react';
import { CloseIcon } from './Icons';

export function Modal({ isOpen, onClose, title, children, maxWidth = 640 }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(17, 17, 17, 0.45)',
                padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #E5E5E5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111111' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              padding: 6,
              borderRadius: 6,
              color: '#737373',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Đóng"
          >
            <CloseIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>
        <div style={{ padding: '24px', overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}
