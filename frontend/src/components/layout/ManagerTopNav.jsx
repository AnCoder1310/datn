import "./managerShell.css";
import {
  DashboardIcon,
  CheckCircleIcon,
  ClipboardIcon,
  UsersIcon,
  SparkleIcon,
  ShieldCheckIcon,
} from "../common/Icons";
import { AccountMenu } from "./AccountMenu";

export function ManagerTopNav({
  activeTab,
  onTabChange,
  currentUser,
  pendingCount = 0,
  onLogout,
  onSwitchRole,
}) {
  const menuItems = [
    { id: "dashboard", label: "Tổng quan", icon: DashboardIcon },
    { id: "assignments", label: "Giao bài", icon: ClipboardIcon },
    { id: "reports", label: "Lịch sử luyện tập", icon: CheckCircleIcon, badge: pendingCount > 0 ? pendingCount : null },
    { id: "scenarios", label: "Kịch bản AI", icon: SparkleIcon },
    { id: "audit", label: "Kiểm toán", icon: ShieldCheckIcon },
    { id: "accounts", label: "Tài khoản", icon: UsersIcon },
  ];

  const displayName = currentUser?.display_name?.trim() || "Quản lý";

  const renderItem = (item, className) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        className={`${className} ${isActive ? "active" : ""}`}
        onClick={() => onTabChange(item.id)}
        aria-current={isActive ? "page" : undefined}
      >
        <Icon style={{ width: 16, height: 16 }} />
        <span>{item.label}</span>
        {item.badge && (
          <span className="nav-tab-badge" aria-label={`${item.badge} bài chờ duyệt`}>
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <header className="top-header">
      <div className="top-header-inner">
        <button className="brand-section" type="button" onClick={() => onTabChange("dashboard")}>
          <span className="header-brand-logo">
            <img src="/vinfast-official-logo.png?v=silver" alt="VinFast" />
          </span>
          <div className="brand-info">
            <span className="brand-title">VinFast AI Sales</span>
            <span className="brand-subtitle">Manager Portal</span>
          </div>
        </button>

        <nav className="nav-tabs-pill desktop-nav-pill" aria-label="Điều hướng quản lý">
          {menuItems.map((item) => renderItem(item, "nav-tab-item"))}
        </nav>

        <div className="header-actions">
          <AccountMenu
            name={displayName}
            username={currentUser?.username}
            roleLabel="Quản lý"
            onLogout={onLogout}
            onSwitchRole={onSwitchRole}
          />
        </div>
      </div>

      <nav className="mobile-nav-pills" aria-label="Điều hướng quản lý (di động)">
        {menuItems.map((item) => renderItem(item, "mobile-nav-pill-item"))}
      </nav>
    </header>
  );
}
