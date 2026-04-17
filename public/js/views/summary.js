export function renderSummary(container, { listIds, results }) {
  const correct = results.filter(r => r.correct).length;
  const incorrect = results.length - correct;
  const missed = results.filter(r => !r.correct);
  const pct = Math.round((correct / results.length) * 100);

  container.innerHTML = '';

  const summary = document.createElement('div');
  summary.className = 'summary';

  let emoji = '&#127881;';
  let message = 'Great session!';
  if (pct === 100) { emoji = '&#129395;'; message = 'Perfect score!'; }
  else if (pct >= 80) { emoji = '&#128170;'; message = 'Well done!'; }
  else if (pct >= 50) { emoji = '&#128170;'; message = 'Keep practicing!'; }
  else { emoji = '&#128554;'; message = 'You\'ll get there!'; }

  summary.innerHTML = `
    <div style="font-size:64px;margin-bottom:12px">${emoji}</div>
    <h2>${message}</h2>
    <p class="subtitle">${pct}% correct</p>
    <div class="summary-stats">
      <div class="summary-stat">
        <div class="number">${results.length}</div>
        <div class="label">Total</div>
      </div>
      <div class="summary-stat correct">
        <div class="number">${correct}</div>
        <div class="label">Correct</div>
      </div>
      <div class="summary-stat incorrect">
        <div class="number">${incorrect}</div>
        <div class="label">Missed</div>
      </div>
    </div>
  `;

  if (missed.length > 0) {
    const reviewCard = document.createElement('div');
    reviewCard.className = 'card';
    reviewCard.style.textAlign = 'left';
    reviewCard.style.marginBottom = '28px';
    reviewCard.style.padding = '0';

    let tableHTML = '<table class="word-table"><thead><tr><th>Word</th><th>Translation</th></tr></thead><tbody>';
    for (const w of missed) {
      tableHTML += `<tr><td class="word-cell">${esc(w.word)}</td><td class="translation-cell">${esc(w.translation)}</td></tr>`;
    }
    tableHTML += '</tbody></table>';
    reviewCard.innerHTML = tableHTML;
    summary.appendChild(reviewCard);
  }

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'summary-actions';
  actionsDiv.innerHTML = `
    <a href="#/study?lists=${listIds ? listIds.join(',') : 'all'}" class="btn-primary" style="text-decoration:none;padding:14px 28px">Study Again</a>
    <a href="#/" class="btn-secondary" style="text-decoration:none;padding:14px 28px">Back to Lists</a>
  `;
  summary.appendChild(actionsDiv);

  container.appendChild(summary);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
