import { api } from '../api.js';

export async function renderStudy(container, listIds) {
  container.innerHTML = '<p style="text-align:center;padding:40px;font-weight:700;color:#999">Loading study deck...</p>';

  const deck = await api.getStudyDeck(listIds);

  if (deck.length === 0) {
    container.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <span class="empty-icon">&#128566;</span>
      <h3>No words to study</h3>
      <p>The selected lists have no words yet.</p>
      <br>
      <a href="#/" class="btn-primary" style="text-decoration:none;padding:14px 28px;display:inline-block">Back to lists</a>
    `;
    container.appendChild(empty);
    return;
  }

  let current = 0;
  let flipped = false;
  let animating = false;
  const results = [];

  // Review mode: browsing answered cards
  let reviewing = false;
  let reviewIndex = 0;

  container.innerHTML = '';

  const studyContainer = document.createElement('div');
  studyContainer.className = 'study-container';

  // Progress
  const progress = document.createElement('div');
  progress.className = 'study-progress';
  studyContainer.appendChild(progress);

  // Back/Forward nav
  const nav = document.createElement('div');
  nav.className = 'study-nav';
  nav.innerHTML = `
    <button id="nav-back">&#8592; Back</button>
    <span class="nav-label" id="nav-label"></span>
    <button id="nav-fwd">Forward &#8594;</button>
  `;
  studyContainer.appendChild(nav);

  // Flashcard
  const wrapper = document.createElement('div');
  wrapper.className = 'flashcard-wrapper';
  wrapper.innerHTML = `
    <div class="flashcard">
      <div class="flashcard-face flashcard-front">
        <div class="word"></div>
        <div class="hint">Tap or press Space to flip</div>
      </div>
      <div class="flashcard-face flashcard-back">
        <div class="translation"></div>
        <div class="description"></div>
        <div class="swipe-overlay swipe-correct"></div>
        <div class="swipe-overlay swipe-wrong"></div>
      </div>
    </div>
  `;
  studyContainer.appendChild(wrapper);

  // Actions (hidden until flipped, hidden in review mode)
  const actions = document.createElement('div');
  actions.className = 'study-actions';
  actions.innerHTML = `
    <button class="btn-danger" id="missed-btn">Missed it</button>
    <button class="btn-primary" id="got-btn">Got it!</button>
  `;
  studyContainer.appendChild(actions);

  // Keyboard hint
  const hint = document.createElement('div');
  hint.className = 'study-hint';
  hint.innerHTML = 'Space: flip &middot; &rarr; / Enter: got it &middot; &larr;: missed it / back';
  studyContainer.appendChild(hint);

  // Swipe hint (only shown on touch)
  const swipeHint = document.createElement('div');
  swipeHint.className = 'study-hint swipe-hint';
  swipeHint.innerHTML = 'Swipe right: got it &middot; Swipe left: missed it';
  studyContainer.appendChild(swipeHint);

  container.appendChild(studyContainer);

  const flashcard = wrapper.querySelector('.flashcard');
  const correctOverlay = wrapper.querySelector('.swipe-correct');
  const wrongOverlay = wrapper.querySelector('.swipe-wrong');
  const navBack = nav.querySelector('#nav-back');
  const navFwd = nav.querySelector('#nav-fwd');
  const navLabel = nav.querySelector('#nav-label');

  function updateNav() {
    if (reviewing) {
      navBack.classList.toggle('hidden', reviewIndex <= 0);
      navFwd.classList.remove('hidden');
      navLabel.textContent = `${reviewIndex + 1} / ${current + 1}`;
    } else {
      // On the live card: back is available if there are answered cards
      navBack.classList.toggle('hidden', results.length === 0);
      navFwd.classList.add('hidden');
      navLabel.textContent = '';
    }
  }

  function populateCard(word) {
    wrapper.querySelector('.word').textContent = word.word;
    wrapper.querySelector('.translation').textContent = word.translation;
    wrapper.querySelector('.description').textContent = word.description || '';
  }

  function showCard(enterWithZoom) {
    reviewing = false;
    const word = deck[current];
    flipped = false;
    animating = false;
    actions.classList.remove('visible');
    flashcard.classList.remove('result-correct', 'result-wrong');

    wrapper.querySelector('.word').textContent = word.word;
    wrapper.querySelector('.translation').textContent = '';
    wrapper.querySelector('.description').textContent = '';

    // Reset swipe state
    correctOverlay.style.opacity = '0';
    wrongOverlay.style.opacity = '0';
    flashcard.classList.remove('flipped');
    flashcard.style.opacity = '1';

    if (enterWithZoom) {
      flashcard.style.transition = 'none';
      flashcard.style.transform = 'scale(0.8)';
      flashcard.style.opacity = '0';

      void flashcard.offsetWidth;

      flashcard.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease';
      flashcard.style.transform = 'scale(1)';
      flashcard.style.opacity = '1';

      setTimeout(() => {
        wrapper.querySelector('.translation').textContent = word.translation;
        wrapper.querySelector('.description').textContent = word.description || '';
        flashcard.style.transition = '';
        flashcard.style.transform = '';
      }, 320);
    } else {
      flashcard.style.transform = '';
      flashcard.style.transition = '';

      const onDone = () => {
        wrapper.querySelector('.translation').textContent = word.translation;
        wrapper.querySelector('.description').textContent = word.description || '';
        flashcard.removeEventListener('transitionend', onDone);
      };
      flashcard.addEventListener('transitionend', onDone);
    }

    updateProgress();
    updateNav();
  }

  function showReviewCard(index) {
    reviewing = true;
    reviewIndex = index;
    const result = results[index];
    flipped = false;
    animating = false;

    actions.classList.remove('visible');
    flashcard.classList.remove('flipped', 'result-correct', 'result-wrong');
    flashcard.style.transition = '';
    flashcard.style.transform = '';
    flashcard.style.opacity = '1';
    correctOverlay.style.opacity = '0';
    wrongOverlay.style.opacity = '0';

    populateCard(result);

    flashcard.classList.add(result.correct ? 'result-correct' : 'result-wrong');

    updateProgress();
    updateNav();
  }

  function flip() {
    if (animating) return;
    flipped = !flipped;
    flashcard.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    flashcard.style.transform = '';
    if (flipped) {
      flashcard.classList.add('flipped');
      if (!reviewing) actions.classList.add('visible');
    } else {
      flashcard.classList.remove('flipped');
      actions.classList.remove('visible');
    }
  }

  function updateProgress() {
    const total = deck.length;
    const shown = reviewing ? reviewIndex + 1 : current + 1;
    const pct = Math.round((current / total) * 100);
    progress.innerHTML = `
      <div class="study-progress-header">
        <span class="study-progress-label">${shown} / ${total}</span>
        <span class="study-progress-label">${pct}%</span>
      </div>
      <div class="study-progress-bar">
        <div class="fill" style="width: ${pct}%"></div>
      </div>
    `;
  }

  function advance(viaSwipe) {
    current++;
    if (current >= deck.length) {
      finishStudy(container, listIds, results);
    } else {
      showCard(viaSwipe);
    }
  }

  function answer(correct, viaSwipe) {
    if (!flipped || animating || reviewing) return;
    animating = true;

    const word = deck[current];
    results.push({ ...word, correct });
    api.recordResult(word.id, correct);

    if (viaSwipe) {
      setTimeout(() => advance(true), 280);
    } else {
      advance(false);
    }
  }

  navBack.onclick = () => {
    if (reviewing) {
      if (reviewIndex > 0) showReviewCard(reviewIndex - 1);
    } else {
      if (results.length > 0) showReviewCard(results.length - 1);
    }
  };

  navFwd.onclick = () => {
    if (!reviewing) return;
    if (reviewIndex < results.length - 1) {
      showReviewCard(reviewIndex + 1);
    } else {
      showCard(false);
    }
  };

  // Tap to flip
  wrapper.addEventListener('click', (e) => {
    if (e.target.classList.contains('swipe-indicator')) return;
    flip();
  });

  actions.querySelector('#got-btn').onclick = () => answer(true, false);
  actions.querySelector('#missed-btn').onclick = () => answer(false, false);

  // Keyboard
  function onKey(e) {
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      flip();
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      if (reviewing) {
        navFwd.onclick();
      } else {
        answer(true, false);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (reviewing) {
        navBack.onclick();
      } else {
        // If not flipped, go back to review; if flipped, record as missed
        if (!flipped) {
          navBack.onclick();
        } else {
          answer(false, false);
        }
      }
    }
  }
  document.addEventListener('keydown', onKey);

  // --- Swipe gesture ---
  let touchStartX = 0;
  let touchStartY = 0;
  let touchCurrentX = 0;
  let isSwiping = false;
  const SWIPE_THRESHOLD = 80;

  wrapper.addEventListener('touchstart', (e) => {
    if (!flipped || animating || reviewing) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchCurrentX = touchStartX;
    isSwiping = false;
    flashcard.style.transition = 'none';
  }, { passive: true });

  wrapper.addEventListener('touchmove', (e) => {
    if (!flipped || animating || reviewing) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;

    if (!isSwiping && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      isSwiping = true;
    }

    if (!isSwiping) return;
    e.preventDefault();

    touchCurrentX = touch.clientX;
    const offset = touchCurrentX - touchStartX;
    const rotate = offset * 0.08;
    const swipeProgress = Math.min(Math.abs(offset) / SWIPE_THRESHOLD, 1);

    flashcard.style.transform = `rotateY(180deg) translateX(${-offset}px) rotate(${-rotate}deg)`;

    if (offset > 0) {
      correctOverlay.style.opacity = swipeProgress;
      wrongOverlay.style.opacity = '0';
    } else {
      wrongOverlay.style.opacity = swipeProgress;
      correctOverlay.style.opacity = '0';
    }
  }, { passive: false });

  wrapper.addEventListener('touchend', () => {
    if (!flipped || animating || !isSwiping || reviewing) return;

    const dx = touchCurrentX - touchStartX;
    flashcard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      const direction = dx > 0 ? 1 : -1;
      const flyX = direction * window.innerWidth;
      flashcard.style.transform = `rotateY(180deg) translateX(${-flyX}px) rotate(${-direction * 20}deg)`;
      flashcard.style.opacity = '0';
      answer(direction > 0, true);
    } else {
      flashcard.style.transform = 'rotateY(180deg)';
      correctOverlay.style.opacity = '0';
      wrongOverlay.style.opacity = '0';
    }

    isSwiping = false;
  }, { passive: true });

  // Cleanup
  const cleanup = () => {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', cleanup);
  };
  window.addEventListener('hashchange', cleanup);

  showCard(false);
}

function finishStudy(container, listIds, results) {
  window.__studySummary = { listIds, results };
  location.hash = '#/summary';
}
