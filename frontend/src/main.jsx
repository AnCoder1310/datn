import { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './App.css';
import App from './App.jsx';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Lỗi giao diện:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          backgroundColor: '#FFFFFF',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
          color: '#172B3A',
        }}>
          <div style={{
            maxWidth: 480,
            width: '100%',
            padding: 28,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #FFFFFF 0%, #F5FBF9 100%)',
            border: '1.5px solid rgba(101, 220, 203, 0.4)',
            boxShadow: '0 8px 30px rgba(101, 220, 203, 0.15)',
            textAlign: 'center',
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px', color: '#0f766e' }}>
              VinFast AI Sales Enablement
            </h2>
            <p style={{ fontSize: 13.5, color: '#64748B', lineHeight: 1.5, margin: '0 0 20px' }}>
              Giao diện vừa được cập nhật phiên bản mới. Bấm nút bên dưới để tải lại trang.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 22px',
                borderRadius: 999,
                background: 'rgba(101, 220, 203, 0.18)',
                border: '1.5px solid #65DCCB',
                color: '#0f766e',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
