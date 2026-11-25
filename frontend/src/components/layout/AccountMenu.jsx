import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LogoutIcon } from "../common/Icons";
import { UserCheck } from "lucide-react";
import "./accountMenu.css";

// Shared by top bars: the avatar opens a small account card with multi-role switcher
export function AccountMenu({ name, username, roleLabel, onLogout, onOpenProfile }) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const cardId = useId();
  const displayName = name?.trim() || roleLabel;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`account-menu-trigger ${open ? "is-open" : ""}`}
        aria-label={`Tài khoản ${displayName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="header-user-avatar" aria-hidden="true">{displayName.charAt(0)}</span>
        <span className="user-details">
          <span className="user-name">{displayName}</span>
          <span className="user-role">{roleLabel}</span>
        </span>
        <ChevronDown className="account-menu-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div id={cardId} className="account-menu-card" role="dialog" aria-label="Tài khoản">
          <div className="account-menu-identity">
            <span className="account-menu-avatar" aria-hidden="true">{displayName.charAt(0)}</span>
            <span className="account-menu-names">
              <strong>{displayName}</strong>
              {username && <span>{username}</span>}
            </span>
          </div>
          <dl className="account-menu-facts">
            <dt>Vai trò hiện tại</dt>
            <dd>{roleLabel}</dd>
          </dl>

          {onOpenProfile && (
            <button
              type="button"
              className="account-menu-profile-btn"
              onClick={() => {
                setOpen(false);
                onOpenProfile();
              }}
            >
              <UserCheck size={14} />
              <span>Xem hồ sơ chi tiết & KPI</span>
            </button>
          )}

          {logoutError && <p className="account-menu-error" role="alert">{logoutError}</p>}
          <button type="button" className="account-menu-logout" disabled={loggingOut} onClick={async () => {
            setLoggingOut(true);
            setLogoutError('');
            try {
              await onLogout();
            } catch (error) {
              setLogoutError(error.message || 'Chưa thể đăng xuất. Vui lòng thử lại.');
              setLoggingOut(false);
            }
          }}>
            <LogoutIcon aria-hidden="true" />
            {loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </button>
        </div>
      )}
    </div>
  );
}
