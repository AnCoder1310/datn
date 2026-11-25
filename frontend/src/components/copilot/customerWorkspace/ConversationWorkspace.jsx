import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Car,
  Check,
  ChevronDown,
  Copy,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { Avatar, StageBadge, IconButton } from './WorkspacePrimitives';
import { DraftReply } from './ConversationIntelligence';
import { LeadStageEditor } from './CustomerToolsDrawer';
import { replySuggestionsAvailable } from './workspaceFeatures';

function ConversationViewer({
  customer,
  highlight,
  onLoadOlder,
  loadingOlder,
  onSuggestTaskFromMessage,
  suggestingMessageId,
  onAskCopilotFromMessage,
}) {
  const scrollRef = useRef(null);
  const messageRefs = useRef(new Map());
  const [selectedMsgId, setSelectedMsgId] = useState(null);
  const [copiedMsgId, setCopiedMsgId] = useState(null);

  const lastMessageId = customer.messages.at(-1)?.id;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lastMessageId]);

  useEffect(() => {
    const target = highlight?.messageId && messageRefs.current.get(highlight.messageId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus({ preventScroll: true });
    }
  }, [highlight]);

  async function load(beforeSeq) {
    const stream = scrollRef.current;
    const height = stream.scrollHeight;
    const top = stream.scrollTop;
    await onLoadOlder(beforeSeq);
    requestAnimationFrame(() => {
      if (stream.isConnected) stream.scrollTop = top + stream.scrollHeight - height;
    });
  }

  async function copyText(message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMsgId(message.id);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div ref={scrollRef} className="sw-message-stream" aria-label="Lịch sử tin nhắn">
      {customer.nextBeforeSeq && (
        <button
          type="button"
          className="sw-secondary-button sw-load-older"
          disabled={loadingOlder}
          onClick={() => load(customer.nextBeforeSeq)}
        >
          {loadingOlder ? 'Đang tải…' : 'Tải tin nhắn cũ hơn'}
        </button>
      )}

      {!customer.messages.length && (
        <div className="sw-empty">
          <MessageSquare size={26} />
          <strong>Chưa có tin nhắn</strong>
          <p>Tin nhắn được lưu trong hội thoại sẽ hiển thị tại đây.</p>
        </div>
      )}

      {customer.messages.map((message, index) => {
        const isSales = message.role === 'sales';
        const isSuggesting = suggestingMessageId === message.id;
        const isSelected = selectedMsgId === message.id;
        const isCopied = copiedMsgId === message.id;

        return (
          <div key={message.id}>
            {index > 0 && message.seq > customer.messages[index - 1].seq + 1 && (
              <button
                type="button"
                className="sw-text-button sw-load-older"
                disabled={loadingOlder}
                onClick={() => load(message.seq)}
              >
                Tải phần hội thoại còn thiếu
              </button>
            )}

            {(index === 0 || customer.messages[index - 1].date !== message.date) && (
              <div className="sw-date-separator">
                <span>
                  {message.date
                    ? new Date(`${message.date}T12:00:00`).toLocaleDateString('vi-VN', {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : 'Chưa rõ ngày'}
                </span>
              </div>
            )}

            <article
              ref={(node) => {
                if (node) messageRefs.current.set(message.id, node);
                else messageRefs.current.delete(message.id);
              }}
              tabIndex={-1}
              onClick={() => setSelectedMsgId((prev) => (prev === message.id ? null : message.id))}
              className={`sw-chat-message ${isSales ? 'is-sales' : 'is-customer'} ${
                highlight?.messageId === message.id ? 'is-highlighted' : ''
              } ${isSelected ? 'is-selected-msg' : ''}`}
              aria-label={`Tin nhắn ${isSales ? 'Sales' : customer.name} lúc ${message.time}`}
            >
              <Avatar customer={customer} sales={isSales} size="small" />

              <div className="sw-message-body">
                <div className="sw-message-meta">
                  <strong className="sw-sender-label">
                    {isSales ? 'Tư vấn viên' : message.role === 'system' ? 'Hệ thống' : customer.name}
                  </strong>
                  <span className="sw-meta-dot">·</span>
                  <time>{message.time}</time>

                  <div className="sw-msg-actions" onClick={(e) => e.stopPropagation()}>
                    {onSuggestTaskFromMessage && (
                      <button
                        type="button"
                        className={`sw-msg-task-btn ${isSuggesting ? 'is-busy' : ''}`}
                        title="AI bóc tách thông tin và mở form tạo công việc từ tin nhắn này"
                        disabled={Boolean(suggestingMessageId)}
                        onClick={() => onSuggestTaskFromMessage(message)}
                      >
                        {isSuggesting ? <RefreshCw size={11} className="sw-spin" /> : <Sparkles size={11} />}
                        <span>{isSuggesting ? 'Đang bóc tách…' : 'Tạo việc'}</span>
                      </button>
                    )}

                    {onAskCopilotFromMessage && (
                      <button
                        type="button"
                        className="sw-msg-task-btn sw-msg-copilot-btn"
                        title="Hỏi Trợ lý Copilot về nội dung tin nhắn này"
                        onClick={() => onAskCopilotFromMessage(message)}
                      >
                        <Bot size={11} />
                        <span>Hỏi Copilot</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="sw-msg-task-btn"
                      title="Sao chép nội dung tin nhắn"
                      onClick={() => copyText(message)}
                    >
                      {isCopied ? <Check size={11} /> : <Copy size={11} />}
                      <span>{isCopied ? 'Đã chép' : 'Sao chép'}</span>
                    </button>
                  </div>
                </div>

                <div className="sw-message-content">
                  <p>{message.content}</p>
                </div>
              </div>
            </article>
          </div>
        );
      })}
    </div>
  );
}

function MessageComposer({
  salesValue,
  customerValue,
  onChange,
  onSend,
  inputRef,
  customer,
  sending,
  disabled,
  draft,
}) {
  const [senderRole, setSenderRole] = useState('sales');
  const isSales = senderRole === 'sales';
  const value = isSales ? salesValue : customerValue;

  function changeRole(role) {
    setSenderRole(role);
    if (role === 'customer') draft.onClose();
  }

  function submit(event) {
    event?.preventDefault();
    if (!value.trim() || sending || disabled) return;
    onSend(senderRole);
  }

  return (
    <form className="sw-composer" onSubmit={submit}>
      {replySuggestionsAvailable && isSales && draft.open && customer.canSuggestReply && (
        <DraftReply
          customer={customer}
          busy={draft.busy}
          error={draft.error}
          onGenerate={draft.onGenerate}
          onInsert={draft.onInsert}
          hasComposerText={Boolean(value.trim())}
          onDismiss={draft.onClose}
        />
      )}

      {/* SENDER ROLE TOGGLE (SALES VS CUSTOMER SIMULATOR) */}
      <div className="sw-role-toggle-bar">
        <span className="sw-role-label">Gửi với tư cách:</span>
        <div className="sw-role-pill-group">
          <button
            type="button"
            className={`sw-role-pill ${senderRole === 'sales' ? 'is-active' : ''}`}
            aria-pressed={isSales}
            onClick={() => changeRole('sales')}
          >
            Tư vấn viên (Sales)
          </button>
          <button
            type="button"
            className={`sw-role-pill is-customer-pill ${senderRole === 'customer' ? 'is-active' : ''}`}
            aria-pressed={!isSales}
            onClick={() => changeRole('customer')}
            title="Đóng vai khách hàng đặt câu hỏi để kiểm tra AI bóc tách việc và gợi ý trả lời"
          >
            Khách hàng (Giả lập)
          </button>
        </div>
      </div>

      <div className={`sw-composer-box ${senderRole === 'customer' ? 'is-customer-mode' : ''}`}>
        <textarea
          ref={inputRef}
          aria-label={`Tin nhắn cho ${customer.name}`}
          placeholder={
            senderRole === 'customer'
              ? 'Nhập tin nhắn giả lập của khách hàng…'
              : "Nhập nội dung tư vấn…"
          }
          rows={1}
          maxLength={6000}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value, senderRole)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit(event);
            }
          }}
        />

        <div className="sw-composer-tools">
          {replySuggestionsAvailable && isSales && (
            <button
              type="button"
              className={`sw-draft-trigger ${draft.open ? 'is-active' : ''}`}
              aria-label="Gợi ý trả lời AI"
              title={customer.canSuggestReply ? 'Soạn bản nháp trả lời tin nhắn mới nhất của khách' : 'Có thể tạo gợi ý khi khách là người nhắn gần nhất'}
              aria-expanded={draft.open}
              disabled={disabled || !customer.canSuggestReply}
              onClick={draft.open ? draft.onClose : draft.onOpen}
            >
              {draft.busy ? <RefreshCw size={13} className="sw-spin" /> : <Sparkles size={14} />}
              <span>{draft.busy ? 'Đang gợi ý…' : 'Gợi ý trả lời'}</span>
            </button>
          )}

          <button
            className="sw-primary-button sw-send-button"
            type="submit"
            aria-label={sending ? 'Đang gửi tin nhắn' : 'Gửi tin nhắn'}
            disabled={!value.trim() || sending || disabled}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </form>
  );
}

export function ConversationWorkspace({
  customer,
  onStar,
  highlight,
  composerValue,
  customerComposerValue,
  onComposerChange,
  onSend,
  composerRef,
  onBack,
  loading,
  error,
  onRetry,
  sending,
  onRefresh,
  draftOpen,
  onOpenDraft,
  onCloseDraft,
  draftEnabled,
  onToggleDraft,
  preferenceBusy,
  onGenerateDraft,
  draftBusy,
  draftError,
  onInsertDraft,
  onLoadOlder,
  loadingOlder,
  onSaveStage,
  stageBusy,
  onCreateTask,
  onSuggestTaskFromMessage,
  suggestingMessageId,
  onAskCopilotFromMessage,
}) {
  const [stageOpen, setStageOpen] = useState(false);
  const stageRef = useRef(null);
  const stageTrigger = useRef(null);
  const detailLoading = loading && !customer.loaded && !error;

  const primaryModel = customer.primaryModel ? `VF ${customer.primaryModel}` : customer.model || '';

  useEffect(() => {
    if (!stageOpen) return;
    stageRef.current?.querySelector('select')?.focus();
    function close(event) {
      if (event.type === 'keydown' && event.key === 'Escape') {
        event.preventDefault();
        setStageOpen(false);
        stageTrigger.current?.focus();
      }
      if (
        event.type === 'pointerdown' &&
        !stageRef.current?.contains(event.target) &&
        !stageTrigger.current?.contains(event.target)
      ) {
        setStageOpen(false);
      }
    }
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [stageOpen]);

  return (
    <section className="sw-conversation" aria-label={`Không gian tư vấn ${customer.name}`}>
      {/* 1. CUSTOMER HEADER BAR */}
      <div className="sw-customer-header">
        <div className="sw-customer-header-left">
          <IconButton label="Về danh sách khách hàng" className="sw-mobile-back-button" onClick={onBack}>
            <ArrowLeft size={16} />
          </IconButton>

          <Avatar customer={customer} />

          <div className="sw-customer-identity">
            <div className="sw-name-row">
              <h1 className="sw-customer-title">{customer.name}</h1>
              {primaryModel && (
                <span className="sw-header-model-badge">
                  <Car size={12} /> {primaryModel}
                </span>
              )}
            </div>

            <div className="sw-contact-meta-row">
              {customer.phone && customer.phone !== 'Chưa cập nhật' && (
                <a href={`tel:${customer.phone}`} className="sw-contact-link">
                  <Phone size={11} />
                  <span>{customer.phone}</span>
                </a>
              )}
              {customer.location && customer.location !== 'Chưa cập nhật' && (
                <span className="sw-location-tag">
                  <MapPin size={11} />
                  <span>{customer.location}</span>
                </span>
              )}

              {/* LEAD STAGE DROPDOWN */}
              <div className="sw-stage-wrap">
                <button
                  ref={stageTrigger}
                  type="button"
                  className="sw-stage-trigger"
                  aria-label={`Giai đoạn hiện tại: ${customer.stage}. Bấm để đổi.`}
                  aria-expanded={stageOpen}
                  disabled={!customer.loaded}
                  onClick={() => setStageOpen(!stageOpen)}
                >
                  <StageBadge customer={customer} />
                  <ChevronDown size={11} />
                </button>

                {stageOpen && (
                  <section className="sw-stage-popover" ref={stageRef} role="dialog" aria-label="Sửa giai đoạn bán hàng">
                    <div className="sw-inline-heading">
                      <strong>Cập nhật giai đoạn phễu</strong>
                      <IconButton
                        label="Đóng"
                        onClick={() => {
                          setStageOpen(false);
                          stageTrigger.current?.focus();
                        }}
                      >
                        <X size={15} />
                      </IconButton>
                    </div>
                    <LeadStageEditor
                      customer={customer}
                      busy={stageBusy}
                      onSave={async (...args) => {
                        await onSaveStage(...args);
                        setStageOpen(false);
                        stageTrigger.current?.focus();
                      }}
                    />
                  </section>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="sw-customer-header-actions">
          {onCreateTask && (
            <button
              type="button"
              className="sw-header-btn-action"
              onClick={onCreateTask}
              title="Tạo lịch hẹn lái thử hoặc công việc theo dõi"
            >
              <Plus size={13} strokeWidth={2.2} />
              <span>Tạo việc</span>
            </button>
          )}

          <IconButton
            label={customer.starred ? 'Bỏ đánh dấu khách ưu tiên' : 'Đánh dấu khách ưu tiên'}
            className={`sw-star-toggle ${customer.starred ? 'sw-starred' : ''}`}
            aria-pressed={customer.starred}
            onClick={onStar}
          >
            <Star size={15} fill={customer.starred ? 'currentColor' : 'none'} />
          </IconButton>
        </div>
      </div>

      {/* 2. CHAT SURFACE & COMPOSER */}
      <div className="sw-tab-panel">
        {error && (
          <div className="sw-error-banner" role="alert">
            <span>{error}</span>
            <button type="button" className="sw-text-button" onClick={onRetry}>
              Thử lại
            </button>
          </div>
        )}

        {/* THREAD STATS & REFRESH BAR */}
        <div className="sw-conversation-subbar">
          <span className="sw-channel-badge">
            <MessageSquare size={12} /> {customer.messages.length}/{customer.messageTotal} tin nhắn
          </span>
          <IconButton label="Làm mới tin nhắn" disabled={loading} onClick={onRefresh}>
            <RefreshCw size={13} className={loading ? 'sw-spin' : ''} />
          </IconButton>
        </div>

        <div className="sw-chat-surface">
          {detailLoading ? (
            <div className="sw-detail-loading" role="status" aria-label="Đang tải hội thoại">
              <div className="sw-skeleton-line" />
              {[1, 2, 3, 4].map((id) => (
                <div className="sw-skeleton" key={id} />
              ))}
            </div>
          ) : (
            <ConversationViewer
              customer={customer}
              highlight={highlight}
              onLoadOlder={onLoadOlder}
              loadingOlder={loadingOlder}
              onSuggestTaskFromMessage={onSuggestTaskFromMessage}
              suggestingMessageId={suggestingMessageId}
              onAskCopilotFromMessage={onAskCopilotFromMessage}
            />
          )}
        </div>

        {!detailLoading && (
          <MessageComposer
            salesValue={composerValue}
            customerValue={customerComposerValue}
            onChange={onComposerChange}
            onSend={(role) => onSend(role)}
            inputRef={composerRef}
            customer={customer}
            sending={sending}
            disabled={!customer.loaded}
            draft={{
              open: draftOpen,
              enabled: draftEnabled,
              onOpen: onOpenDraft,
              onClose: onCloseDraft,
              onToggle: onToggleDraft,
              preferenceBusy,
              onGenerate: onGenerateDraft,
              busy: draftBusy,
              error: draftError,
              onInsert: onInsertDraft,
            }}
          />
        )}
      </div>
    </section>
  );
}
