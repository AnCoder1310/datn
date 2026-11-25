import { useState, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { NotificationDrawer } from './components/layout/NotificationDrawer';
import { CopilotView } from './components/copilot/CopilotView';
import { RoleplayView } from './components/roleplay/RoleplayView';
import { KnowledgeView } from './components/knowledge/KnowledgeView';
import { LoginView } from './components/auth/LoginView';
import { ChangePasswordView } from './components/auth/ChangePasswordView';
import { ManagerReviewView } from './components/manager/ManagerReviewView';
import { ProfileView } from './components/profile/ProfileView';
import { PublicTestDrivePortal } from './components/public/PublicTestDrivePortal';

import { authApi } from './api/authApi';
import { practiceApi } from './api/practiceApi';
import { salesCopilotApi } from './api/salesCopilotApi';
import { notifyAgendaChange } from './components/copilot/agenda/agendaResource';

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
  const [currentUser, setCurrentUser] = useState(null);
  const [authStatus, setAuthStatus] = useState('checking');
  const [sessionError, setSessionError] = useState('');
  const [sessionRetry, setSessionRetry] = useState(0);
  const [currentTab, setCurrentTab] = useState('copilot');
  const [copilotStartPage, setCopilotStartPage] = useState('home');
  const [copilotNavigation, setCopilotNavigation] = useState(0);
  const [scenarios, setScenarios] = useState([]);
  const [scenarioStatus, setScenarioStatus] = useState('loading');
  const [scenarioReloadToken, setScenarioReloadToken] = useState(0);
  const [sourceDocumentId, setSourceDocumentId] = useState(null);
  const [sourceReference, setSourceReference] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState('');
  const [copilotOpened, setCopilotOpened] = useState(true);
  const [crmTarget, setCrmTarget] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    async function restoreSession() {
      try {
        const session = await authApi.getSession({ signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!session?.authenticated || !session.user) {
          setAuthStatus('anonymous');
          return;
        }
        setCurrentUser(session.user);
        setCurrentTab(session.user.role === 'manager' ? 'manager' : 'copilot');
        setAuthStatus('authenticated');
      } catch (error) {
        if (!controller.signal.aborted) {
          setSessionError(error.message || 'Không thể kết nối máy chủ.');
          setAuthStatus('unavailable');
        }
      }
    }
    void restoreSession();
    return () => controller.abort();
  }, [sessionRetry]);

  const ownerId = currentUser?.user_id;
  const role = currentUser?.role;
  useEffect(() => {
    if (authStatus !== 'authenticated' || role !== 'advisor') return;
    const controller = new AbortController();
    async function loadScenarios() {
      try {
        const list = await practiceApi.getScenarios({ signal: controller.signal });
        if (!controller.signal.aborted) {
          setScenarios(formatScenarios(list));
          setScenarioStatus('ready');
        }
      } catch {
        if (!controller.signal.aborted) setScenarioStatus('error');
      }
    }
    void loadScenarios();
    return () => controller.abort();
  }, [authStatus, ownerId, role, scenarioReloadToken]);

  const handleLogin = async (username, password) => {
    const user = await authApi.login(username, password);
    setCurrentUser(user);
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


  const clearSession = () => {
    setCurrentUser(null);
    setAuthStatus('anonymous');
    setCurrentTab('copilot');
    setCopilotStartPage('home');
    setScenarios([]);
    setScenarioStatus('loading');
    setCopilotOpened(false);
    setCopilotQuery('');
    setCrmTarget(null);
    setSourceDocumentId(null);
    setSourceReference(null);
    setNotifications([]);
    setIsNotifOpen(false);
    notifyAgendaChange();
  };

  const handleLogout = async () => {
    await authApi.logout();
    clearSession();
  };

  const handleUpdateProfile = async (updated) => {
    const newName = (updated?.name || updated?.display_name)?.trim();
    if (newName && newName !== currentUser?.display_name) {
      const savedUser = await authApi.updateProfile(newName);
      setCurrentUser(savedUser);
    }
  };

  const handleChangePassword = async (currentPassword, newPassword) => {
    await authApi.changePassword(currentPassword, newPassword);
    clearSession();
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

  if (authStatus === 'checking' || authStatus === 'unavailable') {
    return (
      <main className="session-gate" aria-labelledby="session-heading">
        <div>
          <h1 id="session-heading">VinFast AI Sales</h1>
          {authStatus === 'checking' ? <p role="status">Đang kiểm tra phiên đăng nhập…</p> : (
            <>
              <p role="alert">{sessionError}</p>
              <button type="button" className="login-submit" onClick={() => {
                setAuthStatus('checking');
                setSessionRetry((value) => value + 1);
              }}>Thử lại</button>
            </>
          )}
        </div>
      </main>
    );
  }

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

  // MÀN HÌNH QUẢN LÝ
  if (currentUser?.role === 'manager') {
    return (
      <ManagerReviewView
        currentUser={currentUser}
        onLogout={handleLogout}
      />
    );
  }

  const advisorProfile = {
    name: currentUser.display_name,
    username: currentUser.username,
    role: 'Tư vấn viên',
  };

  return (
    <div className={`app-container${currentTab === 'copilot' ? ' copilot-app-container' : ''}${currentTab === 'knowledge' ? ' knowledge-app-container' : ''}${currentTab === 'roleplay' ? ' roleplay-app-container' : ''}`}>
      {/* GLOBAL TOP HEADER */}
      <Header
        currentTab={currentTab}
        onTabChange={(tab) => {
          if (tab === 'home') {
            setCurrentTab('copilot');
            setCrmTarget(null);
            setCopilotStartPage('home');
            setCopilotNavigation((value) => value + 1);
            setCopilotOpened(true);
            return;
          }
          setCurrentTab(tab);
          if (tab === 'copilot') {
            setCrmTarget(null);
            setCopilotStartPage('dashboard');
            setCopilotNavigation((value) => value + 1);
            setCopilotOpened(true);
          }
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        unreadCount={unreadCount}
        hasNotifications={notifications.length > 0}
        onOpenNotifications={() => setIsNotifOpen(true)}
        advisorProfile={advisorProfile}
        onLogout={handleLogout}
        homeActive={currentTab === 'copilot' && copilotStartPage === 'home'}
      />

      {/* MAIN CONTENT AREA */}
      <main className={`main-content${currentTab === 'copilot' ? ' copilot-main-content' : ''}${currentTab === 'knowledge' ? ' knowledge-main-content' : ''}`}>
        {(currentTab === 'copilot' || copilotOpened) && (
          <div style={{ display: currentTab === 'copilot' ? 'flex' : 'none', flex: 1, minHeight: 0, height: '100%', flexDirection: 'column' }}>
            <CopilotView
              currentUser={currentUser}
              initialQuery={copilotQuery}
              crmTarget={crmTarget}
              navigationKey={copilotNavigation}
              startPage={copilotStartPage}
              onNavigatePage={setCopilotStartPage}
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

        {currentTab === 'portal' && (
          <PublicTestDrivePortal
            onBack={() => setCurrentTab('copilot')}
            onOpenLeadInCrm={async (conversationId) => {
              await salesCopilotApi.getConversationDetails(conversationId);
              setCrmTarget({ conversationId, nonce: Date.now() });
              setCopilotStartPage('customers');
              setCurrentTab('copilot');
              setCopilotOpened(true);
            }}
          />
        )}

        {currentTab === 'profile' && (
          <ProfileView
            key={currentUser.user_id}
            currentUser={currentUser}
            onUpdateProfile={handleUpdateProfile}
            onChangePassword={handleChangePassword}
            onOpenRoleplay={() => setCurrentTab('roleplay')}
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
