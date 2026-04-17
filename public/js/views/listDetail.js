import { api } from '../api.js';

export async function renderListDetail(container, listId) {
  container.innerHTML = '<p style="text-align:center;padding:40px;font-weight:700;color:#999">Loading...</p>';

  let data;
  try {
    data = await api.getList(listId);
  } catch {
    container.innerHTML = '<p>List not found.</p>';
    return;
  }

  container.innerHTML = '';

  // Back link
  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = '#/';
  back.textContent = '\u2190 All lists';
  container.appendChild(back);

  // Header
  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `
    <div>
      <h1 class="editable" id="list-name">${esc(data.name)}</h1>
      ${data.description ? `<p class="meta editable" id="list-desc" style="font-size:15px;font-weight:600;color:var(--text-secondary);margin-top:4px">${esc(data.description)}</p>` : '<p class="meta editable" id="list-desc" style="font-size:15px;font-weight:600;color:#bbb;font-style:italic;margin-top:4px">Add description...</p>'}
    </div>
    <div class="toolbar">
      <button class="btn-blue" id="study-btn">Study</button>
      <button class="btn-secondary btn-sm" id="reset-progress-btn">Reset progress</button>
      <button class="btn-danger btn-sm" id="delete-list-btn">Delete</button>
    </div>
  `;
  container.appendChild(header);

  header.querySelector('#list-name').onclick = () => editField(container, listId, data, 'name');
  header.querySelector('#list-desc').onclick = () => editField(container, listId, data, 'description');

  header.querySelector('#study-btn').onclick = () => {
    if (data.words.length === 0) return alert('Add some words first!');
    location.hash = `#/study?lists=${listId}`;
  };

  header.querySelector('#reset-progress-btn').onclick = async () => {
    if (confirm(`Reset all progress for "${data.name}"? Confidence and study history will be cleared.`)) {
      await api.resetProgress(listId);
      renderListDetail(container, listId);
    }
  };

  header.querySelector('#delete-list-btn').onclick = async () => {
    if (confirm(`Delete "${data.name}" and all its words?`)) {
      await api.deleteList(listId);
      location.hash = '#/';
    }
  };

  // Add word form
  const addForm = document.createElement('div');
  addForm.className = 'add-word-form';
  addForm.innerHTML = `
    <div class="form-row">
      <input type="text" id="add-word" placeholder="Word">
      <input type="text" id="add-translation" placeholder="Translation">
      <input type="text" id="add-description" placeholder="Description (optional)">
      <button class="btn-primary" id="add-word-btn">Add</button>
    </div>
    <button class="btn-ghost btn-sm" id="toggle-bulk">+ Bulk add</button>
  `;
  container.appendChild(addForm);

  const addWordBtn = addForm.querySelector('#add-word-btn');
  const wordInput = addForm.querySelector('#add-word');
  const transInput = addForm.querySelector('#add-translation');
  const descInput = addForm.querySelector('#add-description');

  addWordBtn.onclick = async () => {
    const word = wordInput.value.trim();
    const translation = transInput.value.trim();
    if (!word || !translation) return wordInput.focus();
    await api.addWord(listId, word, translation, descInput.value.trim());
    wordInput.value = '';
    transInput.value = '';
    descInput.value = '';
    wordInput.focus();
    renderListDetail(container, listId);
  };

  wordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') transInput.focus();
  });
  transInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') descInput.focus();
  });
  descInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addWordBtn.click();
  });

  addForm.querySelector('#toggle-bulk').onclick = () => showBulkAdd(container, listId);

  // Word table
  if (data.words.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <span class="empty-icon">&#128221;</span>
      <h3>No words yet</h3>
      <p>Add words using the form above, or use bulk add to paste many at once.</p>
    `;
    container.appendChild(empty);
  } else {
    const countLabel = document.createElement('div');
    countLabel.className = 'section-title';
    countLabel.textContent = `${data.words.length} word${data.words.length !== 1 ? 's' : ''}`;
    container.appendChild(countLabel);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'card';
    tableWrap.style.padding = '0';
    tableWrap.style.overflow = 'auto';

    let tableHTML = `
      <table class="word-table">
        <thead><tr><th>Word</th><th>Translation</th><th>Description</th><th></th></tr></thead>
        <tbody>
    `;
    for (const w of data.words) {
      tableHTML += `
        <tr data-id="${w.id}">
          <td class="word-cell">${esc(w.word)}</td>
          <td class="translation-cell">${esc(w.translation)}</td>
          <td>${esc(w.description) || '<span style="color:#ccc">\u2014</span>'}</td>
          <td class="actions">
            <button class="edit-btn">Edit</button>
            <button class="delete-btn">Delete</button>
          </td>
        </tr>
      `;
    }
    tableHTML += '</tbody></table>';
    tableWrap.innerHTML = tableHTML;
    container.appendChild(tableWrap);

    tableWrap.querySelectorAll('.edit-btn').forEach(btn => {
      btn.onclick = () => {
        const tr = btn.closest('tr');
        const wordId = Number(tr.dataset.id);
        const word = data.words.find(w => w.id === wordId);
        editWord(container, listId, word);
      };
    });
    tableWrap.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = async () => {
        const tr = btn.closest('tr');
        const wordId = Number(tr.dataset.id);
        await api.deleteWord(wordId);
        renderListDetail(container, listId);
      };
    });
  }
}

function editField(container, listId, data, field) {
  const el = container.querySelector(field === 'name' ? '#list-name' : '#list-desc');
  const current = field === 'name' ? data.name : (data.description || '');
  const input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  input.style.fontSize = field === 'name' ? '28px' : '15px';
  input.style.fontWeight = field === 'name' ? '800' : '600';
  el.replaceWith(input);
  input.focus();
  input.select();

  const save = async () => {
    const val = input.value.trim();
    const name = field === 'name' ? (val || data.name) : data.name;
    const desc = field === 'description' ? val : data.description;
    await api.updateList(listId, name, desc);
    renderListDetail(container, listId);
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') renderListDetail(container, listId);
  });
}

function editWord(container, listId, word) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>Edit Word</h3>
      <div class="form-group">
        <label>Word</label>
        <input type="text" id="edit-word" value="${esc(word.word)}">
      </div>
      <div class="form-group">
        <label>Translation</label>
        <input type="text" id="edit-translation" value="${esc(word.translation)}">
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" id="edit-description" value="${esc(word.description)}">
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" id="edit-cancel">Cancel</button>
        <button class="btn-primary" id="edit-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#edit-cancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#edit-save').onclick = async () => {
    const w = overlay.querySelector('#edit-word').value.trim();
    const t = overlay.querySelector('#edit-translation').value.trim();
    const d = overlay.querySelector('#edit-description').value.trim();
    if (!w || !t) return;
    await api.updateWord(word.id, w, t, d);
    overlay.remove();
    renderListDetail(container, listId);
  };
}

function showBulkAdd(container, listId) {
  const existing = container.querySelector('.bulk-form');
  if (existing) { existing.remove(); return; }

  const form = document.createElement('div');
  form.className = 'card bulk-form';
  form.style.marginBottom = '20px';
  form.style.borderColor = 'var(--blue)';
  form.style.borderBottomWidth = '4px';
  form.style.borderBottomColor = 'var(--blue-dark)';
  form.innerHTML = `
    <div class="form-group">
      <label>Paste from a table or type manually</label>
      <textarea class="bulk-textarea" placeholder="word&#9;translation&#9;description&#10;word&#9;translation&#9;description"></textarea>
      <p style="font-size:13px;color:var(--text-secondary);font-weight:600;margin-top:8px">
        Paste a table from Pages/Excel/Google Sheets, or type one word per line with Tab between columns.
      </p>
    </div>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <div style="flex:1;height:1px;background:var(--border)"></div>
      <span style="font-size:13px;font-weight:800;color:var(--text-secondary)">OR</span>
      <div style="flex:1;height:1px;background:var(--border)"></div>
    </div>
    <div class="form-group">
      <label>Upload CSV file</label>
      <input type="file" id="csv-upload" accept=".csv,.tsv,.txt" style="font-weight:400">
    </div>
    <div id="bulk-preview" style="display:none;margin-bottom:16px">
      <label style="display:block;font-size:13px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">
        Preview (<span id="preview-count">0</span> words)
      </label>
      <div id="preview-table" style="max-height:200px;overflow-y:auto;border:2px solid var(--border);border-radius:12px;background:var(--surface)"></div>
    </div>
    <div class="toolbar">
      <button class="btn-blue" id="bulk-add-btn">Add All</button>
      <button class="btn-secondary" id="bulk-cancel-btn">Cancel</button>
    </div>
  `;

  const addForm = container.querySelector('.add-word-form');
  addForm.after(form);

  const textarea = form.querySelector('textarea');
  const previewDiv = form.querySelector('#bulk-preview');
  const previewTable = form.querySelector('#preview-table');
  const previewCount = form.querySelector('#preview-count');
  let parsedWords = [];

  // Tab key inserts tab character
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value = ta.value.substring(0, start) + '\t' + ta.value.substring(end);
      ta.selectionStart = ta.selectionEnd = start + 1;
    }
  });

  // Live preview on paste or input
  textarea.addEventListener('input', () => {
    parsedWords = parseText(textarea.value);
    showPreview(parsedWords, previewDiv, previewTable, previewCount);
  });

  // CSV file upload
  form.querySelector('#csv-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      textarea.value = ev.target.result;
      parsedWords = parseText(textarea.value);
      showPreview(parsedWords, previewDiv, previewTable, previewCount);
    };
    reader.readAsText(file);
  });

  form.querySelector('#bulk-cancel-btn').onclick = () => form.remove();
  form.querySelector('#bulk-add-btn').onclick = async () => {
    if (parsedWords.length === 0) {
      parsedWords = parseText(textarea.value);
    }
    if (parsedWords.length === 0) return alert('No valid words found. Make sure each row has at least a word and translation.');
    await api.bulkAddWords(listId, parsedWords);
    renderListDetail(container, listId);
  };
}

function parseText(text) {
  text = text.trim();
  if (!text) return [];

  // Detect separator: tab, comma (CSV), or pipe
  const firstLine = text.split('\n')[0];
  let sep = '\t';
  if (!firstLine.includes('\t')) {
    if (firstLine.includes('|')) sep = '|';
    else if (firstLine.includes(',')) sep = ',';
    else if (firstLine.includes(';')) sep = ';';
  }

  let rows;
  if (sep === ',') {
    rows = parseCSV(text);
  } else {
    rows = text.split('\n').map(line => line.split(sep));
  }

  return rows
    .map(parts => {
      if (parts.length < 2) return null;
      const word = (parts[0] || '').trim();
      const translation = (parts[1] || '').trim();
      const description = (parts[2] || '').trim();
      if (!word || !translation) return null;
      return { word, translation, description };
    })
    .filter(Boolean);
}

// Simple CSV parser that handles quoted fields with commas/newlines
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        row.push(field);
        field = '';
        if (row.some(f => f.trim())) rows.push(row);
        row = [];
        if (ch === '\r') i++;
      } else {
        field += ch;
      }
    }
  }
  row.push(field);
  if (row.some(f => f.trim())) rows.push(row);
  return rows;
}

function showPreview(words, previewDiv, previewTable, previewCount) {
  if (words.length === 0) {
    previewDiv.style.display = 'none';
    return;
  }
  previewDiv.style.display = 'block';
  previewCount.textContent = words.length;

  let html = '<table class="word-table" style="font-size:13px"><thead><tr><th>Word</th><th>Translation</th><th>Description</th></tr></thead><tbody>';
  for (const w of words.slice(0, 50)) {
    html += `<tr><td class="word-cell">${esc(w.word)}</td><td class="translation-cell">${esc(w.translation)}</td><td>${esc(w.description) || '\u2014'}</td></tr>`;
  }
  if (words.length > 50) {
    html += `<tr><td colspan="3" style="text-align:center;color:var(--text-secondary)">... and ${words.length - 50} more</td></tr>`;
  }
  html += '</tbody></table>';
  previewTable.innerHTML = html;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
