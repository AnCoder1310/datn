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
          backgroundColor: '#F5F8FA',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
          color: '#172B3A',
        }}>
          <div style={{
            maxWidth: 520,
            width: '100%',
            padding: 28,
            borderRadius: 16,
            background: '#FFFFFF',
            border: '1.5px solid rgba(101, 220, 203, 0.4)',
            boxShadow: '0 8px 30px rgba(101, 220, 203, 0.15)',
            textAlign: 'center',
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px', color: '#0f766e' }}>
              VinFast AI Sales Enablement
            </h2>
            <p style={{ fontSize: 13.5, color: '#64748B', lineHeight: 1.5, margin: '0 0 16px' }}>
              Giao diện gặp sự cố tạm thời. Vui lòng bấm nút bên dưới để tải lại trang.
            </p>
            {this.state.error?.message && (
              <pre style={{
                textAlign: 'left',
                background: '#F8FAFC',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 12,
                color: '#E11D48',
                overflowX: 'auto',
                margin: '0 0 18px',
                border: '1px solid #E2E8F0',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {this.state.error.message}
              </pre>
            )}
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 24px',
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
