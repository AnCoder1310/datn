import { BellIcon } from '../common/Icons';
import { BotMessageSquare, GraduationCap, LibraryBig } from 'lucide-react';
import { AccountMenu } from './AccountMenu';

export function Header({
  currentTab,
  onTabChange,
  unreadCount = 0,
  hasNotifications = false,
  onOpenNotifications,
  advisorProfile,
  onLogout,
  onSwitchRole,
}) {
  const tabs = [
    { id: 'copilot', label: 'Trợ lý Co-pilot', icon: <BotMessageSquare size={17} strokeWidth={2} aria-hidden="true" /> },
    { id: 'roleplay', label: 'Phòng luyện tập', icon: <GraduationCap size={17} strokeWidth={2} aria-hidden="true" /> },
    { id: 'knowledge', label: 'Kho kiến thức', icon: <LibraryBig size={17} strokeWidth={2} aria-hidden="true" /> },
  ];

  return (
    <header className="top-header">
      <div className="top-header-inner">
        {/* BRAND LOGO & SYSTEM TITLE */}
        <button className="brand-section" type="button" onClick={() => onTabChange('copilot')}>
          <span className="header-brand-logo">
            <img src="/vinfast-official-logo.png?v=silver" alt="VinFast" />
          </span>
          <div className="brand-info">
            <span className="brand-title">VinFast AI Sales</span>
            <span className="brand-subtitle">Enablement Platform</span>
          </div>
        </button>

        {/* NAVIGATION PILL TABS (DESKTOP) */}
        <nav className="nav-tabs-pill desktop-nav-pill" aria-label="Main Navigation">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`nav-tab-item ${isActive ? 'active' : ''}`}
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* HEADER ACTIONS */}
        <div className="header-actions">
          {hasNotifications && (
            <button
              className="icon-badge-btn"
              onClick={onOpenNotifications}
              aria-label="Thông báo"
              title="Thông báo"
            >
              <BellIcon style={{ width: 16, height: 16 }} />
              {unreadCount > 0 && <span className="notif-badge-pill">{unreadCount}</span>}
            </button>
          )}

          <AccountMenu
            name={advisorProfile?.name}
            username={advisorProfile?.username}
            roleLabel={advisorProfile?.role || 'Tư vấn viên'}
            onLogout={onLogout}
            onSwitchRole={onSwitchRole}
          />
        </div>
      </div>

      {/* MOBILE NAV PILLS BAR */}
      <nav className="mobile-nav-pills" aria-label="Mobile Navigation">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              className={`mobile-nav-pill-item ${isActive ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}
