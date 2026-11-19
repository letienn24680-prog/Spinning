(function () {
  'use strict';

  const STORAGE_KEY = 'vq1_data_v1';
  const GIFT_COUNT = 5;
  const MAX_PEOPLE = 50;
  const SPIN_DURATION_MS = 7200;
  const DEFAULT_PEOPLE = Array.from({ length: 46 }, (_, i) => String(i + 1));
  const DEFAULT_GIFTS = [
    'Vòng tay',
    'Kẹo',
    '3 cái kẹp',
    '2 cái kẹp',
    '2 cái kẹp'
  ];
  const LEGACY_DEFAULT_PEOPLE = ['Bạn 1', 'Bạn 2', 'Bạn 3', 'Bạn 4', 'Bạn 5'];
  const LEGACY_DEFAULT_GIFTS = [
    'Quà Đặc Biệt',
    'Quà Hạng Nhất',
    'Quà May Mắn',
    'Quà Bất Ngờ',
    'Quà Khích Lệ'
  ];
  const GIFT_COLORS = [
    '#E63946',
    '#F4A261',
    '#2A9D8F',
    '#457B9D',
    '#9B5DE5'
  ];
  const PEOPLE_COLORS = [
    '#E63946',
    '#F4A261',
    '#2A9D8F',
    '#457B9D',
    '#9B5DE5',
    '#E76F51',
    '#00B4D8',
    '#6A994E'
  ];

  const state = {
    gifts: [...DEFAULT_GIFTS],
    history: [],
    locks: [true, false, false, false, false],
    soundEnabled: true,
    savedPeople: [...DEFAULT_PEOPLE],
    remainingPeople: [...DEFAULT_PEOPLE],
    removePicked: true,
    selectedPerson: ''
  };

  let currentStage = 'people'; // 'people' | 'gifts'
  let currentAngle = 0;
  let isSpinning = false;
  let audioCtx = null;
  let hubClickTimes = [];
  let giftFeedbackTimer = null;
  let peopleFeedbackTimer = null;
  let pointerTickTimer = null;
  let confettiAnimId = null;
  let confettiParticles = [];
  let activeSecretOverlay = null;
  let activeSecretStyle = null;

  // DOM references
  const wheelCanvas = document.getElementById('wheel-canvas');
  const wheelFrame = document.querySelector('.wheel-frame');
  const wheelPointer = document.querySelector('.wheel-pointer');
  const wheelHub = document.getElementById('wheel-hub');
  const stageBadge = document.getElementById('stage-badge');
  const stagePlayerInfo = document.getElementById('stage-player-info');
  const stagePlayerName = document.getElementById('stage-player-name');
  const backToPeopleBtn = document.getElementById('back-to-people-btn');
  const spinBtn = document.getElementById('spin-btn');
  const wheelStatusMsg = document.getElementById('wheel-status-msg');
  const soundToggleBtn = document.getElementById('sound-toggle');
  const soundLabel = document.getElementById('sound-label');
  const peopleForm = document.getElementById('people-form');
  const peopleInput = document.getElementById('people-input');
  const peopleCountBadge = document.getElementById('people-count');
  const removePickedToggle = document.getElementById('remove-picked-toggle');
  const savePeopleBtn = document.getElementById('save-people-btn');
  const resetPeopleBtn = document.getElementById('reset-people-btn');
  const peopleFeedback = document.getElementById('people-feedback');
  const giftsForm = document.getElementById('gifts-form');
  const giftInputs = Array.from(document.querySelectorAll('.gift-input'));
  const saveGiftsBtn = document.getElementById('save-gifts-btn');
  const giftsFeedback = document.getElementById('gifts-feedback');
  const historyList = document.getElementById('history-list');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const pickedModal = document.getElementById('picked-modal');
  const pickedNameEl = document.getElementById('picked-name');
  const proceedGiftBtn = document.getElementById('proceed-gift-btn');
  const cancelPickedBtn = document.getElementById('cancel-picked-btn');
  const winModal = document.getElementById('win-modal');
  const winPlayer = document.getElementById('win-player');
  const winPrize = document.getElementById('win-prize');
  const closeWinModalBtn = document.getElementById('close-win-modal');
  const confettiCanvas = document.getElementById('confetti-canvas');

  function normalizeLocks(rawLocks) {
    const locks = Array.from({ length: GIFT_COUNT }, (_, i) =>
      Boolean(Array.isArray(rawLocks) ? rawLocks[i] : false)
    );
    if (locks.every(Boolean)) {
      locks[0] = false;
    }
    return locks;
  }

  function cleanPeopleArray(rawList) {
    if (!Array.isArray(rawList)) return [];
    return rawList
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, MAX_PEOPLE);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;

      if (Array.isArray(parsed.gifts)) {
        state.gifts = Array.from({ length: GIFT_COUNT }, (_, i) => {
          const val = typeof parsed.gifts[i] === 'string' ? parsed.gifts[i].trim() : '';
          return val || DEFAULT_GIFTS[i];
        });
      }

      if (Array.isArray(parsed.history)) {
        state.history = parsed.history
          .filter((item) => item && typeof item === 'object')
          .slice(0, 100)
          .map((item) => ({
            player: typeof item.player === 'string' && item.player.trim() ? item.player.trim() : 'Khách',
            prize: typeof item.prize === 'string' && item.prize.trim() ? item.prize.trim() : DEFAULT_GIFTS[0],
            time: typeof item.time === 'string' ? item.time : ''
          }));
      }

      state.locks = normalizeLocks(parsed.locks);

      if (typeof parsed.soundEnabled === 'boolean') {
        state.soundEnabled = parsed.soundEnabled;
      }

      // Migrate older vq1_data_v1 safely when people fields are absent
      if (Array.isArray(parsed.savedPeople)) {
        const cleanedSaved = cleanPeopleArray(parsed.savedPeople);
        state.savedPeople = cleanedSaved.length > 0 ? cleanedSaved : [...DEFAULT_PEOPLE];
      } else {
        state.savedPeople = [...DEFAULT_PEOPLE];
      }

      if (Array.isArray(parsed.remainingPeople)) {
        state.remainingPeople = cleanPeopleArray(parsed.remainingPeople);
      } else {
        state.remainingPeople = [...state.savedPeople];
      }

      if (typeof parsed.removePicked === 'boolean') {
        state.removePicked = parsed.removePicked;
      } else {
        state.removePicked = true;
      }

      if (parsed.defaultVersion !== 3) {
        if (parsed.defaultVersion !== 2) {
          const isLegacyGifts =
            state.gifts.length === LEGACY_DEFAULT_GIFTS.length &&
            state.gifts.every((g, i) => g === LEGACY_DEFAULT_GIFTS[i]);
          if (isLegacyGifts) {
            state.gifts = [...DEFAULT_GIFTS];
          }

          const isLegacyPeople =
            state.savedPeople.length === LEGACY_DEFAULT_PEOPLE.length &&
            state.savedPeople.every((p, i) => p === LEGACY_DEFAULT_PEOPLE[i]);
          if (isLegacyPeople) {
            state.savedPeople = [...DEFAULT_PEOPLE];
            state.remainingPeople = [...DEFAULT_PEOPLE];
          }
        }

        if (state.locks.every((locked) => !locked)) {
          state.locks[0] = true;
        }
      }
    } catch (_) {
      // Ignore storage errors (e.g. disabled localStorage)
    }
  }

  function saveState() {
    state.locks = normalizeLocks(state.locks);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          defaultVersion: 3,
          gifts: state.gifts,
          history: state.history,
          locks: state.locks,
          soundEnabled: state.soundEnabled,
          savedPeople: state.savedPeople,
          remainingPeople: state.remainingPeople,
          removePicked: state.removePicked
        })
      );
    } catch (_) {
      // Ignore storage errors
    }
  }

  // Audio synthesis (Web Audio API)
  function ensureAudioContext() {
    if (!state.soundEnabled) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtx) {
      audioCtx = new AudioCtx();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playTick(isSlowMo) {
    if (!state.soundEnabled) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const startFreq = isSlowMo ? 660 : 880;
      const endFreq = isSlowMo ? 240 : 320;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.032);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch (_) {
      // Ignore audio errors
    }
  }

  function playWinFanfare() {
    if (!state.soundEnabled) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const start = now + idx * 0.1;
        const duration = idx === notes.length - 1 ? 0.55 : 0.22;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.02);
      });
    } catch (_) {
      // Ignore audio errors
    }
  }

  function updateSoundUI() {
    if (!soundToggleBtn || !soundLabel) return;
    soundToggleBtn.setAttribute('aria-pressed', String(state.soundEnabled));
    soundToggleBtn.classList.toggle('is-muted', !state.soundEnabled);
    soundLabel.textContent = state.soundEnabled ? 'Âm thanh: Bật' : 'Âm thanh: Tắt';
  }

  // Wheel drawing & math
  function getSliceColors(count, palette) {
    if (count <= 0) return [];
    if (count === 1) return [palette[0]];

    const colors = Array.from({ length: count }, (_, i) => palette[i % palette.length]);
    if (colors[count - 1] === colors[0]) {
      const alt = palette.find((c) => c !== colors[0] && c !== colors[count - 2]);
      if (alt) {
        colors[count - 1] = alt;
      }
    }
    return colors;
  }

  function getActiveItems() {
    return currentStage === 'gifts' ? state.gifts : state.remainingPeople;
  }

  function truncateText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    const ellipsis = '...';
    if (ctx.measureText(ellipsis).width >= maxWidth) return ellipsis;
    let end = text.length - 1;
    while (end > 0) {
      const candidate = text.slice(0, end).trimEnd() + ellipsis;
      if (ctx.measureText(candidate).width <= maxWidth) {
        return candidate;
      }
      end--;
    }
    return ellipsis;
  }

  function wrapSliceLabel(ctx, text, maxWidth) {
    const words = text.trim().split(/\s+/);
    if (words.length <= 1) return [truncateText(ctx, text, maxWidth)];

    const lines = [];
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = current + ' ' + words[i];
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);

    if (lines.length > 2) {
      return [
        truncateText(ctx, lines[0], maxWidth),
        truncateText(ctx, lines.slice(1).join(' '), maxWidth)
      ];
    }
    return lines.map((line) => truncateText(ctx, line, maxWidth));
  }

  function drawWheel(rotationDeg) {
    if (!wheelCanvas || !wheelCanvas.getContext) return;
    const ctx = wheelCanvas.getContext('2d');
    if (!ctx) return;

    const logicalSize = 460;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetPx = logicalSize * dpr;
    if (wheelCanvas.width !== targetPx || wheelCanvas.height !== targetPx) {
      wheelCanvas.width = targetPx;
      wheelCanvas.height = targetPx;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, logicalSize, logicalSize);

    const cx = logicalSize / 2;
    const cy = logicalSize / 2;
    const outerRadius = 222;
    const rimWidth = 18;
    const wheelRadius = outerRadius - rimWidth;
    const rotRad = (rotationDeg * Math.PI) / 180;

    // Outer celebratory rim
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotRad);

    const rimGrad = ctx.createRadialGradient(0, 0, wheelRadius, 0, 0, outerRadius);
    rimGrad.addColorStop(0, '#b91c1c');
    rimGrad.addColorStop(0.65, '#dc2626');
    rimGrad.addColorStop(1, '#7f1d1d');

    ctx.beginPath();
    ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
    ctx.fillStyle = rimGrad;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fde68a';
    ctx.stroke();

    // Rim dots
    const dotCount = 20;
    const dotRadiusRing = outerRadius - rimWidth / 2;
    for (let i = 0; i < dotCount; i++) {
      const a = (i * Math.PI * 2) / dotCount;
      const dx = Math.cos(a) * dotRadiusRing;
      const dy = Math.sin(a) * dotRadiusRing;
      ctx.beginPath();
      ctx.arc(dx, dy, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? '#fef08a' : '#ffffff';
      ctx.fill();
    }

    const items = getActiveItems();
    const count = items.length;
    const palette = currentStage === 'gifts' ? GIFT_COLORS : PEOPLE_COLORS;
    const colors = getSliceColors(count, palette);

    if (count === 0) {
      ctx.beginPath();
      ctx.arc(0, 0, wheelRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#f3e8dd';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#fff7e0';
      ctx.stroke();

      ctx.rotate(-rotRad);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 16px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#765341';
      ctx.fillText('Hết người tham gia', 0, -wheelRadius * 0.45);
    } else if (count === 1) {
      // Full 360-degree single slice without seam line
      ctx.beginPath();
      ctx.arc(0, 0, wheelRadius, 0, Math.PI * 2);
      ctx.fillStyle = colors[0];
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#fff7e0';
      ctx.stroke();

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      const lines = wrapSliceLabel(ctx, items[0], 220);
      const lineHeight = 22;
      const baseY = -wheelRadius * 0.54 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, idx) => {
        const y = baseY + idx * lineHeight;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(38, 14, 6, 0.36)';
        ctx.strokeText(line, 0, y, 240);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(line, 0, y, 240);
      });
      ctx.restore();
    } else {
      const sliceDeg = 360 / count;
      const dividerWidth = count > 36 ? 1 : count > 20 ? 1.5 : 2.5;

      for (let i = 0; i < count; i++) {
        const startDeg = i * sliceDeg;
        const endDeg = (i + 1) * sliceDeg;
        const startRad = ((startDeg - 90) * Math.PI) / 180;
        const endRad = ((endDeg - 90) * Math.PI) / 180;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, wheelRadius, startRad, endRad);
        ctx.closePath();
        ctx.fillStyle = colors[i];
        ctx.fill();

        ctx.lineWidth = dividerWidth;
        ctx.strokeStyle = '#fff7e0';
        ctx.stroke();

        const midRad = (((startDeg + endDeg) / 2 - 90) * Math.PI) / 180;
        ctx.save();
        ctx.rotate(midRad);
        ctx.textBaseline = 'middle';

        const label = items[i];
        if (count <= 8) {
          const fontSize = count <= 5 ? 15 : 14;
          ctx.textAlign = 'center';
          ctx.font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
          const lines = wrapSliceLabel(ctx, label, 118);
          const textRadius = wheelRadius * 0.62;
          const lineHeight = 19;
          const startY = -((lines.length - 1) * lineHeight) / 2;

          lines.forEach((line, lineIdx) => {
            const y = startY + lineIdx * lineHeight;
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = 'rgba(38, 14, 6, 0.36)';
            ctx.strokeText(line, textRadius, y, 128);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(line, textRadius, y, 128);
          });
        } else {
          const fontSize =
            count <= 12 ? 13 : count <= 20 ? 11.5 : count <= 32 ? 10 : 8.5;
          ctx.textAlign = 'right';
          ctx.font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
          const outerTextX = wheelRadius - 12;
          const maxTextWidth = wheelRadius - 62;
          const fitted = truncateText(ctx, label, maxTextWidth);

          ctx.lineWidth = count > 28 ? 2.2 : 3;
          ctx.strokeStyle = 'rgba(38, 14, 6, 0.4)';
          ctx.strokeText(fitted, outerTextX, 0, maxTextWidth);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(fitted, outerTextX, 0, maxTextWidth);
        }

        ctx.restore();
      }
    }

    // Subtle inner ring around hub
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 248, 224, 0.28)';
    ctx.fill();

    ctx.restore();
    ctx.restore();
  }

  function getSliceIndexAtAngle(rotationDeg, sliceCount) {
    if (!sliceCount || sliceCount <= 1) return 0;
    const sliceDeg = 360 / sliceCount;
    const normalized = ((rotationDeg % 360) + 360) % 360;
    const pointerLocal = (360 - normalized) % 360;
    return Math.floor(pointerLocal / sliceDeg) % sliceCount;
  }

  function getUnlockedIndices() {
    const indices = [];
    for (let i = 0; i < GIFT_COUNT; i++) {
      if (!state.locks[i]) indices.push(i);
    }
    return indices.length > 0 ? indices : [0];
  }

  function computeTargetSpin(chosenIndex, startAngle, sliceCount) {
    const count = Math.max(1, sliceCount);
    const sliceDeg = 360 / count;
    const borderMargin = Math.min(12, sliceDeg * 0.22);
    const safeSpan = sliceDeg - borderMargin * 2;
    const localTargetDeg = chosenIndex * sliceDeg + borderMargin + Math.random() * safeSpan;
    const desiredFinalMod = (360 - (localTargetDeg % 360) + 360) % 360;
    const currentMod = ((startAngle % 360) + 360) % 360;
    const deltaMod = (desiredFinalMod - currentMod + 360) % 360;
    const fullRotations =
      deltaMod === 0
        ? 6 + Math.floor(Math.random() * 3) // 6, 7, or 8 full turns
        : 6 + Math.floor(Math.random() * 2); // 6 or 7 full turns + deltaMod => (6, 8) turns
    return startAngle + fullRotations * 360 + deltaMod;
  }

  function easeSlowMo(t) {
    return 0.5 * (1 - Math.pow(1 - t, 2.5)) + 0.5 * (1 - Math.pow(1 - t, 5.5));
  }

  function triggerPointerTick() {
    if (!wheelPointer) return;
    wheelPointer.classList.add('is-ticking');
    clearTimeout(pointerTickTimer);
    pointerTickTimer = setTimeout(() => {
      if (wheelPointer) {
        wheelPointer.classList.remove('is-ticking');
      }
      pointerTickTimer = null;
    }, 85);
  }

  function resetSpinEffects() {
    clearTimeout(pointerTickTimer);
    pointerTickTimer = null;
    if (wheelPointer) {
      wheelPointer.classList.remove('is-ticking');
    }
    if (wheelFrame) {
      wheelFrame.classList.remove('is-slowmo');
    }
  }

  function formatSpinTime(date) {
    return date.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function renderPeopleUI() {
    if (peopleInput) {
      peopleInput.value = state.savedPeople.join('\n');
    }
    if (removePickedToggle) {
      removePickedToggle.checked = state.removePicked;
    }
    updatePeopleCountBadge();
  }

  function updatePeopleCountBadge() {
    if (!peopleCountBadge) return;
    const remaining = state.remainingPeople.length;
    const total = state.savedPeople.length;
    if (remaining === total) {
      peopleCountBadge.textContent = `${remaining} / ${MAX_PEOPLE} người`;
    } else {
      peopleCountBadge.textContent = `${remaining} / ${MAX_PEOPLE} người (còn ${remaining}/${total})`;
    }
  }

  function renderGiftsInputs() {
    giftInputs.forEach((input, idx) => {
      input.value = state.gifts[idx] || DEFAULT_GIFTS[idx];
    });
  }

  function renderHistory() {
    if (!historyList) return;
    historyList.innerHTML = '';

    if (state.history.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'Chưa có lượt quay nào.';
      historyList.appendChild(empty);
      return;
    }

    state.history.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'history-item';

      const main = document.createElement('div');
      main.className = 'history-item-main';

      const playerEl = document.createElement('span');
      playerEl.className = 'history-player';
      playerEl.textContent = entry.player;

      const prizeEl = document.createElement('span');
      prizeEl.className = 'history-prize';
      prizeEl.textContent = entry.prize;

      main.appendChild(playerEl);
      main.appendChild(prizeEl);

      const timeEl = document.createElement('span');
      timeEl.className = 'history-time';
      timeEl.textContent = entry.time;

      item.appendChild(main);
      item.appendChild(timeEl);
      historyList.appendChild(item);
    });
  }

  function updateStageUI() {
    const isPeopleStage = currentStage === 'people';

    if (stageBadge) {
      stageBadge.textContent = isPeopleStage
        ? 'Bước 1/2: Quay Chọn Người'
        : 'Bước 2/2: Quay Nhận Quà';
      stageBadge.classList.toggle('is-people', isPeopleStage);
      stageBadge.classList.toggle('is-gifts', !isPeopleStage);
    }

    if (stagePlayerInfo && stagePlayerName) {
      if (isPeopleStage) {
        stagePlayerInfo.hidden = true;
        stagePlayerName.textContent = '';
      } else {
        const displayName = state.selectedPerson || 'Khách';
        stagePlayerName.textContent = displayName;
        stagePlayerInfo.hidden = false;
      }
    }

    if (backToPeopleBtn) {
      backToPeopleBtn.hidden = isPeopleStage;
    }

    if (spinBtn) {
      spinBtn.textContent = isPeopleStage ? 'QUAY CHỌN NGƯỜI!' : 'QUAY NHẬN QUÀ!';
      if (!isSpinning) {
        spinBtn.disabled = isPeopleStage && state.remainingPeople.length === 0;
      }
    }

    if (wheelStatusMsg) {
      if (isPeopleStage && state.remainingPeople.length === 0) {
        wheelStatusMsg.textContent =
          'Đã quay hết danh sách! Vui lòng bấm "Đặt lại vòng người" để tiếp tục.';
        wheelStatusMsg.hidden = false;
      } else {
        wheelStatusMsg.textContent = '';
        wheelStatusMsg.hidden = true;
      }
    }

    drawWheel(currentAngle);
  }

  function setControlsDisabled(disabled) {
    if (spinBtn) {
      spinBtn.disabled =
        disabled || (currentStage === 'people' && state.remainingPeople.length === 0);
    }
    if (saveGiftsBtn) saveGiftsBtn.disabled = disabled;
    if (savePeopleBtn) savePeopleBtn.disabled = disabled;
    if (resetPeopleBtn) resetPeopleBtn.disabled = disabled;
    if (peopleInput) peopleInput.disabled = disabled;
    if (removePickedToggle) removePickedToggle.disabled = disabled;
    if (backToPeopleBtn) backToPeopleBtn.disabled = disabled;
    giftInputs.forEach((input) => {
      input.disabled = disabled;
    });
  }

  // Confetti animation
  function stopConfetti() {
    if (confettiAnimId !== null) {
      cancelAnimationFrame(confettiAnimId);
      confettiAnimId = null;
    }
    confettiParticles = [];
    if (confettiCanvas && confettiCanvas.getContext) {
      const ctx = confettiCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      }
    }
  }

  function startConfetti() {
    if (!confettiCanvas || !confettiCanvas.getContext) return;
    stopConfetti();

    const width = window.innerWidth || 1024;
    const height = window.innerHeight || 768;
    confettiCanvas.width = width;
    confettiCanvas.height = height;

    const palette = ['#E63946', '#F4A261', '#2A9D8F', '#457B9D', '#9B5DE5', '#FDE047'];
    confettiParticles = Array.from({ length: 110 }, () => ({
      x: Math.random() * width,
      y: -20 - Math.random() * height * 0.4,
      w: 7 + Math.random() * 6,
      h: 5 + Math.random() * 7,
      vx: (Math.random() - 0.5) * 4,
      vy: 2.8 + Math.random() * 4.2,
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.22,
      color: palette[Math.floor(Math.random() * palette.length)]
    }));

    const ctx = confettiCanvas.getContext('2d');
    if (!ctx) return;

    function tick() {
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      let active = 0;

      confettiParticles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.04;
        p.rot += p.vRot;

        if (p.y < confettiCanvas.height + 30) {
          active++;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
      });

      if (active > 0) {
        confettiAnimId = requestAnimationFrame(tick);
      } else {
        stopConfetti();
      }
    }

    confettiAnimId = requestAnimationFrame(tick);
  }

  function showPickedModal(person) {
    if (!pickedModal || !pickedNameEl) return;
    pickedNameEl.textContent = person;
    pickedModal.hidden = false;
    playWinFanfare();
    if (proceedGiftBtn) {
      proceedGiftBtn.focus();
    }
  }

  function hidePickedModal() {
    if (!pickedModal) return;
    pickedModal.hidden = true;
  }

  function proceedToGiftsStage() {
    hidePickedModal();
    currentStage = 'gifts';
    updateStageUI();
  }

  function returnToPeopleStage() {
    if (isSpinning) return;
    hidePickedModal();
    currentStage = 'people';
    state.selectedPerson = '';
    updateStageUI();
  }

  function showWinModal(player, prize) {
    if (!winModal || !winPlayer || !winPrize) return;
    winPlayer.textContent = 'Người chơi: ' + player;
    winPrize.textContent = prize;
    winModal.hidden = false;
    startConfetti();
    playWinFanfare();
    if (closeWinModalBtn) {
      closeWinModalBtn.focus();
    }
  }

  function hideWinModal() {
    if (!winModal) return;
    winModal.hidden = true;
    stopConfetti();
    if (currentStage === 'gifts') {
      returnToPeopleStage();
    }
  }

  function handleSpin() {
    if (isSpinning) return;

    const isPeopleStage = currentStage === 'people';
    if (isPeopleStage && state.remainingPeople.length === 0) {
      updateStageUI();
      return;
    }

    ensureAudioContext();
    isSpinning = true;
    setControlsDisabled(true);

    const sliceCount = isPeopleStage ? state.remainingPeople.length : GIFT_COUNT;
    let chosenIndex = 0;

    if (isPeopleStage) {
      chosenIndex = Math.floor(Math.random() * sliceCount);
    } else {
      const unlocked = getUnlockedIndices();
      chosenIndex = unlocked[Math.floor(Math.random() * unlocked.length)];
    }

    const startAngle = currentAngle;
    const targetAngle = computeTargetSpin(chosenIndex, startAngle, sliceCount);
    const totalDelta = targetAngle - startAngle;
    const duration = SPIN_DURATION_MS;
    const startTime = performance.now();
    const sliceDeg = 360 / sliceCount;
    const tickIntervalDeg = sliceCount <= 5 ? sliceDeg / 2 : sliceDeg;
    let lastTickStep = Math.floor(startAngle / tickIntervalDeg);

    resetSpinEffects();

    function frame(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeSlowMo(t);
      const isSlowMo = t >= 0.52 && t < 1;
      currentAngle = startAngle + totalDelta * eased;

      if (wheelFrame) {
        wheelFrame.classList.toggle('is-slowmo', isSlowMo);
      }

      const tickStep = Math.floor(currentAngle / tickIntervalDeg);
      if (tickStep > lastTickStep) {
        lastTickStep = tickStep;
        playTick(isSlowMo);
        if (t < 1) {
          triggerPointerTick();
        }
      }

      drawWheel(currentAngle);

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        currentAngle = targetAngle;
        resetSpinEffects();
        drawWheel(currentAngle);

        const actualIndex = getSliceIndexAtAngle(currentAngle, sliceCount);

        if (isPeopleStage) {
          const picked = state.remainingPeople[actualIndex] || state.remainingPeople[0];
          state.selectedPerson = picked;
          isSpinning = false;
          setControlsDisabled(false);
          showPickedModal(picked);
        } else {
          const prize = state.gifts[actualIndex] || DEFAULT_GIFTS[actualIndex];
          const player = state.selectedPerson || 'Khách';

          state.history.unshift({
            player,
            prize,
            time: formatSpinTime(new Date())
          });
          if (state.history.length > 100) {
            state.history.length = 100;
          }

          if (state.removePicked && state.selectedPerson) {
            const removeIdx = state.remainingPeople.indexOf(state.selectedPerson);
            if (removeIdx !== -1) {
              state.remainingPeople.splice(removeIdx, 1);
            }
          }

          saveState();
          renderHistory();
          updatePeopleCountBadge();

          isSpinning = false;
          setControlsDisabled(false);
          showWinModal(player, prize);
        }
      }
    }

    requestAnimationFrame(frame);
  }

  function showPeopleFeedback(message, isError) {
    if (!peopleFeedback) return;
    peopleFeedback.textContent = message;
    peopleFeedback.classList.toggle('is-error', Boolean(isError));
    clearTimeout(peopleFeedbackTimer);
    peopleFeedbackTimer = setTimeout(() => {
      peopleFeedback.textContent = '';
      peopleFeedback.classList.remove('is-error');
    }, 3200);
  }

  function handleSavePeople(e) {
    if (e) e.preventDefault();
    if (isSpinning || !peopleInput) return;

    const lines = peopleInput.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      showPeopleFeedback('Vui lòng nhập ít nhất 1 người tham gia.', true);
      return;
    }

    if (lines.length > MAX_PEOPLE) {
      showPeopleFeedback(
        `Tối đa ${MAX_PEOPLE} người tham gia (hiện có ${lines.length} người).`,
        true
      );
      return;
    }

    state.savedPeople = [...lines];
    state.remainingPeople = [...lines];
    peopleInput.value = lines.join('\n');

    saveState();
    updatePeopleCountBadge();
    updateStageUI();
    showPeopleFeedback(`Đã lưu danh sách ${lines.length} người!`, false);
  }

  function handleResetPeople() {
    if (isSpinning) return;
    state.remainingPeople = [...state.savedPeople];
    saveState();
    updatePeopleCountBadge();
    updateStageUI();
    showPeopleFeedback(
      `Đã đặt lại vòng người (${state.remainingPeople.length} người)!`,
      false
    );
  }

  function handleSaveGifts(e) {
    if (e) e.preventDefault();
    if (isSpinning) return;

    giftInputs.forEach((input, idx) => {
      const trimmed = input.value.trim();
      const val = trimmed || DEFAULT_GIFTS[idx];
      state.gifts[idx] = val;
      input.value = val;
    });

    saveState();
    if (currentStage === 'gifts') {
      drawWheel(currentAngle);
    }

    if (giftsFeedback) {
      giftsFeedback.textContent = 'Đã lưu danh sách phần quà!';
      clearTimeout(giftFeedbackTimer);
      giftFeedbackTimer = setTimeout(() => {
        giftsFeedback.textContent = '';
      }, 2500);
    }
  }

  // Secret control panel (dynamically created on demand, removed on close)
  function closeSecretModal() {
    if (activeSecretOverlay && activeSecretOverlay.parentNode) {
      activeSecretOverlay.parentNode.removeChild(activeSecretOverlay);
    }
    if (activeSecretStyle && activeSecretStyle.parentNode) {
      activeSecretStyle.parentNode.removeChild(activeSecretStyle);
    }
    activeSecretOverlay = null;
    activeSecretStyle = null;
  }

  function openSecretModal() {
    if (activeSecretOverlay) {
      closeSecretModal();
      return;
    }

    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .vq-cfg-overlay {
        position: fixed;
        inset: 0;
        z-index: 200;
        background: rgba(15, 23, 42, 0.62);
        backdrop-filter: blur(4px);
        display: grid;
        place-items: center;
        padding: 18px;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      .vq-cfg-panel {
        width: 100%;
        max-width: 440px;
        background: #ffffff;
        color: #1e293b;
        border-radius: 18px;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35);
        padding: 22px;
      }
      .vq-cfg-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .vq-cfg-title {
        margin: 0;
        font-size: 1.08rem;
        font-weight: 700;
      }
      .vq-cfg-close {
        border: 1px solid #cbd5e1;
        background: #f8fafc;
        color: #334155;
        border-radius: 8px;
        padding: 5px 11px;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
      }
      .vq-cfg-desc {
        margin: 0 0 14px;
        font-size: 0.86rem;
        color: #64748b;
      }
      .vq-cfg-list {
        display: flex;
        flex-direction: column;
        gap: 9px;
      }
      .vq-cfg-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
      }
      .vq-cfg-info {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .vq-cfg-dot {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .vq-cfg-name {
        font-size: 0.92rem;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .vq-cfg-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.86rem;
        font-weight: 600;
        cursor: pointer;
        user-select: none;
        padding: 5px 10px;
        border-radius: 8px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        flex-shrink: 0;
      }
      .vq-cfg-toggle.is-locked {
        background: #fee2e2;
        border-color: #f87171;
        color: #991b1b;
      }
      .vq-cfg-warn {
        margin: 12px 0 0;
        min-height: 1.2em;
        font-size: 0.84rem;
        font-weight: 600;
        color: #b91c1c;
      }
    `;

    const overlay = document.createElement('div');
    overlay.className = 'vq-cfg-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const panel = document.createElement('div');
    panel.className = 'vq-cfg-panel';

    const head = document.createElement('div');
    head.className = 'vq-cfg-head';

    const title = document.createElement('h3');
    title.className = 'vq-cfg-title';
    title.textContent = 'Cấu hình phần quà';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'vq-cfg-close';
    closeBtn.textContent = 'Đóng';
    closeBtn.addEventListener('click', closeSecretModal);

    head.appendChild(title);
    head.appendChild(closeBtn);

    const desc = document.createElement('p');
    desc.className = 'vq-cfg-desc';
    desc.textContent = 'Chọn "Khóa" để loại trừ phần quà khỏi kết quả quay (giữ lại ít nhất 1 phần quà).';

    const list = document.createElement('div');
    list.className = 'vq-cfg-list';

    const warn = document.createElement('p');
    warn.className = 'vq-cfg-warn';

    function renderSecretRows() {
      list.innerHTML = '';
      state.gifts.forEach((gift, idx) => {
        const row = document.createElement('div');
        row.className = 'vq-cfg-row';

        const info = document.createElement('div');
        info.className = 'vq-cfg-info';

        const dot = document.createElement('span');
        dot.className = 'vq-cfg-dot';
        dot.style.backgroundColor = GIFT_COLORS[idx % GIFT_COLORS.length];

        const name = document.createElement('span');
        name.className = 'vq-cfg-name';
        name.textContent = gift;

        info.appendChild(dot);
        info.appendChild(name);

        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'vq-cfg-toggle' + (state.locks[idx] ? ' is-locked' : '');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = state.locks[idx];
        checkbox.setAttribute('data-lock-index', String(idx));

        const text = document.createElement('span');
        text.textContent = 'Khóa';

        checkbox.addEventListener('change', () => {
          const wantLock = checkbox.checked;
          if (wantLock) {
            const lockedCount = state.locks.filter(Boolean).length;
            if (lockedCount >= GIFT_COUNT - 1) {
              checkbox.checked = false;
              warn.textContent = 'Không thể khóa tất cả 5 phần quà (phải giữ ít nhất 1 phần quà).';
              return;
            }
          }
          warn.textContent = '';
          state.locks[idx] = wantLock;
          saveState();
          renderSecretRows();
        });

        toggleLabel.appendChild(checkbox);
        toggleLabel.appendChild(text);

        row.appendChild(info);
        row.appendChild(toggleLabel);
        list.appendChild(row);
      });
    }

    renderSecretRows();

    panel.appendChild(head);
    panel.appendChild(desc);
    panel.appendChild(list);
    panel.appendChild(warn);
    overlay.appendChild(panel);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSecretModal();
    });

    document.head.appendChild(styleEl);
    document.body.appendChild(overlay);
    activeSecretStyle = styleEl;
    activeSecretOverlay = overlay;
  }

  function bindEvents() {
    if (spinBtn) {
      spinBtn.addEventListener('click', handleSpin);
    }

    if (backToPeopleBtn) {
      backToPeopleBtn.addEventListener('click', returnToPeopleStage);
    }

    if (soundToggleBtn) {
      soundToggleBtn.addEventListener('click', () => {
        state.soundEnabled = !state.soundEnabled;
        saveState();
        updateSoundUI();
        if (state.soundEnabled) {
          ensureAudioContext();
          playTick();
        }
      });
    }

    if (peopleForm) {
      peopleForm.addEventListener('submit', handleSavePeople);
    }

    if (resetPeopleBtn) {
      resetPeopleBtn.addEventListener('click', handleResetPeople);
    }

    if (removePickedToggle) {
      removePickedToggle.addEventListener('change', () => {
        state.removePicked = Boolean(removePickedToggle.checked);
        saveState();
      });
    }

    if (giftsForm) {
      giftsForm.addEventListener('submit', handleSaveGifts);
    }

    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', () => {
        state.history = [];
        saveState();
        renderHistory();
      });
    }

    if (proceedGiftBtn) {
      proceedGiftBtn.addEventListener('click', proceedToGiftsStage);
    }

    if (cancelPickedBtn) {
      cancelPickedBtn.addEventListener('click', () => {
        hidePickedModal();
        state.selectedPerson = '';
      });
    }

    if (pickedModal) {
      pickedModal.addEventListener('click', (e) => {
        if (e.target === pickedModal) {
          hidePickedModal();
          state.selectedPerson = '';
        }
      });
    }

    if (closeWinModalBtn) {
      closeWinModalBtn.addEventListener('click', hideWinModal);
    }

    if (winModal) {
      winModal.addEventListener('click', (e) => {
        if (e.target === winModal) hideWinModal();
      });
    }

    if (wheelHub) {
      wheelHub.addEventListener('click', () => {
        const now = Date.now();
        hubClickTimes.push(now);
        hubClickTimes = hubClickTimes.filter((ts) => now - ts <= 2500);
        if (hubClickTimes.length >= 5) {
          hubClickTimes = [];
          openSecretModal();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'K' || e.key === 'k' || e.code === 'KeyK')) {
        e.preventDefault();
        openSecretModal();
        return;
      }
      if (e.key === 'Escape') {
        if (activeSecretOverlay) {
          closeSecretModal();
        } else if (winModal && !winModal.hidden) {
          hideWinModal();
        } else if (pickedModal && !pickedModal.hidden) {
          hidePickedModal();
          state.selectedPerson = '';
        }
      }
    });

    window.addEventListener('resize', () => {
      drawWheel(currentAngle);
    });
  }

  function init() {
    loadState();
    renderPeopleUI();
    renderGiftsInputs();
    renderHistory();
    updateSoundUI();
    updateStageUI();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
