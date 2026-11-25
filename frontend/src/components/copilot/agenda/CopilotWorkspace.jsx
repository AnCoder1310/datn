import '../customerWorkspace/customerWorkspace.css';
import { useEffect, useState } from 'react';
import { CalendarDays, LayoutDashboard, UsersRound } from 'lucide-react';
import { salesCopilotApi } from '../../../api/salesCopilotApi';
import { CustomerSalesCopilotView } from '../CustomerSalesCopilotView';
import { CreateTaskDialog, TaskEditor } from '../customerWorkspace/CreateTaskDialog';
import { DetailDialog } from '../customerWorkspace/WorkspacePrimitives';
import { DashboardView, HomeShowroom } from './DashboardView';
import { CalendarView } from './CalendarView';
import { dateKey, mondayOf } from './agendaData';
import { CHANGE_EVENT } from './agendaResource';
import './agenda.css';

const pages = [['home', 'Trang chủ', LayoutDashboard], ['dashboard', 'Dashboard', LayoutDashboard], ['customers', 'Khách hàng', UsersRound], ['calendar', 'Lịch sự kiện', CalendarDays]];
export function CopilotWorkspace({ currentUser, onOpenDocument, crmTarget, startPage = 'home', onNavigatePage }) {
  const [page, setPage] = useState(crmTarget ? 'customers' : startPage); const [customerOpened, setCustomerOpened] = useState(Boolean(crmTarget) || startPage === 'customers');
  const [calendarOpened, setCalendarOpened] = useState(startPage === 'calendar'); const [intent, setIntent] = useState(crmTarget);
  const [calendarWeek, setCalendarWeek] = useState(() => mondayOf()); const [createCustomers, setCreateCustomers] = useState(null);
  const [editing, setEditing] = useState(null); const [focusedTask, setFocusedTask] = useState(null);
  const [openingTask, setOpeningTask] = useState(false);
  const [homeError, setHomeError] = useState('');
  useEffect(() => {
    const clearStaleFocus = () => setFocusedTask(null);
    window.addEventListener(CHANGE_EVENT, clearStaleFocus);
    return () => window.removeEventListener(CHANGE_EVENT, clearStaleFocus);
  }, []);
  function navigate(value) { if (value === 'customers') setCustomerOpened(true); if (value === 'calendar') setCalendarOpened(true); setPage(value); onNavigatePage?.(value); }
  function openCustomer(item) { if (!item.conversation_id) return; setIntent({ conversationId: item.conversation_id, tool: item.tool || (item.id ? 'tasks' : null), taskId: item.id, nonce: Date.now() }); navigate('customers'); }
  function openCalendar(value) { setCalendarWeek(mondayOf(value ? dateKey(value) : dateKey())); navigate('calendar'); }
  async function openHomeTask() {
    setOpeningTask(true);
    setHomeError('');
    try {
      const conversations = await salesCopilotApi.getConversations();
      setCreateCustomers([...new Map(conversations.map((item) => [item.customer_id, item])).values()]);
    } catch {
      setHomeError('Chưa tải được danh sách khách hàng để tạo công việc. Vui lòng thử lại.');
    } finally {
      setOpeningTask(false);
    }
  }
  return <div className={'copilot-shell ' + (page === 'home' ? 'is-home' : '')}><nav className="copilot-sidebar" aria-label="Các trang Trợ lý Copilot"><span className="copilot-sidebar-title">ĐIỀU HƯỚNG</span>{pages.filter(([id]) => page === 'home' || id !== 'home').map(([id, label, Icon]) => <button type="button" key={id} title={label} aria-current={page === id ? 'page' : undefined} className={(page === id ? 'is-active ' : '') + (id === 'home' ? 'home-nav-item' : '')} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>
    <main className="copilot-pages">
      <div className="copilot-subpage copilot-home-page" hidden={page !== 'home'}>
        <HomeShowroom onOpenCalendar={() => openCalendar()} onOpenQueue={() => navigate('customers')} onCreateTask={openHomeTask} creatingTask={openingTask} actionError={homeError} />
      </div>
      <div className="copilot-subpage" hidden={page !== 'dashboard'}><DashboardView currentUser={currentUser} active={page === 'dashboard'} onCreate={setCreateCustomers} onEdit={setEditing} onCustomer={openCustomer} onCalendar={openCalendar} focusedTask={focusedTask} onClearFocus={() => setFocusedTask(null)} /></div>
      {customerOpened && <div className="copilot-subpage copilot-customers" hidden={page !== 'customers'}><CustomerSalesCopilotView onOpenDocument={onOpenDocument} currentUser={currentUser} active={page === 'customers'} navigationIntent={intent} /></div>}
      {calendarOpened && <div className="copilot-subpage" hidden={page !== 'calendar'}><CalendarView currentUser={currentUser} active={page === 'calendar'} week={calendarWeek} onWeekChange={setCalendarWeek} onCreate={setCreateCustomers} onEdit={setEditing} onCustomer={openCustomer} onTask={(item) => { setFocusedTask(item); navigate('dashboard'); }} /></div>}
    </main>
    {createCustomers && <CreateTaskDialog customers={createCustomers} onClose={() => setCreateCustomers(null)} onCreate={async (values) => { await salesCopilotApi.createPersonalTask(values); setCreateCustomers(null); }} />}
    {editing && <DetailDialog title="Công việc / lịch hẹn" onClose={() => setEditing(null)}><TaskEditor key={editing.id} task={editing} onCancel={() => setEditing(null)} onSave={async (values) => { await salesCopilotApi.editTask(editing.id, values); setEditing(null); }} /></DetailDialog>}
  </div>;
}
