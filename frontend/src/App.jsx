import scenariosFallback from './data/scenariosFallback.json';
import { useState, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { NotificationDrawer } from './components/layout/NotificationDrawer';
import { CopilotView } from './components/copilot/CopilotView';
import { RoleplayView } from './components/roleplay/RoleplayView';
import { KnowledgeView } from './components/knowledge/KnowledgeView';
import { LoginView } from './components/auth/LoginView';
import { ChangePasswordView } from './components/auth/ChangePasswordView';
import { ManagerReviewView } from './components/manager/ManagerReviewView';

import { authApi } from './api/authApi';
import { practiceApi } from './api/practiceApi';
import { notifyAgendaChange } from './components/copilot/agenda/agendaResource';

const DEMO_FALLBACK_USER = {
  user_id: 'advisor-demo',
  username: 'advisor.demo',
  display_name: 'Phạm Đình Duy',
  role: 'advisor',
  must_change_password: false,
};

function formatScenarios(list) {
  return (list || []).map((scenario) => {
    const model = scenario.title.match(/VF\s*[3-9]/i)?.[0].replace(/\s+/, ' ') || 'VinFast';
    return {
      ...scenario,
      model,
      model_badge: model,
      difficulty: { Easy: 'Cơ bản', Medium: 'Tiêu chuẩn', Hard: 'Nâng cao' }[scenario.difficulty] || scenario.difficulty,
    };
  });
}

export function App() {
  // Khởi tạo ngay lập tức với tài khoản Demo Advisor để giao diện & dữ liệu hiển thị tức thì 0ms
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const cached = localStorage.getItem('p043_user');
      if (cached) return JSON.parse(cached);
    } catch (e) { /* ignore */ void e; }
    return DEMO_FALLBACK_USER;
  });
  const [authStatus, setAuthStatus] = useState('authenticated');
  const [currentTab, setCurrentTab] = useState('copilot');
  const [scenarios, setScenarios] = useState(() => formatScenarios(scenariosFallback));
  const [scenarioStatus, setScenarioStatus] = useState('ready');
  const [scenarioReloadToken, setScenarioReloadToken] = useState(0);
  const [sourceDocumentId, setSourceDocumentId] = useState(null);
  const [sourceReference, setSourceReference] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState('');
  const [copilotOpened, setCopilotOpened] = useState(true);

  // Đồng bộ phiên thực tế với backend trong nền
  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const user = await authApi.me();
        if (!active) return;
        setCurrentUser(user);
        try { localStorage.setItem('p043_user', JSON.stringify(user)); } catch (e) { /* ignore */ void e; }
        if (user.role === 'advisor') {
          setCurrentTab('copilot');
        }
        setAuthStatus('authenticated');
        notifyAgendaChange();
        setScenarioReloadToken((v) => v + 1);
      } catch {
        // Tự động kích hoạt tài khoản Demo Advisor trên backend để phiên làm việc luôn hợp lệ
        try {
          const user = await authApi.login('advisor.demo', 'DemoAdvisor123!');
          if (!active) return;
          setCurrentUser(user);
          try { localStorage.setItem('p043_user', JSON.stringify(user)); } catch (e) { /* ignore */ void e; }
          setAuthStatus('authenticated');
          notifyAgendaChange();
          setScenarioReloadToken((v) => v + 1);
        } catch {
          // Tiếp tục sử dụng DEMO_FALLBACK_USER, không chặn giao diện
        }
      }
    }
    restoreSession();
    return () => { active = false; };
  }, []);

  // Tải danh sách kịch bản thực tế từ backend khi advisor đã sẵn sàng
  useEffect(() => {
    if (authStatus !== 'authenticated' || currentUser?.role !== 'advisor') return;
    async function loadBackendScenarios() {
      try {
        const backendList = await practiceApi.getScenarios();
        if (Array.isArray(backendList) && backendList.length > 0) {
          setScenarios(formatScenarios(backendList));
        }
      } catch {
        // Giữ kịch bản fallback đã nạp sẵn
      }
    }
    loadBackendScenarios();
  }, [authStatus, currentUser?.role, scenarioReloadToken, currentTab]);

  const handleLogin = async (username, password) => {
    const user = await authApi.login(username, password);
    setCurrentUser(user);
    try { localStorage.setItem('p043_user', JSON.stringify(user)); } catch (e) { /* ignore */ void e; }
    setAuthStatus('authenticated');
    notifyAgendaChange();
    setScenarioReloadToken((v) => v + 1);
    if (user.role === 'advisor') {
      setCurrentTab('copilot');
      setCopilotOpened(true);
    } else {
      setCurrentTab('manager');
    }
  };

  const handleSwitchRole = async (targetRole) => {
    try {
      if (targetRole === 'manager') {
        await handleLogin('manager.demo', 'DemoManager123!');
      } else {
        await handleLogin('advisor.demo', 'DemoAdvisor123!');
      }
    } catch (e) {
      console.error('Không thể chuyển vai trò:', e);
    }
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } finally {
      try { localStorage.removeItem('p043_user'); } catch (e) { /* ignore */ void e; }
      setCurrentUser(null);
      setAuthStatus('anonymous');
      setCurrentTab('copilot');
      setScenarios([]);
      setScenarioStatus('loading');
      setCopilotOpened(false);
      setCopilotQuery('');
    }
  };

  const handleChangePassword = async (currentPassword, newPassword) => {
    await authApi.changePassword(currentPassword, newPassword);
    try { localStorage.removeItem('p043_user'); } catch (e) { /* ignore */ void e; }
    setCurrentUser(null);
    setAuthStatus('anonymous');
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleSelectNotification = (item) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
    );
    if (item.link) {
      setCurrentTab(item.link);
      if (item.link === 'copilot') setCopilotOpened(true);
    }
  };

  if (authStatus === 'anonymous') {
    return <LoginView onLogin={handleLogin} />;
  }

  if (currentUser?.must_change_password) {
    return (
      <ChangePasswordView
        username={currentUser.username}
        onChangePassword={handleChangePassword}
        onLogout={handleLogout}
      />
    );
  }

  if (currentUser?.role === 'manager') {
    return (
      <ManagerReviewView
        currentUser={currentUser}
        onLogout={handleLogout}
        onSwitchRole={handleSwitchRole}
      />
    );
  }

  const advisorProfile = {
    name: currentUser?.display_name || 'Phạm Đình Duy',
    username: currentUser?.username || 'advisor.demo',
    role: 'Tư vấn viên',
  };

  return (
    <div className={`app-container${currentTab === 'copilot' ? ' copilot-app-container' : ''}${currentTab === 'knowledge' ? ' knowledge-app-container' : ''}${currentTab === 'roleplay' ? ' roleplay-app-container' : ''}`}>
      {/* GLOBAL TOP HEADER */}
      <Header
        currentTab={currentTab}
        onTabChange={(tab) => {
          setCurrentTab(tab);
          if (tab === 'copilot') setCopilotOpened(true);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        unreadCount={unreadCount}
        hasNotifications={notifications.length > 0}
        onOpenNotifications={() => setIsNotifOpen(true)}
        advisorProfile={advisorProfile}
        onLogout={handleLogout}
        onSwitchRole={handleSwitchRole}
      />

      {/* MAIN CONTENT AREA */}
      <main className={`main-content${currentTab === 'copilot' ? ' copilot-main-content' : ''}${currentTab === 'knowledge' ? ' knowledge-main-content' : ''}`}>
        {(currentTab === 'copilot' || copilotOpened) && (
          <div style={{ display: currentTab === 'copilot' ? 'flex' : 'none', flex: 1, minHeight: 0, height: '100%', flexDirection: 'column' }}>
            <CopilotView
              currentUser={currentUser}
              initialQuery={copilotQuery}
              onOpenDocument={(documentId, reference = null) => {
                setSourceDocumentId(documentId);
                setSourceReference(reference);
                setCurrentTab('knowledge');
              }}
            />
          </div>
        )}

        {currentTab === 'roleplay' && (
          <RoleplayView
            onOpenKnowledge={() => {
              setSourceDocumentId(null);
              setSourceReference(null);
              setCurrentTab('knowledge');
            }}
            scenarios={scenarios}
            scenarioStatus={scenarioStatus}
            onRetryScenarios={() => {
              setScenarioStatus('loading');
              setScenarioReloadToken((value) => value + 1);
            }}
          />
        )}

        {currentTab === 'knowledge' && (
          <KnowledgeView
            sourceDocumentId={sourceDocumentId}
            sourceReference={sourceReference}
          />
        )}
      </main>

      {/* NOTIFICATIONS FLYOUT */}
      <NotificationDrawer
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        notifications={notifications}
        onMarkAllRead={handleMarkAllRead}
        onSelectNotification={handleSelectNotification}
      />
    </div>
  );
}

export default App;
