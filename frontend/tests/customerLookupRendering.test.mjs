/** Render real JSX through Vite without a browser; live UI smoke is tracked separately. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, cacheDir: '.tmp/vite-ssr-tests', server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const { CustomerKnowledgeTool } = await server.ssrLoadModule('/src/components/copilot/customerWorkspace/CustomerKnowledgeTool.jsx');
const { CopilotView } = await server.ssrLoadModule('/src/components/copilot/CopilotView.jsx');
const { KnowledgeView } = await server.ssrLoadModule('/src/components/knowledge/KnowledgeView.jsx');
const { ConversationWorkspace } = await server.ssrLoadModule('/src/components/copilot/customerWorkspace/ConversationWorkspace.jsx');
const { DraftReply, ConversationSummary } = await server.ssrLoadModule('/src/components/copilot/customerWorkspace/ConversationIntelligence.jsx');
const { CustomerToolsDrawer, LeadStageEditor } = await server.ssrLoadModule('/src/components/copilot/customerWorkspace/CustomerToolsDrawer.jsx');
const { toWorkspaceCustomer } = await server.ssrLoadModule('/src/components/copilot/customerWorkspace/workspaceData.js');
test.after(() => server.close());

test('opening the knowledge library renders document entries without a stray PDF toolbar', () => {
  const html = renderToStaticMarkup(React.createElement(KnowledgeView));
  assert.match(html, /Kho kiến thức/);
  assert.match(html, /Mới cập nhật/);
  assert.doesNotMatch(html, /kb-drawer-layer|Mở tab mới|Toàn màn hình|kb-pdf-frame/);
});

function render(lookup = {}) {
  return renderToStaticMarkup(React.createElement(CustomerKnowledgeTool, {
    customer: { name: 'Khách kiểm thử', primaryModel: 'VF 5', model: 'VF 5 Plus' }, lookup,
    onSearch() {}, onLoadHistory() {}, onQueryChange() {},
  }));
}

test('default view opens the personal dashboard and defers the customer workspace', () => {
  // Legacy initialization accesses localStorage; the default customer-only view must not mount it.
  assert.equal(typeof globalThis.localStorage, 'undefined');
  const html = renderToStaticMarkup(React.createElement(CopilotView, { currentUser: { user_id: 'test' } }));
  assert.match(html, /Dashboard/);
  assert.match(html, /Lịch sự kiện/);
  assert.doesNotMatch(html, /Không gian tư vấn khách hàng/);
  assert.doesNotMatch(html, /Tra cứu &amp; Hỏi đáp xe|copilot-chat-card|Mở trang tra cứu đầy đủ/);
});

test('lookup offers general questions independently of the selected customer', () => {
  const html = render();
  assert.match(html, /So sánh VF 3 và VF 5/);
  assert.match(html, /Lịch sử tra cứu xe/);
  assert.doesNotMatch(html, /Lịch sử lưu riêng theo tài khoản sales/);
  assert.doesNotMatch(html, /Khách kiểm thử|Tra cứu riêng cho|Ngữ cảnh:/);
  assert.match(html, /maxLength="4000"/);
  assert.doesNotMatch(html, /Mở trang tra cứu đầy đủ|type="date"/);
});

test('shared Copilot drawer works without a selected customer', () => {
  const html = renderToStaticMarkup(React.createElement(CustomerToolsDrawer, { type: 'copilot', customer: null, knowledge: {} }));
  assert.match(html, /Trợ lý Copilot/);
  assert.match(html, /Lịch sử tra cứu xe/);
  assert.doesNotMatch(html, /Ngữ cảnh:|Tra cứu riêng cho/);
});

test('a saved draft is only shown after the composer opens it', () => {
  const customer = toWorkspaceCustomer({ conversation_id: 'c', customer_name: 'Khách QA' }, { messages: [{ id: 'm1', seq: 1, sender_role: 'customer' }], profile: {} }, { reply_version: 2, text: 'Nháp đã lưu', based_on_message_seq: 1 });
  const props = { customer, composerValue: '', draftEnabled: true };
  const closed = renderToStaticMarkup(React.createElement(ConversationWorkspace, { ...props, draftOpen: false }));
  assert.doesNotMatch(closed, /Nháp đã lưu|Bản nháp trả lời AI/);
  const open = renderToStaticMarkup(React.createElement(ConversationWorkspace, { ...props, draftOpen: true }));
  if (closed.includes('sw-draft-trigger')) assert.match(open, /Nháp đã lưu/);
  else assert.doesNotMatch(open, /Nháp đã lưu/);
});

test('empty lookup history enables the first question and explains the empty state', () => {
  const html = render({ loaded: true, messages: [], query: 'VF 5 Plus giá bao nhiêu?' });
  assert.match(html, /Chưa có lịch sử tra cứu. Bạn có thể hỏi ngay/);
  assert.doesNotMatch(html, /type="submit"[^>]*disabled/);
});

test('loading or failing the initial history does not disable lookup', () => {
  for (const state of [{ loading: true }, { syncError: 'Tải lịch sử quá lâu' }]) {
    const html = render({ ...state, query: 'VF 5 Plus giá bao nhiêu?' });
    assert.doesNotMatch(html, /type="submit"[^>]*disabled/);
  }
  assert.match(render({ syncError: 'Tải lịch sử quá lâu' }), /Tải lại lịch sử/);
});

test('the message surface handles CRM loading, empty and error states independently of lookup', () => {
  for (const state of [{ loading: true }, { loading: false }, { loading: false, error: 'Chưa tải được hội thoại' }]) {
    const customer = toWorkspaceCustomer({ conversation_id: 'customer-a', customer_name: 'Khách mới' }, !state.loading && !state.error ? { messages: [] } : undefined);
    const html = renderToStaticMarkup(React.createElement(ConversationWorkspace, { customer, composerValue: '', ...state }));
    assert.match(html, /class="sw-chat-surface"/);
    assert.match(html, state.loading ? /Đang tải hội thoại/ : state.error ? /Chưa tải được hội thoại/ : /Chưa có tin nhắn/);
    assert.match(render({ query: 'VF 7?' }), /Lịch sử tra cứu xe/);
  }
});

test('per-message lookup keeps the message visible and exposes a Copilot action', () => {
  const customer = toWorkspaceCustomer({ conversation_id: 'c', customer_name: 'Khách QA' }, {
    messages: [{ id: 'm1', sender_role: 'customer', content: 'Cho tôi hỏi VF 7.' }], profile: {},
  });
  const html = renderToStaticMarkup(React.createElement(ConversationWorkspace, {
    customer, composerValue: '', onAskCopilotFromMessage() {},
  }));
  assert.match(html, /sw-chat-surface[\s\S]*Hỏi Copilot[\s\S]*Cho tôi hỏi VF 7/);
});

test('draft offers replacement, append and copy when the composer already contains text', () => {
  const customer = toWorkspaceCustomer({ conversation_id: 'c' }, { messages: [{ id: 'm1', seq: 1, sender_role: 'customer' }], profile: {} }, { reply_version: 2, text: 'Bản nháp', based_on_message_seq: 1 });
  const html = renderToStaticMarkup(React.createElement(DraftReply, { customer, hasComposerText: true }));
  assert.match(html, /Thay thế/); assert.match(html, /Chèn thêm/); assert.match(html, /Sao chép/);
  const fresh = renderToStaticMarkup(React.createElement(DraftReply, { customer, hasComposerText: false }));
  assert.match(fresh, /Dùng bản nháp/);
  assert.doesNotMatch(fresh, /Thay thế|Chèn thêm/);
});

test('summary is compact and explicit; stage editor never renders numeric lead scores', () => {
  const customer = toWorkspaceCustomer({ conversation_id: 'c' }, { messages: [], memory: { quick_summary: 'Nhu cầu đã lưu' }, lead_status: { score: 99 } });
  const summary = renderToStaticMarkup(React.createElement(ConversationSummary, { customer }));
  assert.match(summary, /Tổng quan tình hình/); assert.match(summary, /Nhu cầu đã lưu/);
  assert.doesNotMatch(summary, /Outcomes —|Commitments —|Key Points —|Xem đầy đủ/);
  const stage = renderToStaticMarkup(React.createElement(LeadStageEditor, { customer }));
  assert.doesNotMatch(stage, /99|100|tiềm năng|lead-score/);
  const drawer = renderToStaticMarkup(React.createElement(CustomerToolsDrawer, { type: 'copilot', customer, knowledge: {} }));
  assert.match(drawer, /Kiến thức xe/); assert.doesNotMatch(drawer, /Không gửi cho khách|Theo khách đang chọn/);
});

test('summary and former profile entry show concise intelligence and keep fact editing collapsed', () => {
  const customer = toWorkspaceCustomer({ conversation_id: 'intelligence' }, {
    messages: [{ id: 'm1', sender_role: 'customer' }],
    profile: { interested_models: ['VF 3'], budget_vnd: 300000000, facts: [
      { field: 'budget_vnd', verification_status: 'confirmed', source_message_ids: ['m1'], note: 'Sales xác nhận' },
    ] }, memory: { quick_summary: 'Khách đang cân nhắc.', detailed_summary: 'Đã trao đổi phương án trả góp.',
      pending_items: ['Chờ hồ sơ vay'], key_promises: ['Sales gửi bảng tính chiều nay'], timeline: [
        { event_type: 'consulted', description: 'Tư vấn tài chính', source_message_id: 'm1' },
      ] },
  });
  for (const type of ['summary', 'profile']) {
    const html = renderToStaticMarkup(React.createElement(CustomerToolsDrawer, { type, customer, onConfirmFact() {} }));
    for (const text of ['Bối cảnh khách hàng', 'Tổng quan tình hình', '300.000.000',
      'Đã xác nhận bởi sales', 'Sửa dữ kiện', 'Tin nguồn 1', 'Khách đang cân nhắc.']) assert.ok(html.includes(text), text);
    assert.doesNotMatch(html, /Outcomes — Kết quả tư vấn|Diễn biến tư vấn|Hồ sơ hiện tại|Đã trao đổi phương án trả góp/);
    assert.match(html, /<details class="sw-ci-facts-accordion"><summary/);
  }
});

test('intelligence separates facts, recap and history without duplicate commitment lists', () => {
  const customer = toWorkspaceCustomer({ conversation_id: 'four' }, { message_total: 80, messages: [], memory: {
    quick_summary: 'Khách đang chọn lịch lái thử.', detailed_summary: 'Không hiển thị lại diễn biến dài.', customer_intelligence: {
      key_points: [{ topic: 'Sạc', question: 'Sạc tại nhà thế nào?', answer: 'Sales giải thích lắp bộ sạc.', status: 'answered', source_message_ids: ['old-m1'] }],
      outcomes: [{ text: 'Khách chọn VF 6.', source_message_ids: ['old-m2'] }],
      commitments: [{ actor: 'Sales', action: 'Gửi báo giá', time: 'Chiều nay', source_message_ids: ['old-m3'] }],
    },
  } });
  const html = renderToStaticMarkup(React.createElement(ConversationSummary, { customer }));
  for (const label of ['Tổng quan tình hình', 'Nội dung đã trao đổi', 'Sales giải thích lắp bộ sạc.', 'Nguồn 1']) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /Không hiển thị lại diễn biến dài/);
  assert.equal(html.split('Khách chọn VF 6.').length - 1, 0);
  assert.doesNotMatch(html, /Outcomes — Kết quả tư vấn|Commitments — Cam kết/);
});

test('access errors disable lookup and show the actual reason', () => {
  const html = render({ query: 'VF 5?', accessDenied: true, syncError: 'Hội thoại chưa được gán cho bạn.' });
  assert.match(html, /chưa được gán cho bạn/);
  assert.match(html, /type="submit"[^>]*disabled=""/);
  assert.doesNotMatch(html, /Bạn vẫn có thể tra cứu/);
});

test('restored checked answers include status, sources and request ID', () => {
  const html = render({ messages: [{ id: 'a1', role: 'assistant', seq: 2, content: 'Giá đã đối chiếu [C1].', response_data: {
    status: 'answered', request_id: 'request-restored', citations: [{ citation_id: 'C1', title: 'Bảng giá chính thức' }],
  } }] });
  assert.match(html, /Đã trả lời/); assert.match(html, /Bảng giá chính thức/); assert.match(html, /request-restored/);
});

test('partial and abstention have separate labels and missing information remains visible', () => {
  const partial = render({ messages: [{ id: 'p1', role: 'assistant', content: 'Có dữ kiện về VF 5.', response_data: {
    status: 'partial', missing_information: ['Nguồn chưa nêu chuẩn NEDC'], reason_code: 'insufficient_evidence',
  } }] });
  assert.match(partial, /Trả lời một phần/); assert.match(partial, /Nguồn chưa nêu chuẩn NEDC/);
  const abstained = render({ messages: [{ id: 'a1', role: 'assistant', content: 'Chưa xác minh được.', response_data: { status: 'abstained' } }] });
  assert.match(abstained, /Chưa đủ căn cứ trả lời/);
});

test('clarification keeps a follow-up composer and previous customer questions', () => {
  const html = render({ messages: [
    { id: 'u1', role: 'user', seq: 1, content: 'Thế còn bản Plus?' },
    { id: 'a1', role: 'assistant', seq: 2, content: 'Bạn đang hỏi mẫu xe nào?', response_data: { status: 'needs_clarification' } },
  ] });
  assert.match(html, /Cần làm rõ/); assert.match(html, /Thế còn bản Plus/); assert.match(html, /Hỏi tiếp về xe và chính sách/);
});

test('progress displays no unverified assistant draft', () => {
  const html = render({ busy: true, pendingQuery: 'So sánh VF 3 với VF 5', progress: 'Đang kiểm chứng nguồn' });
  assert.match(html, /Đang kiểm chứng nguồn/); assert.match(html, /So sánh VF 3 với VF 5/);
  assert.doesNotMatch(html, /sw-lookup-assistant/);
});

test('history synchronization failure blocks another question and offers read-only recovery', () => {
  const html = render({ query: 'Thử lại VF 5?', syncError: 'Chưa tải được lịch sử', needsSync: true });
  assert.match(html, /Chưa tải được lịch sử/); assert.match(html, /Tải lại lịch sử/);
  assert.match(html, /type="submit"[^>]*disabled=""/);
});


test('reply panel hides the old boilerplate and shows a failed request', () => {
  const customer = toWorkspaceCustomer({ conversation_id: 'c' }, {
    messages: [{ id: 'm1', seq: 1, sender_role: 'customer' }],
  }, { text: 'Nháp quảng cáo theo mẫu cũ', based_on_message_seq: 1 });
  const html = renderToStaticMarkup(React.createElement(DraftReply, {
    customer, error: 'Chưa tạo được gợi ý. Vui lòng thử lại.',
  }));
  assert.match(html, /role="alert">Chưa tạo được gợi ý/);
  assert.match(html, /Tạo gợi ý/);
  assert.doesNotMatch(html, /Nháp quảng cáo theo mẫu cũ|Dùng bản nháp/);
});
