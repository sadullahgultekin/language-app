import { renderHome } from './views/home.js';
import { renderListDetail } from './views/listDetail.js';
import { renderStudy } from './views/study.js';
import { renderSummary } from './views/summary.js';

const appEl = document.getElementById('app');

function parseHash() {
  const hash = location.hash.slice(1) || '/';
  const [path, query] = hash.split('?');
  const params = new URLSearchParams(query || '');
  return { path, params };
}

function route() {
  const { path, params } = parseHash();
  appEl.innerHTML = '';

  if (path === '/' || path === '') {
    renderHome(appEl);
  } else if (path.match(/^\/lists\/(\d+)$/)) {
    const id = Number(path.match(/^\/lists\/(\d+)$/)[1]);
    renderListDetail(appEl, id);
  } else if (path === '/study') {
    const lists = params.get('lists');
    if (lists) {
      renderStudy(appEl, lists.split(',').map(Number));
    } else {
      location.hash = '#/';
    }
  } else if (path === '/summary') {
    const data = window.__studySummary;
    if (data) {
      renderSummary(appEl, data);
    } else {
      location.hash = '#/';
    }
  } else {
    location.hash = '#/';
  }
}

window.addEventListener('hashchange', route);
route();
