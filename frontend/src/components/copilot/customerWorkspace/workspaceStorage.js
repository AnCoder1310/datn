import { useCallback, useRef, useState } from 'react';

export function readWorkspaceState(storage, ownerId) {
  if (!ownerId) return { drafts: {}, starred: {} };
  try {
    const value = JSON.parse(storage.getItem(`sales-workspace:v1:${ownerId}`) || '{}');
    const customerDrafts = Object.fromEntries(Object.entries(value.customerDrafts || {}).filter(([, text]) => typeof text === 'string'));
    return {
      drafts: Object.fromEntries(Object.entries(value.drafts || {}).filter(([, text]) => typeof text === 'string')),
      starred: Object.fromEntries(Object.entries(value.starred || {}).filter(([, flag]) => flag === true)),
      ...(Object.keys(customerDrafts).length ? { customerDrafts } : {}),
    };
  } catch { return { drafts: {}, starred: {} }; }
}

export function useWorkspaceStorage(ownerId) {
  const [state, setState] = useState(() => readWorkspaceState(globalThis.localStorage, ownerId));
  const current = useRef(state);
  const [error, setError] = useState('');
  const update = useCallback((section, id, value) => {
    const previous = current.current;
    const entries = previous[section] || {};
    const next = { ...previous, [section]: { ...entries, [id]: typeof value === 'function' ? value(entries[id]) : value } };
    current.current = next;
    setState(next);
    try {
      if (ownerId) globalThis.localStorage.setItem(`sales-workspace:v1:${ownerId}`, JSON.stringify(next));
      setError('');
    } catch { setError('Trình duyệt không lưu được nháp. Giữ trang mở để tránh mất nội dung.'); }
  }, [ownerId]);
  return { ...state, update, error };
}
