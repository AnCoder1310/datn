import { useEffect, useState, useSyncExternalStore } from 'react';
import { salesCopilotApi } from '../../../api/salesCopilotApi';
import { createSalesLookupStore } from './customerLookupStore';

/** Keep a separate lookup session and draft for each conversation within the account. */
export function useSalesLookup(ownerId, conversationId) {
  // Recreate the store on account changes, so old requests and drafts cannot cross accounts.
  const [scoped, setScoped] = useState(() => ({ ownerId, store: createSalesLookupStore(salesCopilotApi) }));
  if (scoped.ownerId !== ownerId) {
    setScoped({ ownerId, store: createSalesLookupStore(salesCopilotApi) });
  }
  const { store } = scoped;
  const entries = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => () => store.abort(), [store]);
  return {
    state: entries[conversationId] || {},
    load: (beforeSeq, force) => conversationId ? store.load(conversationId, beforeSeq, force) : Promise.resolve(),
    ask: (query) => conversationId ? store.ask(conversationId, query) : Promise.resolve(false),
    setQuery: (query) => { if (conversationId) store.setQuery(conversationId, query); },
  };
}
