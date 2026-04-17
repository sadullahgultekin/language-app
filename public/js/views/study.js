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

  container.innerHTML = '';

  const studyContainer = document.createElement('div');
  studyContainer.className = 'study-container';

  // Progress
  const progress = document.createElement('div');
  progress.className = 'study-progress';
  studyContainer.appendChild(progress);

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

  // Actions (hidden until flipped)
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
  hint.innerHTML = 'Space: flip &middot; &rarr; / Enter: got it &middot; &larr;: missed it';
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

  function showCard(enterWithZoom) {
    const word = deck[current];
    flipped = false;
    animating = false;
    actions.classList.remove('visible');

    wrapper.querySelector('.word').textContent = word.word;
    wrapper.querySelector('.translation').textContent = '';
    wrapper.querySelector('.description').textContent = '';

    // Reset swipe state
    correctOverlay.style.opacity = '0';
    wrongOverlay.style.opacity = '0';
    flashcard.classList.remove('flipped');
    flashcard.style.opacity = '1';

    if (enterWithZoom) {
      // Zoom-in entrance: start small, scale up
      flashcard.style.transition = 'none';
      flashcard.style.transform = 'scale(0.8)';
      flashcard.style.opacity = '0';

      // Force reflow so the initial state applies before transition
      void flashcard.offsetWidth;

      flashcard.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease';
      flashcard.style.transform = 'scale(1)';
      flashcard.style.opacity = '1';

      // Populate back side after zoom-in finishes
      setTimeout(() => {
        wrapper.querySelector('.translation').textContent = word.translation;
        wrapper.querySelector('.description').textContent = word.description || '';
        // Reset transition to default flip transition
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
  }

  function flip() {
    if (flipped || animating) return;
    flipped = true;
    flashcard.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    flashcard.style.transform = '';
    flashcard.classList.add('flipped');
    actions.classList.add('visible');
  }

  function updateProgress() {
    const pct = Math.round((current / deck.length) * 100);
    progress.innerHTML = `
      <div class="study-progress-header">
        <span class="study-progress-label">${current + 1} / ${deck.length}</span>
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
    if (!flipped || animating) return;
    animating = true;

    const word = deck[current];
    results.push({ ...word, correct });
    api.recordResult(word.id, correct);

    if (viaSwipe) {
      // Card is already flying off, wait for it then show next with zoom
      setTimeout(() => advance(true), 280);
    } else {
      advance(false);
    }
  }

  // Tap to flip
  wrapper.addEventListener('click', (e) => {
    if (e.target.classList.contains('swipe-indicator')) return;
    flip();
  });

  actions.querySelector('#got-btn').onclick = () => answer(true, false);
  actions.querySelector('#missed-btn').onclick = () => answer(false, false);

  // Keyboard
  function onKey(e) {
    if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); flip(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); answer(true, false); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); answer(false, false); }
  }
  document.addEventListener('keydown', onKey);

  // --- Swipe gesture ---
  let touchStartX = 0;
  let touchStartY = 0;
  let touchCurrentX = 0;
  let isSwiping = false;
  const SWIPE_THRESHOLD = 80;

  wrapper.addEventListener('touchstart', (e) => {
    if (!flipped || animating) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchCurrentX = touchStartX;
    isSwiping = false;
    flashcard.style.transition = 'none';
  }, { passive: true });

  wrapper.addEventListener('touchmove', (e) => {
    if (!flipped || animating) return;
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

    // rotateY(180deg) mirrors the X axis, so negate translateX to match finger direction
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
    if (!flipped || animating || !isSwiping) return;

    const dx = touchCurrentX - touchStartX;
    flashcard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      // Swipe confirmed — fly off in the direction of the swipe
      const direction = dx > 0 ? 1 : -1;
      const flyX = direction * window.innerWidth;
      // Negate because rotateY(180deg) mirrors X
      flashcard.style.transform = `rotateY(180deg) translateX(${-flyX}px) rotate(${-direction * 20}deg)`;
      flashcard.style.opacity = '0';
      answer(direction > 0, true);
    } else {
      // Snap back
      flashcard.style.transform = 'rotateY(180deg)';
      leftIndicator.style.opacity = '0';
      rightIndicator.style.opacity = '0';
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
