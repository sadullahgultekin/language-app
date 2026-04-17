const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Lists
  getLists: () => request('/lists'),
  getList: (id) => request(`/lists/${id}`),
  createList: (name, description = '') =>
    request('/lists', { method: 'POST', body: JSON.stringify({ name, description }) }),
  updateList: (id, name, description = '') =>
    request(`/lists/${id}`, { method: 'PUT', body: JSON.stringify({ name, description }) }),
  deleteList: (id) =>
    request(`/lists/${id}`, { method: 'DELETE' }),
  resetProgress: (id) =>
    request(`/lists/${id}/reset-progress`, { method: 'POST' }),

  // Words
  addWord: (listId, word, translation, description = '') =>
    request(`/lists/${listId}/words`, { method: 'POST', body: JSON.stringify({ word, translation, description }) }),
  bulkAddWords: (listId, words) =>
    request(`/lists/${listId}/words/bulk`, { method: 'POST', body: JSON.stringify({ words }) }),
  updateWord: (id, word, translation, description = '') =>
    request(`/words/${id}`, { method: 'PUT', body: JSON.stringify({ word, translation, description }) }),
  deleteWord: (id) =>
    request(`/words/${id}`, { method: 'DELETE' }),

  // Study
  getStudyDeck: (listIds) =>
    request(`/study?lists=${listIds.join(',')}`),
  recordResult: (wordId, correct) =>
    request('/study/result', { method: 'POST', body: JSON.stringify({ word_id: wordId, correct }) }),
};
