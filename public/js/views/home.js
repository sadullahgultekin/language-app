import { api } from '../api.js';

const CARD_COLORS = ['green', 'blue', 'amber', 'purple'];

export async function renderHome(container) {
  container.innerHTML = '<p style="text-align:center;padding:40px;font-weight:700;color:#999">Loading...</p>';

  const lists = await api.getLists();
  const selectedIds = new Set();

  container.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `<h1>My Word Lists</h1>`;
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
    const confidencePct = list.word_count > 0 ? Math.round((list.avg_confidence / 5) * 100) : 0;

    card.innerHTML = `
      <div class="card-icon ${color}">${initial}</div>
      <div class="card-content">
        <h3>${esc(list.name)}</h3>
        <p class="meta">${list.word_count} word${list.word_count !== 1 ? 's' : ''}${list.description ? ' &middot; ' + esc(list.description) : ''}</p>
      </div>
      <div class="card-right">
        <div class="progress-bar"><div class="fill" style="width: ${confidencePct}%"></div></div>
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
