import { api } from '../api.js';

const CARD_COLORS = ['green', 'blue', 'amber', 'purple'];

async function setupPushNotifications(container) {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission === 'denied') return;
  if (Notification.permission === 'granted') {
    await subscribeToPush();
    return;
  }

  // Show a prompt banner if permission not yet asked
  const banner = document.createElement('div');
  banner.className = 'notif-banner';
  banner.innerHTML = `
    <span>Get daily reminders when words are due for review</span>
    <button class="btn-primary btn-sm" id="notif-allow">Enable notifications</button>
    <button class="btn-secondary btn-sm" id="notif-dismiss">Not now</button>
  `;
  container.insertBefore(banner, container.firstChild);

  banner.querySelector('#notif-allow').onclick = async () => {
    banner.remove();
    const permission = await Notification.requestPermission();
    if (permission === 'granted') await subscribeToPush();
  };
  banner.querySelector('#notif-dismiss').onclick = () => banner.remove();
}

async function subscribeToPush() {
  try {
    const sw = await navigator.serviceWorker.ready;
    let sub = await sw.pushManager.getSubscription();
    if (sub) {
      // Re-register existing subscription so server always has it
      await api.subscribePush(sub.toJSON());
      return;
    }
    const { key } = await api.getVapidPublicKey();
    const keyBytes = urlB64ToUint8Array(key);
    sub = await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes });
    await api.subscribePush(sub.toJSON());
  } catch (e) {
    console.warn('Push subscription failed:', e);
  }
}

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function renderHome(container) {
  container.innerHTML = '<p style="text-align:center;padding:40px;font-weight:700;color:#999">Loading...</p>';

  const lists = await api.getLists();
  const selectedIds = new Set();

  container.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `<h1>My Word Lists</h1>`;
  if (lists.length > 0) {
    const studyAllBtn = document.createElement('button');
    studyAllBtn.className = 'btn-secondary';
    studyAllBtn.textContent = 'Study All';
    studyAllBtn.onclick = () => { location.hash = '#/study?lists=all'; };
    header.appendChild(studyAllBtn);
  }

  const newBtn = document.createElement('button');
  newBtn.className = 'btn-primary';
  newBtn.textContent = '+ New List';
  newBtn.onclick = () => showCreateForm(container);
  header.appendChild(newBtn);
  container.appendChild(header);

  if (lists.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <span class="empty-icon">&#128218;</span>
      <h3>No word lists yet</h3>
      <p>Create your first list to start building your vocabulary!</p>
    `;
    container.appendChild(empty);
    return;
  }

  // Grid
  const grid = document.createElement('div');
  grid.className = 'list-grid';

  lists.forEach((list, i) => {
    const card = document.createElement('div');
    card.className = 'card list-card';
    const color = CARD_COLORS[i % CARD_COLORS.length];
    const initial = list.name.charAt(0).toUpperCase();
    const dueBadge = list.due_count > 0 ? `<span class="badge badge-due">${list.due_count} due</span>` : '';
    const newBadge = list.new_count > 0 ? `<span class="badge badge-new">${list.new_count} new</span>` : '';
    const nothingBadge = (!list.due_count && !list.new_count && list.word_count > 0) ? `<span class="badge badge-done">&#10003; caught up</span>` : '';

    card.innerHTML = `
      <div class="card-icon ${color}">${initial}</div>
      <div class="card-content">
        <h3>${esc(list.name)}</h3>
        <p class="meta">${list.word_count} word${list.word_count !== 1 ? 's' : ''}${list.description ? ' &middot; ' + esc(list.description) : ''}</p>
        <div class="badge-row">${dueBadge}${newBadge}${nothingBadge}</div>
      </div>
      <div class="card-right">
        <div class="checkbox-area">
          <input type="checkbox" data-id="${list.id}" title="Select for study">
        </div>
      </div>
    `;

    const checkbox = card.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      if (checkbox.checked) selectedIds.add(list.id);
      else selectedIds.delete(list.id);
      updateStudyBar();
    });

    card.addEventListener('click', (e) => {
      if (e.target.type === 'checkbox') return;
      location.hash = `#/lists/${list.id}`;
    });

    grid.appendChild(card);
  });
  container.appendChild(grid);

  // Study bar
  const studyBar = document.createElement('div');
  studyBar.className = 'study-bar hidden';
  studyBar.innerHTML = `
    <span class="study-bar-text"></span>
    <button class="btn-primary">Start Studying</button>
  `;
  studyBar.querySelector('button').onclick = () => {
    const ids = [...selectedIds];
    if (ids.length > 0) {
      location.hash = `#/study?lists=${ids.join(',')}`;
    }
  };
  document.body.appendChild(studyBar);

  function updateStudyBar() {
    if (selectedIds.size > 0) {
      studyBar.classList.remove('hidden');
      studyBar.querySelector('.study-bar-text').textContent = `${selectedIds.size} list${selectedIds.size > 1 ? 's' : ''} selected`;
    } else {
      studyBar.classList.add('hidden');
    }
  }

  // Cleanup study bar on navigation
  const cleanup = () => {
    studyBar.remove();
    window.removeEventListener('hashchange', cleanup);
  };
  window.addEventListener('hashchange', cleanup);

  setupPushNotifications(container);
}

function showCreateForm(container) {
  if (container.querySelector('.create-form')) return;

  const form = document.createElement('div');
  form.className = 'card create-form';
  form.style.marginBottom = '24px';
  form.innerHTML = `
    <div class="form-group">
      <label>List name</label>
      <input type="text" id="new-list-name" placeholder="e.g. Turkish basics" autofocus>
    </div>
    <div class="form-group">
      <label>Description (optional)</label>
      <input type="text" id="new-list-desc" placeholder="e.g. Common words for daily conversation">
    </div>
    <div class="toolbar">
      <button class="btn-primary" id="create-list-btn">Create</button>
      <button class="btn-secondary" id="cancel-create-btn">Cancel</button>
    </div>
  `;

  const header = container.querySelector('.page-header');
  header.after(form);

  const nameInput = form.querySelector('#new-list-name');
  nameInput.focus();

  form.querySelector('#cancel-create-btn').onclick = () => form.remove();
  form.querySelector('#create-list-btn').onclick = async () => {
    const name = nameInput.value.trim();
    if (!name) return nameInput.focus();
    await api.createList(name, form.querySelector('#new-list-desc').value.trim());
    renderHome(container);
  };
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') form.querySelector('#create-list-btn').click();
    if (e.key === 'Escape') form.remove();
  });
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
