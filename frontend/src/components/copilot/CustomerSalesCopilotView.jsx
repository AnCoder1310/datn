import { useEffect, useRef, useState } from 'react';
import { UsersRound, Info, ArrowLeft, X, MessageSquare, Compass, CalendarCheck } from 'lucide-react';
import { createId } from '../../lib/id';
import { CustomerList } from './customerWorkspace/CustomerList';
import { ConversationWorkspace } from './customerWorkspace/ConversationWorkspace';
import { CustomerIntelligenceRail } from './customerWorkspace/CustomerIntelligenceRail';
import { MessageTaskSuggestionsPanel } from './customerWorkspace/CustomerToolsDrawer';
import { TaskEditor } from './customerWorkspace/CreateTaskDialog';
import { DetailDialog, IconButton } from './customerWorkspace/WorkspacePrimitives';
import { salesCopilotApi } from '../../api/salesCopilotApi';
import { appendDraft, filterCustomers } from './customerWorkspace/workspaceData';
import { useCustomerWorkspace } from './customerWorkspace/useCustomerWorkspace';
import { useWorkspaceStorage } from './customerWorkspace/workspaceStorage';
import './customerWorkspace/customerWorkspace.css';

export function CustomerSalesCopilotView({ currentUser, active = true, navigationIntent, onOpenDocument }) {
  const workspace = useCustomerWorkspace(currentUser, active);
  const { customers, selectedId, draftEnabled } = workspace;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const storage = useWorkspaceStorage(currentUser?.user_id);
  const { drafts, starred } = storage;
  const [highlight, setHighlight] = useState(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [mobileView, setMobileView] = useState('queue'); // 'queue' | 'conversation' | 'intelligence'
  const [draftOpen, setDraftOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [sourceSnapshot, setSourceSnapshot] = useState(null);
  const [suggestionState, setSuggestionState] = useState(null);
  const composerRef = useRef(null);
  const intentRef = useRef(null);
  const selectedRef = useRef(selectedId);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const found = filterCustomers(customers, query, filter).find((item) => item.id === selectedId);
  const customer = found ? { ...found, starred: Boolean(starred[selectedId]) } : null;

  useEffect(() => {
    if (
      !navigationIntent ||
      intentRef.current === navigationIntent ||
      !customers.some((item) => item.id === navigationIntent.conversationId)
    )
      return;
    intentRef.current = navigationIntent;
    workspace.selectCustomer(navigationIntent.conversationId);
    setQuery('');
    setFilter('all');
    setCreatingTask(false);
    setSuggestionState(null);
    setDraftOpen(false);
    setMobileView('conversation');
    setHighlight(
      navigationIntent.taskId
        ? { taskId: navigationIntent.taskId, nonce: navigationIntent.nonce }
        : null
    );
  }, [navigationIntent, customers, workspace]);

  useEffect(() => {
    if (highlight && !highlight.taskId) {
      const timer = setTimeout(() => setHighlight(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [highlight]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  function selectCustomer(id) {
    setSourceSnapshot(null);
    setSuggestionState(null);
    workspace.selectCustomer(id);
    setHighlight(null);
    setDraftOpen(false);
    setCreatingTask(false);
    setMobileView('conversation');
  }

  function openDraft() {
    setDraftOpen(true);
    setMobileView('conversation');
    if (selectedId && (!customer?.draft || customer?.draftStale) && !workspace.draftBusy) {
      void runAction(() => workspace.generateDraft(selectedId));
    }
  }

  async function insertDraft(mode) {
    if (!customer?.draft || customer.draftStale) return;
    if (mode === 'copy') {
      try {
        await navigator.clipboard.writeText(customer.draft);
        setToast('Đã sao chép bản nháp vào clipboard.');
      } catch {
        setToast('Trình duyệt chưa cho phép sao chép.');
      }
      return;
    }
    const content = mode === 'append' ? appendDraft(drafts[selectedId] || '', customer.draft) : customer.draft;
    if (content.length > 6000) {
      setToast('Nội dung vượt quá 6.000 ký tự. Vui lòng rút gọn.');
      return;
    }
    storage.update('drafts', selectedId, content);
    setDraftOpen(false);
    setToast('Đã đưa bản nháp vào ô soạn tin.');
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function sendMessage(role = 'sales') {
    const id = selectedId;
    const content = (drafts[id] || '').trim();
    if (!content || workspace.sending || !customer?.loaded) return;
    try {
      const message = await workspace.sendMessage(id, content, role);
      if (message) {
        storage.update('drafts', id, (prev) => (prev?.trim() === content ? '' : prev));
        if (selectedRef.current === id) {
          setHighlight(null);
          setToast(role === 'customer' ? 'Đã gửi tin nhắn giả lập từ khách hàng.' : 'Đã gửi tin nhắn tư vấn.');
        }
      }
    } catch (error) {
      setToast(error.message || 'Không thể gửi tin nhắn.');
    }
  }

  async function runAction(action) {
    try {
      await action();
    } catch (error) {
      setToast(error.message || 'Thao tác không thành công.');
    }
  }

  async function showSource(messageId) {
    const id = selectedId;
    try {
      await workspace.ensureSource(id, messageId);
      if (selectedRef.current !== id) return;
      setMobileView('conversation');
      setHighlight({ messageId, nonce: createId('highlight') });
    } catch (error) {
      try {
        const status = await salesCopilotApi.getIntelligence(customer.customerId);
        if (!status.analysis_id) throw error;
        const message = await salesCopilotApi.getAnalyzedSource(
          customer.customerId,
          status.analysis_id,
          messageId
        );
        if (selectedRef.current === id) setSourceSnapshot(message);
      } catch {
        setToast(error.message);
      }
    }
  }

  function openTasksDialog() {
    setDraftOpen(false);
    setCreatingTask(true);
  }

  async function createTask(task) {
    const id = selectedId;
    await workspace.createTask(id, task);
    if (selectedRef.current === id) {
      setCreatingTask(false);
      setToast('Đã lưu công việc / lịch hẹn.');
    }
  }

  async function suggestTaskFromMessage(message) {
    const id = selectedId;
    if (!id || !message?.id) return;
    setDraftOpen(false);
    setCreatingTask(false);
    setSuggestionState({ loading: true, message, tasks: [], error: '' });
    try {
      const result = await salesCopilotApi.suggestTasksFromMessage(id, message.id);
      if (selectedRef.current !== id) return;
      setSuggestionState({ loading: false, message, tasks: result.tasks || [], error: '' });
    } catch (error) {
      if (selectedRef.current !== id) return;
      setSuggestionState({
        loading: false,
        message,
        tasks: [],
        error: error.message || 'Chưa bóc tách được công việc từ tin nhắn này.',
      });
    }
  }

  async function saveSuggestedBatch(payloads) {
    const id = selectedId;
    for (const payload of payloads) {
      await workspace.createTask(id, payload);
    }
    if (selectedRef.current === id) {
      setSuggestionState(null);
      setToast(`Đã lưu ${payloads.length} công việc từ tin nhắn.`);
    }
  }

  function askCopilotFromMessage(message) {
    const raw = (message?.content || '').trim();
    if (!raw) return;
    const models = (customer?.models || []).filter(Boolean);
    const mentionsModel = models.some((m) => raw.toLowerCase().includes(m.toLowerCase()));
    const queryText =
      models.length && !mentionsModel
        ? `${raw} (Xe khách đang quan tâm: ${models.join(', ')})`
        : raw;
    setMobileView('intelligence');
    if (!workspace.knowledge?.busy) {
      void workspace.searchKnowledge(queryText);
    } else {
      workspace.setKnowledgeQuery(queryText);
    }
  }

  async function saveStage(stage, reason = '') {
    const id = selectedId;
    await workspace.saveStage(id, stage, reason);
    if (selectedRef.current === id) {
      setToast('Đã cập nhật giai đoạn bán hàng.');
    }
  }

  async function runBatchAnalysis(ids) {
    setToast(`Bắt đầu phân tích ${ids.length} khách hàng…`);
    try {
      const result = await workspace.runBatchAnalysis(ids);
      setToast(`Đã phân tích xong: ${result.completed} thành công, ${result.failed} lỗi.`);
    } catch (error) {
      setToast(error.message || 'Lỗi khi phân tích hàng loạt.');
    }
  }

  return (
    <div className={`sales-workspace sw-enterprise-crm sw-mobile-${mobileView}`}>
      {/* 3-COLUMN ENTERPRISE WORKSPACE BODY */}
      <div className="sw-workspace-body sw-three-columns">
        {/* COLUMN 1: CUSTOMER QUEUE (280–320px) */}
        <div className="sw-column sw-col-queue">
          <CustomerList
            customers={customers}
            selectedId={selectedId}
            onSelect={selectCustomer}
            query={query}
            onQueryChange={setQuery}
            filter={filter}
            onFilterChange={setFilter}
            status={workspace.listStatus}
            error={workspace.listError}
            onRetry={workspace.loadList}
            analysisIds={workspace.analysisIds}
            batchProgress={workspace.batchProgress}
            onAnalyzeBatch={runBatchAnalysis}
            onCancelBatch={workspace.cancelBatchAnalysis}
          />
        </div>

        {/* COLUMN 2: CONVERSATION HUB (Flexible Width) */}
        <div className="sw-column sw-col-conversation">
          {customer ? (
            <ConversationWorkspace
              key={selectedId}
              customer={customer}
              onStar={() => storage.update('starred', selectedId, !starred[selectedId])}
              onCreateTask={openTasksDialog}
              highlight={highlight}
              composerValue={drafts[selectedId] || ''}
              onComposerChange={(value) => storage.update('drafts', selectedId, value)}
              onSend={(role) => sendMessage(role)}
              sending={workspace.sending}
              loading={workspace.loadingDetail || !customer.loaded}
              error={workspace.detailError}
              onRetry={() => workspace.loadDetails(selectedId, true)}
              composerRef={composerRef}
              onBack={() => setMobileView('queue')}
              onRefresh={() => runAction(() => workspace.refresh(selectedId))}
              onLoadOlder={(beforeSeq) =>
                runAction(() => workspace.loadMessages(selectedId, { beforeSeq }))
              }
              loadingOlder={workspace.loadingOlder}
              onSaveStage={saveStage}
              stageBusy={workspace.stageBusy}
              onSuggestTaskFromMessage={suggestTaskFromMessage}
              suggestingMessageId={suggestionState?.loading ? suggestionState.message?.id : null}
              onAskCopilotFromMessage={askCopilotFromMessage}
              draftOpen={draftOpen}
              onOpenDraft={openDraft}
              onCloseDraft={() => setDraftOpen(false)}
              draftEnabled={draftEnabled}
              onToggleDraft={() => runAction(workspace.toggleDraft)}
              preferenceBusy={workspace.preferenceBusy}
              onGenerateDraft={() => runAction(() => workspace.generateDraft(selectedId))}
              draftBusy={workspace.draftBusy}
              onInsertDraft={insertDraft}
            />
          ) : (
            <section className="sw-conversation sw-conversation-empty">
              <div className="sw-empty">
                <MessageSquare size={32} />
                <strong>Không gian tư vấn khách hàng VinFast</strong>
                <p>
                  {workspace.listStatus === 'loading'
                    ? 'Đang tải danh sách khách hàng…'
                    : 'Chọn một khách hàng bên trái để bắt đầu tư vấn.'}
                </p>
              </div>
            </section>
          )}
        </div>

        {/* COLUMN 3: CUSTOMER INTELLIGENCE RAIL (340–380px) */}
        <div className="sw-column sw-col-intelligence">
          {customer ? (
            <CustomerIntelligenceRail
              key={selectedId}
              customer={customer}
              onSourceClick={showSource}
              onConfirmFact={(field, value) => workspace.confirmFact(selectedId, field, value)}
              onToggleTask={(taskId) =>
                runAction(() =>
                  workspace.toggleTask(
                    selectedId,
                    customer.tasks.find((task) => task.id === taskId)
                  )
                )
              }
              onCreateTask={openTasksDialog}
              onEditTask={(task) => setEditingTask(task)}
              taskBusy={workspace.taskBusy}
              onAnalyze={() =>
                runAction(async () => {
                  await workspace.analyze(selectedId);
                  setToast('Đã phân tích xong cuộc hội thoại.');
                })
              }
              analyzing={workspace.analyzing}
              knowledge={workspace.knowledge}
              onLoadHistory={workspace.loadKnowledge}
              onQueryChange={workspace.setKnowledgeQuery}
              onSearch={workspace.searchKnowledge}
              onOpenDocument={onOpenDocument}
            />
          ) : (
            <aside className="sw-intelligence-rail sw-intelligence-empty">
              <div className="sw-rail-empty-wrap">
                <Compass size={28} />
                <p>Chọn khách hàng để xem dữ liệu chân dung 360° và lịch trình.</p>
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* MOBILE RESPONSIVE NAVIGATION SWITCHER */}
      <div className="sw-mobile-switcher" role="tablist">
        <button
          type="button"
          className={mobileView === 'queue' ? 'is-active' : ''}
          onClick={() => setMobileView('queue')}
        >
          <UsersRound size={15} />
          <span>Khách hàng</span>
        </button>

        <button
          type="button"
          className={mobileView === 'conversation' ? 'is-active' : ''}
          disabled={!customer}
          onClick={() => setMobileView('conversation')}
        >
          <MessageSquare size={15} />
          <span>Hội thoại</span>
        </button>

        <button
          type="button"
          className={mobileView === 'intelligence' ? 'is-active' : ''}
          disabled={!customer}
          onClick={() => setMobileView('intelligence')}
        >
          <Compass size={15} />
          <span>Thông tin 360°</span>
        </button>
      </div>

      {/* TASK CREATION MODAL DIALOG */}
      {creatingTask && customer && (
        <DetailDialog title="Tạo công việc / Lịch hẹn mới" onClose={() => setCreatingTask(false)}>
          <TaskEditor
            customer={customer}
            onCancel={() => setCreatingTask(false)}
            onSave={createTask}
          />
        </DetailDialog>
      )}

      {/* TASK EDITING MODAL DIALOG */}
      {editingTask && customer && (
        <DetailDialog title="Chỉnh sửa công việc / Lịch hẹn" onClose={() => setEditingTask(null)}>
          <TaskEditor
            customer={customer}
            task={editingTask}
            onCancel={() => setEditingTask(null)}
            onSave={async (changes) => {
              await workspace.editTask(selectedId, editingTask.id, changes);
              setEditingTask(null);
              setToast('Đã cập nhật công việc.');
            }}
          />
        </DetailDialog>
      )}

      {/* AI TASK SUGGESTION CONFIRMATION DIALOG */}
      {suggestionState && customer && (
        <DetailDialog
          title="Xác nhận công việc AI bóc tách từ tin nhắn"
          onClose={() => setSuggestionState(null)}
        >
          <MessageTaskSuggestionsPanel
            customer={customer}
            suggestionState={suggestionState}
            onDismiss={() => setSuggestionState(null)}
            onSaveBatch={saveSuggestedBatch}
          />
        </DetailDialog>
      )}

      {/* SOURCE SNAPSHOT MODAL */}
      {sourceSnapshot && (
        <DetailDialog title="Tin nguồn trong phiên phân tích" onClose={() => setSourceSnapshot(null)}>
          <p className="sw-snapshot-meta">
            {sourceSnapshot.sender_role === 'customer' ? 'Khách hàng' : 'Tư vấn viên'} ·{' '}
            {sourceSnapshot.sent_at}
          </p>
          <blockquote className="sw-snapshot-content">{sourceSnapshot.content}</blockquote>
        </DetailDialog>
      )}

      {/* TOAST NOTIFICATION BANNER */}
      <div className={`sw-toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast && (
          <>
            <Info size={15} />
            <span>{toast}</span>
            <IconButton label="Ẩn thông báo" onClick={() => setToast('')}>
              <X size={13} />
            </IconButton>
          </>
        )}
      </div>
    </div>
  );
}
