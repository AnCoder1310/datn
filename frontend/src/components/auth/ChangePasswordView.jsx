import { useState } from 'react';

export function ChangePasswordView({ username, onChangePassword, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (newPassword.length < 12 || newPassword !== confirmation || newPassword === currentPassword) {
      setError('Mật khẩu mới phải khác mật khẩu cũ, có ít nhất 12 ký tự và khớp với ô xác nhận.');
      return;
    }
    setStatus('saving');
    try {
      await onChangePassword(currentPassword, newPassword);
    } catch (changeError) {
      setError(changeError.message || 'Không thể đổi mật khẩu. Vui lòng thử lại.');
      setStatus('idle');
    }
  };

  return (
    <main className="password-change-page">
      <section className="password-change-card">
        <p className="login-kicker">AI Sales Coach · Bảo mật tài khoản</p>
        <h1>Đặt mật khẩu riêng</h1>
        <p>Tài khoản <strong>{username}</strong> đang dùng mật khẩu khởi tạo. Hãy đổi mật khẩu trước khi tiếp tục.</p>
        {error && <div className="login-error" role="alert">{error}</div>}
        <form className="password-change-form" onSubmit={submit}>
          <label>Mật khẩu khởi tạo
            <input type="password" autoComplete="current-password" value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)} required />
          </label>
          <label>Mật khẩu mới (ít nhất 12 ký tự)
            <input type="password" autoComplete="new-password" value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)} minLength={12} required />
          </label>
          <label>Xác nhận mật khẩu mới
            <input type="password" autoComplete="new-password" value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)} minLength={12} required />
          </label>
          <button type="submit" disabled={status !== 'idle'}>
            {status === 'saving' ? 'Đang lưu…' : 'Đổi mật khẩu'}
          </button>
        </form>
        <p>Sau khi đổi, hãy đăng nhập lại bằng mật khẩu mới.</p>
        <button className="password-change-logout" type="button" disabled={status !== 'idle'} onClick={async () => {
          setStatus('logging-out');
          setError('');
          try {
            await onLogout();
          } catch (logoutError) {
            setStatus('idle');
            setError(logoutError.message || 'Chưa thể đăng xuất. Vui lòng thử lại.');
          }
        }}>{status === 'logging-out' ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
      </section>
    </main>
  );
}
