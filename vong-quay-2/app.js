(function (global) {
  "use strict";

  var STORAGE_KEY = "vq2_data_v1";
  var SLICE_COUNT = 5;
  var GIFT_SLICE_COUNT = 5;
  var SLICE_ANGLE = (Math.PI * 2) / GIFT_SLICE_COUNT;
  var MIN_PEOPLE = 1;
  var MAX_PEOPLE = 50;
  var POINTER_ANGLE = -Math.PI / 2;
  var DEFAULT_PEOPLE = Array.from({ length: 46 }, function (_, i) {
    return String(i + 1);
  });
  var DEFAULT_GIFTS = [
    "Vòng tay",
    "Kẹo",
    "3 cái kẹp",
    "2 cái kẹp",
    "2 cái kẹp"
  ];
  var LEGACY_DEFAULT_PEOPLE = ["Bạn 1", "Bạn 2", "Bạn 3", "Bạn 4", "Bạn 5"];
  var LEGACY_DEFAULT_GIFTS = [
    "Quà Đặc Biệt",
    "Quà Hạng Nhất",
    "Quà May Mắn",
    "Quà Bất Ngờ",
    "Quà Khích Lệ"
  ];
  var SLICE_COLORS = [
    "#E63946",
    "#F4A261",
    "#2A9D8F",
    "#457B9D",
    "#9B5DE5"
  ];
  var HUB_CLICK_WINDOW_MS = 2500;
  var HUB_CLICK_TARGET = 5;
  var SPIN_DURATION_MS = 7200;

  function easeSlowMo(t) {
    var clamped = Math.max(0, Math.min(1, Number(t) || 0));
    return 0.5 * (1 - Math.pow(1 - clamped, 2.5)) + 0.5 * (1 - Math.pow(1 - clamped, 5.5));
  }

  function normalizeAngle(angle) {
    var twoPi = Math.PI * 2;
    var mod = angle % twoPi;
    return mod < 0 ? mod + twoPi : mod;
  }

  function normalizeExactName(name) {
    return String(name || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function normalizeVietnameseName(name) {
    return String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function getSliceAtRotation(rotationRad, sliceCount) {
    var count = typeof sliceCount === "number" && sliceCount >= 1
      ? Math.floor(sliceCount)
      : GIFT_SLICE_COUNT;
    if (count <= 1) return 0;
    var sliceAngle = (Math.PI * 2) / count;
    var rel = normalizeAngle(POINTER_ANGLE - rotationRad);
    var idx = Math.floor(rel / sliceAngle);
    if (idx < 0) return 0;
    if (idx >= count) return count - 1;
    return idx;
  }

  function computeTargetRotation(currentRotation, targetIndex, sliceCountOrRng, maybeRng) {
    var count = GIFT_SLICE_COUNT;
    var rand = typeof maybeRng === "function" ? maybeRng : Math.random;
    if (typeof sliceCountOrRng === "function") {
      rand = sliceCountOrRng;
    } else if (typeof sliceCountOrRng === "number" && sliceCountOrRng >= 1) {
      count = Math.floor(sliceCountOrRng);
    }

    var safeIndex = Math.max(0, Math.min(count - 1, Math.floor(targetIndex)));
    var sliceAngle = (Math.PI * 2) / count;
    var margin = sliceAngle * 0.16;
    var offsetInSlice = margin + rand() * (sliceAngle - margin * 2);
    var desiredMod = normalizeAngle(POINTER_ANGLE - (safeIndex * sliceAngle + offsetInSlice));
    var currentMod = normalizeAngle(currentRotation);
    var deltaMod = normalizeAngle(desiredMod - currentMod);
    // 6 or 7 full rotations + deltaMod ensures total spin is strictly in [6, 8) full turns
    var fullTurns = 6 + (rand() < 0.5 ? 0 : 1);
    return currentRotation + fullTurns * Math.PI * 2 + deltaMod;
  }

  function getSliceColors(count) {
    var n = Math.max(0, Math.floor(count || 0));
    var colors = [];
    for (var i = 0; i < n; i++) {
      var color = SLICE_COLORS[i % SLICE_COLORS.length];
      if (i === n - 1 && n >= 2 && color === colors[0]) {
        for (var c = 0; c < SLICE_COLORS.length; c++) {
          var candidate = SLICE_COLORS[c];
          if (candidate !== colors[0] && candidate !== colors[i - 1]) {
            color = candidate;
            break;
          }
        }
      }
      colors.push(color);
    }
    return colors;
  }

  function parsePeopleInput(rawText) {
    var lines = String(rawText || "").split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim().replace(/\s+/g, " ").slice(0, 60);
      if (trimmed) {
        out.push(trimmed);
      }
    }
    return out;
  }

  function validatePeopleList(people) {
    if (!Array.isArray(people) || people.length < MIN_PEOPLE) {
      return {
        valid: false,
        people: [],
        error: "Vui lòng nhập ít nhất 1 người tham gia."
      };
    }
    if (people.length > MAX_PEOPLE) {
      return {
        valid: false,
        people: people,
        error: "Danh sách tối đa 50 người (hiện có " + people.length + " người)."
      };
    }
    return {
      valid: true,
      people: people.slice(),
      error: ""
    };
  }

  function findRuleIndexByName(playerName, rules) {
    var exactTarget = normalizeExactName(playerName);
    if (!exactTarget || !Array.isArray(rules) || rules.length === 0) {
      return -1;
    }

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (!rule || typeof rule.giftIndex !== "number") continue;
      if (normalizeExactName(rule.name) === exactTarget) {
        return i;
      }
    }

    var strippedTarget = normalizeVietnameseName(playerName);
    if (!strippedTarget) return -1;

    for (var j = 0; j < rules.length; j++) {
      var fallbackRule = rules[j];
      if (!fallbackRule || typeof fallbackRule.giftIndex !== "number") continue;
      if (normalizeVietnameseName(fallbackRule.name) === strippedTarget) {
        return j;
      }
    }

    return -1;
  }

  function matchRuleForPlayer(playerName, rules) {
    var idx = findRuleIndexByName(playerName, rules);
    return idx !== -1 ? rules[idx] : null;
  }

  function sanitizeRoundsRemaining(val) {
    if (val === null || val === undefined || val === "") return null;
    var num = Number(val);
    if (num === 1 || num === 2 || num === 3) return num;
    return null;
  }

  function applyRoundSlotToRule(rules, targetRule, roundsVal) {
    if (!targetRule) return;
    var cleanRounds = sanitizeRoundsRemaining(roundsVal);
    targetRule.roundsRemaining = cleanRounds;
    targetRule.completed = false;

    if (cleanRounds !== null && Array.isArray(rules)) {
      for (var i = 0; i < rules.length; i++) {
        var other = rules[i];
        if (!other || other === targetRule) continue;
        if (other.id && targetRule.id && other.id === targetRule.id) continue;
        if (other.roundsRemaining === cleanRounds) {
          other.roundsRemaining = null;
        }
      }
    }
  }

  function findRemainingPersonIndexForRule(rule, remainingPeople) {
    if (!rule || !Array.isArray(remainingPeople) || remainingPeople.length === 0) {
      return -1;
    }
    var exactRuleName = normalizeExactName(rule.name);
    if (exactRuleName) {
      for (var i = 0; i < remainingPeople.length; i++) {
        if (normalizeExactName(remainingPeople[i]) === exactRuleName) {
          return i;
        }
      }
    }
    var strippedRuleName = normalizeVietnameseName(rule.name);
    if (strippedRuleName) {
      for (var j = 0; j < remainingPeople.length; j++) {
        if (normalizeVietnameseName(remainingPeople[j]) === strippedRuleName) {
          return j;
        }
      }
    }
    return -1;
  }

  function choosePeopleSpinTarget(state, rng) {
    var rand = typeof rng === "function" ? rng : Math.random;
    var remaining = Array.isArray(state && state.remainingPeople) ? state.remainingPeople : [];
    if (remaining.length === 0) {
      return { index: 0, reason: "random", ruleId: null };
    }

    var rules = Array.isArray(state.rules) ? state.rules : [];
    for (var i = rules.length - 1; i >= 0; i--) {
      var rule = rules[i];
      if (!rule || rule.roundsRemaining !== 1) continue;
      var forcedIdx = findRemainingPersonIndexForRule(rule, remaining);
      if (forcedIdx !== -1) {
        return { index: forcedIdx, reason: "scheduled", ruleId: rule.id || null };
      }
    }

    var eligibleIndices = [];
    for (var j = 0; j < remaining.length; j++) {
      var matched = matchRuleForPlayer(remaining[j], rules);
      if (matched && typeof matched.roundsRemaining === "number" && matched.roundsRemaining > 1) {
        continue;
      }
      eligibleIndices.push(j);
    }

    if (eligibleIndices.length > 0) {
      var pick = eligibleIndices[Math.floor(rand() * eligibleIndices.length)];
      return { index: pick, reason: "random", ruleId: null };
    }

    return {
      index: Math.floor(rand() * remaining.length),
      reason: "random",
      ruleId: null
    };
  }

  function advanceRoundRules(state, completedPlayerName) {
    if (!state || !Array.isArray(state.rules) || state.rules.length === 0) return;

    var matchedRule = matchRuleForPlayer(completedPlayerName, state.rules);

    for (var i = 0; i < state.rules.length; i++) {
      var rule = state.rules[i];
      if (!rule) continue;
      if (matchedRule && rule === matchedRule) {
        if (typeof rule.roundsRemaining === "number") {
          rule.roundsRemaining = null;
          rule.completed = true;
        }
      } else if (typeof rule.roundsRemaining === "number" && rule.roundsRemaining > 1) {
        rule.roundsRemaining -= 1;
      }
    }
  }

  function chooseSpinTarget(state, playerName, rng) {
    var rand = typeof rng === "function" ? rng : Math.random;

    if (
      typeof state.nextSpinGiftIndex === "number" &&
      state.nextSpinGiftIndex >= 0 &&
      state.nextSpinGiftIndex < GIFT_SLICE_COUNT
    ) {
      var forcedIndex = state.nextSpinGiftIndex;
      state.nextSpinGiftIndex = null;
      return { index: forcedIndex, reason: "next" };
    }

    var matched = matchRuleForPlayer(playerName, state.rules);
    if (
      matched &&
      matched.giftIndex >= 0 &&
      matched.giftIndex < GIFT_SLICE_COUNT
    ) {
      return { index: matched.giftIndex, reason: "name" };
    }

    return {
      index: Math.floor(rand() * GIFT_SLICE_COUNT),
      reason: "random"
    };
  }

  function sanitizePeopleArray(rawPeople) {
    if (!Array.isArray(rawPeople)) return [];
    var out = [];
    for (var i = 0; i < rawPeople.length; i++) {
      if (typeof rawPeople[i] === "string") {
        var name = rawPeople[i].trim().replace(/\s+/g, " ").slice(0, 60);
        if (name) {
          out.push(name);
        }
      }
      if (out.length >= MAX_PEOPLE) break;
    }
    return out;
  }

  function sanitizeGifts(rawGifts) {
    var result = DEFAULT_GIFTS.slice();
    if (Array.isArray(rawGifts)) {
      for (var i = 0; i < GIFT_SLICE_COUNT; i++) {
        if (typeof rawGifts[i] === "string" && rawGifts[i].trim()) {
          result[i] = rawGifts[i].trim().slice(0, 40);
        }
      }
    }
    return result;
  }

  function sanitizeRules(rawRules) {
    if (!Array.isArray(rawRules)) return [];
    var out = [];
    for (var i = 0; i < rawRules.length; i++) {
      var item = rawRules[i];
      if (!item || typeof item !== "object") continue;
      var name = typeof item.name === "string" ? item.name.trim().slice(0, 60) : "";
      var idx = Number(item.giftIndex);
      if (!name || !Number.isInteger(idx) || idx < 0 || idx >= GIFT_SLICE_COUNT) continue;
      var roundsRemaining = sanitizeRoundsRemaining(item.roundsRemaining);
      var completed = Boolean(item.completed) && roundsRemaining === null;
      out.push({
        id: typeof item.id === "string" && item.id ? item.id : "r_" + i + "_" + Date.now(),
        name: name,
        giftIndex: idx,
        roundsRemaining: roundsRemaining,
        completed: completed
      });
    }

    // Deduplicate conflicting round slots (1/2/3): keep only the last/newest owner
    var seenRounds = {};
    for (var j = out.length - 1; j >= 0; j--) {
      var r = out[j].roundsRemaining;
      if (r !== null) {
        if (seenRounds[r]) {
          out[j].roundsRemaining = null;
        } else {
          seenRounds[r] = true;
        }
      }
    }
    return out;
  }

  function sanitizeHistory(rawHistory) {
    if (!Array.isArray(rawHistory)) return [];
    var out = [];
    for (var i = 0; i < rawHistory.length; i++) {
      var entry = rawHistory[i];
      if (!entry || typeof entry !== "object") continue;
      if (typeof entry.prize !== "string" || !entry.prize.trim()) continue;
      out.push({
        player: typeof entry.player === "string" && entry.player.trim() ? entry.player.trim() : "Khách",
        prize: entry.prize.trim(),
        time: typeof entry.time === "string" ? entry.time : ""
      });
    }
    return out.slice(0, 100);
  }

  function createDefaultState() {
    return {
      people: DEFAULT_PEOPLE.slice(),
      remainingPeople: DEFAULT_PEOPLE.slice(),
      selectedPerson: null,
      removePicked: true,
      gifts: DEFAULT_GIFTS.slice(),
      history: [],
      rules: [],
      nextSpinGiftIndex: null,
      soundEnabled: true
    };
  }

  function loadState(storage) {
    var state = createDefaultState();
    if (!storage) return state;
    try {
      var raw = storage.getItem(STORAGE_KEY);
      if (!raw) return state;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return state;

      if (Array.isArray(parsed.people)) {
        var cleanPeople = sanitizePeopleArray(parsed.people);
        if (cleanPeople.length >= MIN_PEOPLE) {
          state.people = cleanPeople;
        }
      }

      if (Array.isArray(parsed.remainingPeople)) {
        state.remainingPeople = sanitizePeopleArray(parsed.remainingPeople);
      } else {
        // Safe migration from older vq2_data_v1 without participant list
        state.remainingPeople = state.people.slice();
      }

      if (typeof parsed.removePicked === "boolean") {
        state.removePicked = parsed.removePicked;
      }

      state.gifts = sanitizeGifts(parsed.gifts);
      state.history = sanitizeHistory(parsed.history);
      state.rules = sanitizeRules(parsed.rules);
      if (
        Number.isInteger(parsed.nextSpinGiftIndex) &&
        parsed.nextSpinGiftIndex >= 0 &&
        parsed.nextSpinGiftIndex < GIFT_SLICE_COUNT
      ) {
        state.nextSpinGiftIndex = parsed.nextSpinGiftIndex;
      }
      if (typeof parsed.soundEnabled === "boolean") {
        state.soundEnabled = parsed.soundEnabled;
      }

      if (parsed.defaultVersion !== 2) {
        var isLegacyGifts =
          state.gifts.length === LEGACY_DEFAULT_GIFTS.length &&
          state.gifts.every(function (g, i) {
            return g === LEGACY_DEFAULT_GIFTS[i];
          });
        if (isLegacyGifts) {
          state.gifts = DEFAULT_GIFTS.slice();
        }

        var isLegacyPeople =
          state.people.length === LEGACY_DEFAULT_PEOPLE.length &&
          state.people.every(function (p, i) {
            return p === LEGACY_DEFAULT_PEOPLE[i];
          });
        if (isLegacyPeople) {
          state.people = DEFAULT_PEOPLE.slice();
          state.remainingPeople = DEFAULT_PEOPLE.slice();
        }
      }
    } catch (err) {
      return createDefaultState();
    }
    return state;
  }

  function saveState(storage, state) {
    if (!storage) return;
    try {
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          defaultVersion: 2,
          people: state.people,
          remainingPeople: state.remainingPeople,
          removePicked: state.removePicked,
          gifts: state.gifts,
          history: state.history,
          rules: state.rules,
          nextSpinGiftIndex: state.nextSpinGiftIndex,
          soundEnabled: state.soundEnabled
        })
      );
    } catch (err) {
      // Ignore storage quota / private mode errors
    }
  }

  function createSoundEngine(getEnabled) {
    var audioCtx = null;

    function ensureContext() {
      if (!getEnabled()) return null;
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return null;
      if (!audioCtx) {
        try {
          audioCtx = new Ctx();
        } catch (err) {
          return null;
        }
      }
      if (audioCtx.state === "suspended" && typeof audioCtx.resume === "function") {
        audioCtx.resume().catch(function () {});
      }
      return audioCtx;
    }

    function playTick(isSlowMo) {
      var ctx = ensureContext();
      if (!ctx) return;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(isSlowMo ? 680 : 920, now);
      osc.frequency.exponentialRampToValueAtTime(
        isSlowMo ? 240 : 340,
        now + (isSlowMo ? 0.045 : 0.032)
      );

      gain.gain.setValueAtTime(isSlowMo ? 0.16 : 0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (isSlowMo ? 0.048 : 0.035));

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + (isSlowMo ? 0.055 : 0.04));
    }

    function playWinFanfare() {
      var ctx = ensureContext();
      if (!ctx) return;
      var now = ctx.currentTime;
      var notes = [523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        var start = now + i * 0.11;
        var duration = i === notes.length - 1 ? 0.55 : 0.22;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = i === notes.length - 1 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(notes[i], start);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.02);
      }
    }

    return {
      unlock: ensureContext,
      playTick: playTick,
      playWinFanfare: playWinFanfare
    };
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    var words = String(text || "").split(/\s+/);
    var lines = [];
    var current = "";

    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      var candidate = current ? current + " " + word : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
          current = word;
        } else {
          var clipped = word;
          while (clipped.length > 3 && ctx.measureText(clipped + "…").width > maxWidth) {
            clipped = clipped.slice(0, -1);
          }
          lines.push(clipped.length < word.length ? clipped + "…" : clipped);
          current = "";
        }
      }
    }
    if (current) {
      lines.push(current);
    }
    if (lines.length > 2) {
      var second = lines.slice(1).join(" ");
      while (second.length > 3 && ctx.measureText(second + "…").width > maxWidth) {
        second = second.slice(0, -1);
      }
      lines = [lines[0], second + "…"];
    }
    return lines;
  }

  function truncateCanvasText(ctx, text, maxWidth) {
    var str = String(text || "");
    if (ctx.measureText(str).width <= maxWidth) return str;
    var clipped = str;
    while (clipped.length > 1 && ctx.measureText(clipped + "…").width > maxWidth) {
      clipped = clipped.slice(0, -1);
    }
    return clipped + "…";
  }

  function initApp() {
    if (typeof document === "undefined") return;

    var wheelCanvas = document.getElementById("wheel-canvas");
    var wheelHub = document.getElementById("wheel-hub");
    var wheelPointer = document.querySelector(".wheel-pointer");
    var wheelFrame = document.querySelector(".wheel-frame");
    var stageBadge = document.getElementById("stage-badge");
    var stagePlayerInfo = document.getElementById("stage-player-info");
    var stagePlayerNameEl = document.getElementById("stage-player-name");
    var backToPeopleBtn = document.getElementById("back-to-people-btn");
    var spinBtn = document.getElementById("spin-btn");
    var wheelStatusMsg = document.getElementById("wheel-status-msg");
    var soundToggleBtn = document.getElementById("sound-toggle");
    var soundLabel = document.getElementById("sound-label");

    var peopleCountBadge = document.getElementById("people-count");
    var peopleForm = document.getElementById("people-form");
    var peopleInput = document.getElementById("people-input");
    var removePickedToggle = document.getElementById("remove-picked-toggle");
    var savePeopleBtn = document.getElementById("save-people-btn");
    var resetPeopleBtn = document.getElementById("reset-people-btn");
    var peopleFeedback = document.getElementById("people-feedback");

    var giftsForm = document.getElementById("gifts-form");
    var giftInputs = Array.prototype.slice.call(document.querySelectorAll(".gift-input"));
    var saveGiftsBtn = document.getElementById("save-gifts-btn");
    var giftsFeedback = document.getElementById("gifts-feedback");
    var historyList = document.getElementById("history-list");
    var clearHistoryBtn = document.getElementById("clear-history-btn");

    var pickedModal = document.getElementById("picked-modal");
    var pickedNameEl = document.getElementById("picked-name");
    var proceedGiftBtn = document.getElementById("proceed-gift-btn");
    var cancelPickedBtn = document.getElementById("cancel-picked-btn");

    var winModal = document.getElementById("win-modal");
    var winPlayerEl = document.getElementById("win-player");
    var winPrizeEl = document.getElementById("win-prize");
    var closeWinModalBtn = document.getElementById("close-win-modal");
    var confettiCanvas = document.getElementById("confetti-canvas");

    if (!wheelCanvas || !spinBtn) return;

    var storage = null;
    try {
      storage = global.localStorage;
    } catch (err) {
      storage = null;
    }

    var state = loadState(storage);
    state.selectedPerson = null;
    var currentStage = "people"; // "people" | "gifts"
    var selectedPersonIndex = -1;
    var pendingPickedPerson = null;
    var pendingPickedIndex = -1;
    var currentRotation = 0;
    var isSpinning = false;
    var giftsFeedbackTimer = null;
    var peopleFeedbackTimer = null;
    var pointerTickTimer = null;
    var hubClickTimes = [];
    var modalInstance = null;
    var modalStyleEl = null;
    var refreshOpenRules = null;

    var soundEngine = createSoundEngine(function () {
      return state.soundEnabled;
    });

    var ctx = wheelCanvas.getContext("2d");
    var LOGICAL_SIZE = 460;

    function configureWheelCanvas() {
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      wheelCanvas.width = LOGICAL_SIZE * dpr;
      wheelCanvas.height = LOGICAL_SIZE * dpr;
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    function getActiveWheelItems() {
      if (currentStage === "gifts") {
        return state.gifts.slice(0, GIFT_SLICE_COUNT);
      }
      return state.remainingPeople.slice();
    }

    function drawWheel(rotationRad, pulsePhase) {
      if (!ctx) return;
      var cx = LOGICAL_SIZE / 2;
      var cy = LOGICAL_SIZE / 2;
      var outerRadius = 224;
      var innerRadius = 200;

      ctx.clearRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

      // Outer decorative rim
      var rimGrad = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, outerRadius);
      rimGrad.addColorStop(0, "#9e141c");
      rimGrad.addColorStop(0.5, "#c81924");
      rimGrad.addColorStop(1, "#7f0f15");

      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
      ctx.fillStyle = rimGrad;
      ctx.fill();

      ctx.lineWidth = 3;
      ctx.strokeStyle = "#fde68a";
      ctx.stroke();

      // Festive rim dots
      var dotCount = 20;
      var dotRadius = 212;
      for (var d = 0; d < dotCount; d++) {
        var dotAngle = rotationRad * 0.35 + (d * Math.PI * 2) / dotCount;
        var dx = cx + Math.cos(dotAngle) * dotRadius;
        var dy = cy + Math.sin(dotAngle) * dotRadius;
        var isAlt = (d + Math.floor(pulsePhase || 0)) % 2 === 0;

        ctx.beginPath();
        ctx.arc(dx, dy, isAlt ? 4.4 : 3.6, 0, Math.PI * 2);
        ctx.fillStyle = isAlt ? "#fff8d6" : "#fbbf24";
        ctx.fill();
      }

      var items = getActiveWheelItems();
      var count = items.length;

      if (count === 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
        ctx.fillStyle = "#f3e8dc";
        ctx.fill();

        ctx.save();
        ctx.fillStyle = "#765341";
        ctx.font = "700 15px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Hết người trong vòng", cx, cy - 60);
        ctx.font = "600 13px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
        ctx.fillText("Nhấn \"Đặt lại vòng người\"", cx, cy + 60);
        ctx.restore();
      } else {
        var sliceAngle = (Math.PI * 2) / count;
        var colors = getSliceColors(count);
        var borderWidth = count <= 10 ? 2.5 : count <= 25 ? 1.5 : 1;

        for (var i = 0; i < count; i++) {
          var startAngle = rotationRad + i * sliceAngle;
          var endAngle = startAngle + sliceAngle;
          var midAngle = startAngle + sliceAngle / 2;

          ctx.beginPath();
          if (count === 1) {
            ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
          } else {
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, innerRadius, startAngle, endAngle);
            ctx.closePath();
          }
          ctx.fillStyle = colors[i];
          ctx.fill();

          if (count > 1) {
            ctx.lineWidth = borderWidth;
            ctx.strokeStyle = "#fff7e6";
            ctx.stroke();
          }

          var label = items[i] || "";
          ctx.save();
          ctx.translate(cx, cy);
          var flip = Math.cos(midAngle) < 0;
          ctx.rotate(flip ? midAngle + Math.PI : midAngle);

          var fontSize = 16;
          if (count > 36) {
            fontSize = 8;
          } else if (count > 24) {
            fontSize = 9.5;
          } else if (count > 14) {
            fontSize = 11;
          } else if (count > 8) {
            fontSize = 12.5;
          } else {
            if (label.length > 26) fontSize = 13;
            else if (label.length > 18) fontSize = 14;
          }

          ctx.font = "700 " + fontSize + "px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          var textX = flip ? (count > 14 ? -128 : -122) : (count > 14 ? 128 : 122);
          var maxTextWidth = count > 14 ? 108 : 104;
          var lines = count <= 8
            ? wrapCanvasText(ctx, label, maxTextWidth)
            : [truncateCanvasText(ctx, label, maxTextWidth)];
          var lineHeight = fontSize + 3;
          var startY = -((lines.length - 1) * lineHeight) / 2;

          ctx.shadowColor = "rgba(25, 10, 5, 0.45)";
          ctx.shadowBlur = count > 24 ? 2.5 : 4;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 1;
          ctx.fillStyle = "#ffffff";

          for (var l = 0; l < lines.length; l++) {
            ctx.fillText(lines[l], textX, startY + l * lineHeight);
          }
          ctx.restore();
        }
      }

      // Inner rim border
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "#fde68a";
      ctx.stroke();
    }

    function updatePeopleCountBadge(count) {
      if (!peopleCountBadge) return;
      peopleCountBadge.textContent = count + " / " + MAX_PEOPLE + " người";
    }

    function syncPeopleInputs() {
      if (peopleInput) {
        peopleInput.value = state.people.join("\n");
      }
      if (removePickedToggle) {
        removePickedToggle.checked = Boolean(state.removePicked);
      }
      updatePeopleCountBadge(state.people.length);
    }

    function syncGiftInputs() {
      for (var i = 0; i < giftInputs.length; i++) {
        var idx = Number(giftInputs[i].getAttribute("data-index"));
        if (!Number.isNaN(idx) && state.gifts[idx]) {
          giftInputs[i].value = state.gifts[idx];
        }
      }
    }

    function renderSoundButton() {
      if (!soundToggleBtn || !soundLabel) return;
      soundToggleBtn.classList.toggle("is-muted", !state.soundEnabled);
      soundToggleBtn.setAttribute("aria-pressed", state.soundEnabled ? "true" : "false");
      soundLabel.textContent = state.soundEnabled ? "Âm thanh: Bật" : "Âm thanh: Tắt";
    }

    function updateStageUI() {
      var isGifts = currentStage === "gifts";

      if (stageBadge) {
        stageBadge.textContent = isGifts
          ? "Bước 2/2: Quay Nhận Quà"
          : "Bước 1/2: Quay Chọn Người";
        stageBadge.classList.toggle("is-people", !isGifts);
        stageBadge.classList.toggle("is-gifts", isGifts);
      }

      if (stagePlayerInfo && stagePlayerNameEl) {
        if (isGifts) {
          var activeName = state.selectedPerson || "Khách";
          stagePlayerNameEl.textContent = activeName;
          stagePlayerInfo.hidden = false;
        } else {
          stagePlayerNameEl.textContent = "";
          stagePlayerInfo.hidden = true;
        }
      }

      if (backToPeopleBtn) {
        backToPeopleBtn.hidden = !isGifts;
      }

      spinBtn.textContent = isGifts ? "QUAY NHẬN QUÀ!" : "QUAY CHỌN NGƯỜI!";

      var noRemainingPeople = !isGifts && state.remainingPeople.length === 0;
      if (wheelStatusMsg) {
        if (noRemainingPeople) {
          wheelStatusMsg.textContent = "Đã hết người trong vòng chọn. Nhấn \"Đặt lại vòng người\" để tiếp tục.";
          wheelStatusMsg.hidden = false;
        } else {
          wheelStatusMsg.textContent = "";
          wheelStatusMsg.hidden = true;
        }
      }

      if (!isSpinning) {
        spinBtn.disabled = noRemainingPeople;
      }
    }

    function renderHistory() {
      if (!historyList) return;
      historyList.innerHTML = "";
      if (!state.history.length) {
        var emptyEl = document.createElement("p");
        emptyEl.className = "history-empty";
        emptyEl.textContent = "Chưa có lượt quay nào.";
        historyList.appendChild(emptyEl);
        return;
      }

      for (var i = 0; i < state.history.length; i++) {
        var entry = state.history[i];
        var itemEl = document.createElement("div");
        itemEl.className = "history-item";

        var mainEl = document.createElement("div");
        mainEl.className = "history-item-main";

        var playerEl = document.createElement("span");
        playerEl.className = "history-player";
        playerEl.textContent = entry.player;

        var prizeEl = document.createElement("span");
        prizeEl.className = "history-prize";
        prizeEl.textContent = entry.prize;

        mainEl.appendChild(playerEl);
        mainEl.appendChild(prizeEl);

        var timeEl = document.createElement("span");
        timeEl.className = "history-time";
        timeEl.textContent = entry.time;

        itemEl.appendChild(mainEl);
        itemEl.appendChild(timeEl);
        historyList.appendChild(itemEl);
      }
    }

    function formatTimeNow() {
      var now = new Date();
      var hh = String(now.getHours()).padStart(2, "0");
      var mm = String(now.getMinutes()).padStart(2, "0");
      var ss = String(now.getSeconds()).padStart(2, "0");
      return hh + ":" + mm + ":" + ss;
    }

    function launchConfetti() {
      if (!confettiCanvas) return;
      var cCtx = confettiCanvas.getContext("2d");
      if (!cCtx) return;

      var width = (confettiCanvas.width = global.innerWidth || 1024);
      var height = (confettiCanvas.height = global.innerHeight || 768);
      var colors = ["#E63946", "#F59E0B", "#2A9D8F", "#457B9D", "#9B5DE5", "#FFD166"];
      var particles = [];

      for (var i = 0; i < 120; i++) {
        particles.push({
          x: width * (0.25 + Math.random() * 0.5),
          y: height * 0.35 + (Math.random() - 0.5) * 60,
          vx: (Math.random() - 0.5) * 14,
          vy: -Math.random() * 12 - 3,
          w: 6 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          rot: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.25,
          color: colors[i % colors.length],
          alpha: 1
        });
      }

      function step() {
        cCtx.clearRect(0, 0, width, height);
        var alive = false;
        for (var i = 0; i < particles.length; i++) {
          var p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.34;
          p.vx *= 0.985;
          p.rot += p.vRot;
          if (p.y > height * 0.85) {
            p.alpha -= 0.03;
          }
          if (p.alpha > 0.02 && p.y < height + 40) {
            alive = true;
            cCtx.save();
            cCtx.globalAlpha = Math.max(0, p.alpha);
            cCtx.translate(p.x, p.y);
            cCtx.rotate(p.rot);
            cCtx.fillStyle = p.color;
            cCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            cCtx.restore();
          }
        }
        if (alive && typeof global.requestAnimationFrame === "function") {
          global.requestAnimationFrame(step);
        } else {
          cCtx.clearRect(0, 0, width, height);
        }
      }

      if (typeof global.requestAnimationFrame === "function") {
        global.requestAnimationFrame(step);
      }
    }

    function showPickedModal(personName, personIndex) {
      pendingPickedPerson = personName;
      pendingPickedIndex = personIndex;
      if (pickedNameEl) {
        pickedNameEl.textContent = personName;
      }
      if (pickedModal) {
        pickedModal.hidden = false;
      }
      soundEngine.playWinFanfare();
      if (proceedGiftBtn) {
        proceedGiftBtn.focus();
      }
    }

    function hidePickedModal() {
      if (pickedModal) {
        pickedModal.hidden = true;
      }
      pendingPickedPerson = null;
      pendingPickedIndex = -1;
    }

    function proceedToGiftsStage() {
      var person = pendingPickedPerson;
      var index = pendingPickedIndex;
      hidePickedModal();
      if (!person) return;

      currentStage = "gifts";
      state.selectedPerson = person;
      selectedPersonIndex = index;
      currentRotation = normalizeAngle(currentRotation);
      updateStageUI();
      drawWheel(currentRotation, 0);
    }

    function returnToPeopleStage() {
      currentStage = "people";
      state.selectedPerson = null;
      selectedPersonIndex = -1;
      currentRotation = normalizeAngle(currentRotation);
      updateStageUI();
      drawWheel(currentRotation, 0);
    }

    function showWinModal(playerDisplay, prizeName) {
      if (!winModal || !winPlayerEl || !winPrizeEl) return;
      winPlayerEl.textContent = "Người quay: " + playerDisplay;
      winPrizeEl.textContent = prizeName;
      winModal.hidden = false;
      launchConfetti();
      soundEngine.playWinFanfare();
      if (closeWinModalBtn) {
        closeWinModalBtn.focus();
      }
    }

    function hideWinModal() {
      if (!winModal) return;
      if (winModal.hidden) return;
      winModal.hidden = true;
      returnToPeopleStage();
    }

    function setSpinControlsDisabled(disabled) {
      if (disabled) {
        spinBtn.disabled = true;
      } else {
        spinBtn.disabled = currentStage === "people" && state.remainingPeople.length === 0;
      }
      if (saveGiftsBtn) saveGiftsBtn.disabled = disabled;
      if (savePeopleBtn) savePeopleBtn.disabled = disabled;
      if (resetPeopleBtn) resetPeopleBtn.disabled = disabled;
      if (backToPeopleBtn) backToPeopleBtn.disabled = disabled;
    }

    function setPeopleFeedback(message, isError) {
      if (!peopleFeedback) return;
      peopleFeedback.textContent = message;
      peopleFeedback.classList.toggle("is-error", Boolean(isError));
      if (peopleFeedbackTimer) global.clearTimeout(peopleFeedbackTimer);
      peopleFeedbackTimer = global.setTimeout(function () {
        peopleFeedback.textContent = "";
        peopleFeedback.classList.remove("is-error");
      }, 3000);
    }

    function triggerPointerTick() {
      if (!wheelPointer) return;
      wheelPointer.classList.add("is-ticking");
      if (pointerTickTimer) {
        global.clearTimeout(pointerTickTimer);
      }
      pointerTickTimer = global.setTimeout(function () {
        if (wheelPointer) {
          wheelPointer.classList.remove("is-ticking");
        }
        pointerTickTimer = null;
      }, 80);
    }

    function clearSpinVisualEffects() {
      if (pointerTickTimer) {
        global.clearTimeout(pointerTickTimer);
        pointerTickTimer = null;
      }
      if (wheelPointer) {
        wheelPointer.classList.remove("is-ticking");
      }
      if (wheelFrame) {
        wheelFrame.classList.remove("is-slowmo");
      }
    }

    function startSpin() {
      if (isSpinning) return;
      if (pickedModal && !pickedModal.hidden) return;
      if (winModal && !winModal.hidden) return;

      if (currentStage === "people") {
        if (state.remainingPeople.length === 0) {
          updateStageUI();
          return;
        }
      }

      soundEngine.unlock();

      var isGiftStage = currentStage === "gifts";
      var activeItems = getActiveWheelItems();
      var sliceCount = activeItems.length;
      if (sliceCount === 0) return;

      var targetIndex = 0;
      var trimmedPlayer = "";
      var displayPlayer = "Khách";

      if (isGiftStage) {
        trimmedPlayer = state.selectedPerson || "";
        displayPlayer = trimmedPlayer || "Khách";
        var selection = chooseSpinTarget(state, trimmedPlayer);
        targetIndex = selection.index;
        saveState(storage, state);
      } else {
        var peopleSelection = choosePeopleSpinTarget(state);
        targetIndex = peopleSelection.index;
      }

      var startRotation = currentRotation;
      var finalRotation = computeTargetRotation(startRotation, targetIndex, sliceCount);
      var sliceAngle = (Math.PI * 2) / sliceCount;
      var tickStepAngle = sliceCount <= 5 ? sliceAngle / 2 : sliceAngle;

      clearSpinVisualEffects();
      isSpinning = true;
      setSpinControlsDisabled(true);

      var startTime = null;
      var lastTickBucket = Math.floor((startRotation - POINTER_ANGLE) / tickStepAngle);

      function finishSpin() {
        clearSpinVisualEffects();
        currentRotation = finalRotation;
        drawWheel(currentRotation, 0);
        isSpinning = false;
        setSpinControlsDisabled(false);

        var landedIndex = getSliceAtRotation(currentRotation, sliceCount);

        if (!isGiftStage) {
          var pickedPerson = activeItems[landedIndex] || activeItems[0];
          showPickedModal(pickedPerson, landedIndex);
          return;
        }

        var wonPrize = state.gifts[landedIndex] || DEFAULT_GIFTS[landedIndex];
        state.history.unshift({
          player: displayPlayer,
          prize: wonPrize,
          time: formatTimeNow()
        });
        if (state.history.length > 100) {
          state.history = state.history.slice(0, 100);
        }

        if (state.removePicked && state.selectedPerson) {
          if (
            selectedPersonIndex >= 0 &&
            selectedPersonIndex < state.remainingPeople.length &&
            state.remainingPeople[selectedPersonIndex] === state.selectedPerson
          ) {
            state.remainingPeople.splice(selectedPersonIndex, 1);
          } else {
            var idxToRemove = state.remainingPeople.indexOf(state.selectedPerson);
            if (idxToRemove !== -1) {
              state.remainingPeople.splice(idxToRemove, 1);
            }
          }
        }

        advanceRoundRules(state, state.selectedPerson);

        saveState(storage, state);
        if (typeof refreshOpenRules === "function") {
          refreshOpenRules();
        }
        renderHistory();
        showWinModal(displayPlayer, wonPrize);
      }

      function frame(timestamp) {
        if (startTime === null) startTime = timestamp;
        var elapsed = timestamp - startTime;
        var progress = Math.min(1, elapsed / SPIN_DURATION_MS);
        var eased = easeSlowMo(progress);

        currentRotation = startRotation + (finalRotation - startRotation) * eased;

        var isSlowMo = progress >= 0.52 && progress < 1;
        if (wheelFrame) {
          wheelFrame.classList.toggle("is-slowmo", isSlowMo);
        }

        var currentBucket = Math.floor((currentRotation - POINTER_ANGLE) / tickStepAngle);
        if (currentBucket !== lastTickBucket) {
          lastTickBucket = currentBucket;
          soundEngine.playTick(progress >= 0.52);
          triggerPointerTick();
        }

        drawWheel(currentRotation, Math.floor(elapsed / 140));

        if (progress < 1) {
          global.requestAnimationFrame(frame);
        } else {
          finishSpin();
        }
      }

      if (typeof global.requestAnimationFrame === "function") {
        global.requestAnimationFrame(frame);
      } else {
        finishSpin();
      }
    }

    // Dynamic hidden configuration modal (created only when triggered)
    function ensureModalStyles() {
      if (modalStyleEl) return;
      modalStyleEl = document.createElement("style");
      modalStyleEl.textContent = [
        ".vq-cfg-backdrop{position:fixed;inset:0;z-index:200;background:rgba(28,12,6,0.62);backdrop-filter:blur(4px);display:grid;place-items:center;padding:16px;}",
        ".vq-cfg-card{width:100%;max-width:500px;max-height:90vh;overflow-y:auto;background:#fffdf9;border:2px solid #f59e0b;border-radius:18px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,0.35);color:#2d1810;font-family:inherit;}",
        ".vq-cfg-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(196,118,52,0.2);}",
        ".vq-cfg-head h3{margin:0;font-size:1.12rem;font-weight:800;color:#8c191f;}",
        ".vq-cfg-close{border:1px solid rgba(118,83,65,0.25);background:#fff;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;color:#2d1810;}",
        ".vq-cfg-section{margin-bottom:18px;}",
        ".vq-cfg-section:last-child{margin-bottom:0;}",
        ".vq-cfg-label{display:block;font-size:0.92rem;font-weight:700;margin-bottom:8px;color:#2d1810;}",
        ".vq-cfg-form{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}",
        ".vq-cfg-input,.vq-cfg-select{padding:9px 11px;border:1.5px solid rgba(158,92,46,0.28);border-radius:9px;font-size:0.92rem;font-family:inherit;background:#fff;color:#2d1810;}",
        ".vq-cfg-input{flex:1 1 160px;}",
        ".vq-cfg-select{flex:1 1 150px;width:100%;}",
        ".vq-cfg-rounds-select{flex:1 1 190px;}",
        ".vq-cfg-add{padding:9px 15px;border:none;border-radius:9px;background:#d9232e;color:#fff;font-weight:700;cursor:pointer;}",
        ".vq-cfg-warning{margin:0 0 10px;padding:8px 10px;border-radius:9px;background:#fef2f2;border:1px solid rgba(220,38,38,0.35);color:#991b1b;font-size:0.84rem;font-weight:600;line-height:1.35;}",
        ".vq-cfg-list{display:flex;flex-direction:column;gap:6px;max-height:210px;overflow-y:auto;}",
        ".vq-cfg-row{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:9px;background:#fff7eb;border:1px solid rgba(196,118,52,0.18);font-size:0.9rem;}",
        ".vq-cfg-row-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}",
        ".vq-cfg-row-main{display:flex;align-items:center;gap:8px;min-width:0;flex:1 1 180px;}",
        ".vq-cfg-row-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
        ".vq-cfg-row-actions{display:flex;align-items:center;gap:6px;flex-shrink:0;}",
        ".vq-cfg-row-rounds{padding:4px 8px;border:1px solid rgba(158,92,46,0.28);border-radius:7px;font-size:0.8rem;font-family:inherit;background:#fff;color:#2d1810;max-width:175px;}",
        ".vq-cfg-row-warn{font-size:0.78rem;font-weight:600;color:#b91c1c;line-height:1.3;}",
        ".vq-cfg-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:0.78rem;font-weight:700;white-space:nowrap;flex-shrink:0;background:#fef3c7;color:#92400e;border:1px solid rgba(245,158,11,0.35);}",
        ".vq-cfg-badge.is-ready{background:#fee2e2;color:#991b1b;border-color:rgba(220,38,38,0.3);}",
        ".vq-cfg-badge.is-done{background:#dcfce7;color:#166534;border-color:rgba(22,163,74,0.3);}",
        ".vq-cfg-del{border:1px solid rgba(217,35,46,0.3);background:#fff;color:#b91c1c;border-radius:7px;padding:4px 9px;font-size:0.82rem;font-weight:600;cursor:pointer;flex-shrink:0;}",
        ".vq-cfg-empty{margin:4px 0;font-size:0.88rem;color:#765341;}"
      ].join("");
      document.head.appendChild(modalStyleEl);
    }

    function closeConfigModal() {
      refreshOpenRules = null;
      if (modalInstance && modalInstance.parentNode) {
        modalInstance.parentNode.removeChild(modalInstance);
      }
      modalInstance = null;
      if (modalStyleEl && modalStyleEl.parentNode) {
        modalStyleEl.parentNode.removeChild(modalStyleEl);
      }
      modalStyleEl = null;
    }

    function openConfigModal() {
      if (modalInstance) {
        closeConfigModal();
        return;
      }
      ensureModalStyles();

      var backdrop = document.createElement("div");
      backdrop.className = "vq-cfg-backdrop";
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-modal", "true");

      var card = document.createElement("div");
      card.className = "vq-cfg-card";

      var head = document.createElement("div");
      head.className = "vq-cfg-head";
      var heading = document.createElement("h3");
      heading.textContent = "Thiết lập chỉ định";
      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "vq-cfg-close";
      closeBtn.textContent = "Đóng";
      head.appendChild(heading);
      head.appendChild(closeBtn);
      card.appendChild(head);

      // Section 1: Chỉ định theo tên
      var sec1 = document.createElement("div");
      sec1.className = "vq-cfg-section";
      var sec1Label = document.createElement("span");
      sec1Label.className = "vq-cfg-label";
      sec1Label.textContent = "Chỉ định theo tên";
      sec1.appendChild(sec1Label);

      var ruleForm = document.createElement("form");
      ruleForm.className = "vq-cfg-form";

      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "vq-cfg-input";
      nameInput.placeholder = "Nhập tên người quay...";
      nameInput.maxLength = 60;

      var giftSelect = document.createElement("select");
      giftSelect.className = "vq-cfg-select";
      for (var i = 0; i < GIFT_SLICE_COUNT; i++) {
        var opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = (i + 1) + ". " + state.gifts[i];
        giftSelect.appendChild(opt);
      }

      var roundsSelect = document.createElement("select");
      roundsSelect.className = "vq-cfg-select vq-cfg-rounds-select";
      roundsSelect.setAttribute("aria-label", "Số vòng quay ra");
      var roundOptions = [
        { value: "", label: "Chỉ ép quà (khi tự trúng tên)" },
        { value: "1", label: "Quay 1 vòng là ra" },
        { value: "2", label: "Quay 2 vòng là ra" },
        { value: "3", label: "Quay 3 vòng là ra" }
      ];
      for (var ro = 0; ro < roundOptions.length; ro++) {
        var rOpt = document.createElement("option");
        rOpt.value = roundOptions[ro].value;
        rOpt.textContent = roundOptions[ro].label;
        roundsSelect.appendChild(rOpt);
      }
      roundsSelect.value = "1";

      var addBtn = document.createElement("button");
      addBtn.type = "submit";
      addBtn.className = "vq-cfg-add";
      addBtn.textContent = "Thêm";

      ruleForm.appendChild(nameInput);
      ruleForm.appendChild(giftSelect);
      ruleForm.appendChild(roundsSelect);
      ruleForm.appendChild(addBtn);
      sec1.appendChild(ruleForm);

      var modalWarningEl = document.createElement("div");
      modalWarningEl.className = "vq-cfg-warning";
      modalWarningEl.setAttribute("role", "alert");
      modalWarningEl.hidden = true;
      sec1.appendChild(modalWarningEl);

      var rulesListEl = document.createElement("div");
      rulesListEl.className = "vq-cfg-list";
      sec1.appendChild(rulesListEl);
      card.appendChild(sec1);

      // Section 2: Chỉ định lượt quay kế tiếp (1 lần)
      var sec2 = document.createElement("div");
      sec2.className = "vq-cfg-section";
      var sec2Label = document.createElement("label");
      sec2Label.className = "vq-cfg-label";
      sec2Label.textContent = "Chỉ định lượt quay kế tiếp (1 lần)";
      sec2.appendChild(sec2Label);

      var nextSelect = document.createElement("select");
      nextSelect.className = "vq-cfg-select";
      var noneOpt = document.createElement("option");
      noneOpt.value = "";
      noneOpt.textContent = "Không chỉ định (Ngẫu nhiên)";
      nextSelect.appendChild(noneOpt);

      for (var j = 0; j < GIFT_SLICE_COUNT; j++) {
        var gOpt = document.createElement("option");
        gOpt.value = String(j);
        gOpt.textContent = (j + 1) + ". " + state.gifts[j];
        nextSelect.appendChild(gOpt);
      }
      nextSelect.value =
        state.nextSpinGiftIndex !== null ? String(state.nextSpinGiftIndex) : "";

      sec2.appendChild(nextSelect);
      card.appendChild(sec2);

      function buildMissingWarningText(name) {
        return (
          "⚠ '" +
          name +
          "' hiện không có trong vòng chọn người (kiểm tra đã bấm 'Lưu danh sách' hoặc 'Đặt lại vòng người' chưa)."
        );
      }

      function renderRules() {
        rulesListEl.innerHTML = "";
        var missingNames = [];

        if (!state.rules.length) {
          modalWarningEl.textContent = "";
          modalWarningEl.hidden = true;
          var empty = document.createElement("p");
          empty.className = "vq-cfg-empty";
          empty.textContent = "Chưa có quy tắc nào.";
          rulesListEl.appendChild(empty);
          return;
        }
        for (var k = 0; k < state.rules.length; k++) {
          (function (rule) {
            var row = document.createElement("div");
            row.className = "vq-cfg-row";

            var top = document.createElement("div");
            top.className = "vq-cfg-row-top";

            var main = document.createElement("div");
            main.className = "vq-cfg-row-main";

            var text = document.createElement("span");
            text.className = "vq-cfg-row-text";
            var giftTitle = state.gifts[rule.giftIndex] || DEFAULT_GIFTS[rule.giftIndex];
            text.textContent = rule.name + " → " + giftTitle;

            var badge = document.createElement("span");
            badge.className = "vq-cfg-badge";
            if (rule.roundsRemaining === 1) {
              badge.textContent = "Quay 1 vòng là ra";
              badge.classList.add("is-ready");
            } else if (rule.roundsRemaining === 2 || rule.roundsRemaining === 3) {
              badge.textContent = "Còn " + rule.roundsRemaining + " vòng";
            } else if (rule.completed) {
              badge.textContent = "Đã ra";
              badge.classList.add("is-done");
            } else {
              badge.textContent = "Chỉ ép quà";
            }

            main.appendChild(text);
            main.appendChild(badge);

            var actions = document.createElement("div");
            actions.className = "vq-cfg-row-actions";

            var rowRoundsSelect = document.createElement("select");
            rowRoundsSelect.className = "vq-cfg-row-rounds";
            rowRoundsSelect.setAttribute("aria-label", "Đổi số vòng ra cho " + rule.name);
            for (var rIdx = 0; rIdx < roundOptions.length; rIdx++) {
              var rrOpt = document.createElement("option");
              rrOpt.value = roundOptions[rIdx].value;
              rrOpt.textContent = roundOptions[rIdx].label;
              rowRoundsSelect.appendChild(rrOpt);
            }
            rowRoundsSelect.value =
              rule.roundsRemaining !== null ? String(rule.roundsRemaining) : "";
            rowRoundsSelect.addEventListener("change", function () {
              var nextRounds = sanitizeRoundsRemaining(rowRoundsSelect.value);
              applyRoundSlotToRule(state.rules, rule, nextRounds);
              saveState(storage, state);
              renderRules();
            });

            var delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "vq-cfg-del";
            delBtn.textContent = "Xóa";
            delBtn.addEventListener("click", function () {
              state.rules = state.rules.filter(function (r) {
                return r.id !== rule.id;
              });
              saveState(storage, state);
              renderRules();
            });

            actions.appendChild(rowRoundsSelect);
            actions.appendChild(delBtn);

            top.appendChild(main);
            top.appendChild(actions);
            row.appendChild(top);

            if (
              rule.roundsRemaining !== null &&
              findRemainingPersonIndexForRule(rule, state.remainingPeople) === -1
            ) {
              missingNames.push(rule.name);
              var rowWarn = document.createElement("div");
              rowWarn.className = "vq-cfg-row-warn";
              rowWarn.textContent = buildMissingWarningText(rule.name);
              row.appendChild(rowWarn);
            }

            rulesListEl.appendChild(row);
          })(state.rules[k]);
        }

        if (missingNames.length === 1) {
          modalWarningEl.textContent = buildMissingWarningText(missingNames[0]);
          modalWarningEl.hidden = false;
        } else if (missingNames.length > 1) {
          modalWarningEl.textContent = buildMissingWarningText(missingNames.join(", "));
          modalWarningEl.hidden = false;
        } else {
          modalWarningEl.textContent = "";
          modalWarningEl.hidden = true;
        }
      }

      ruleForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var cleanName = nameInput.value.trim().replace(/\s+/g, " ").slice(0, 60);
        if (!cleanName) {
          nameInput.focus();
          return;
        }
        var targetIdx = Number(giftSelect.value);
        if (!Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= GIFT_SLICE_COUNT) {
          return;
        }
        var roundsVal = sanitizeRoundsRemaining(roundsSelect.value);

        var existingIdx = findRuleIndexByName(cleanName, state.rules);
        if (existingIdx !== -1) {
          var existingRule = state.rules[existingIdx];
          existingRule.name = cleanName;
          existingRule.giftIndex = targetIdx;
          applyRoundSlotToRule(state.rules, existingRule, roundsVal);
        } else {
          var newRule = {
            id: "r_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
            name: cleanName,
            giftIndex: targetIdx,
            roundsRemaining: null,
            completed: false
          };
          state.rules.push(newRule);
          applyRoundSlotToRule(state.rules, newRule, roundsVal);
        }
        saveState(storage, state);
        nameInput.value = "";
        roundsSelect.value = "1";
        renderRules();
      });

      nextSelect.addEventListener("change", function () {
        if (nextSelect.value === "") {
          state.nextSpinGiftIndex = null;
        } else {
          var val = Number(nextSelect.value);
          state.nextSpinGiftIndex =
            Number.isInteger(val) && val >= 0 && val < GIFT_SLICE_COUNT ? val : null;
        }
        saveState(storage, state);
      });

      closeBtn.addEventListener("click", closeConfigModal);
      backdrop.addEventListener("click", function (e) {
        if (e.target === backdrop) {
          closeConfigModal();
        }
      });

      refreshOpenRules = renderRules;
      renderRules();
      backdrop.appendChild(card);
      document.body.appendChild(backdrop);
      modalInstance = backdrop;
      nameInput.focus();
    }

    // Event wiring
    spinBtn.addEventListener("click", startSpin);

    if (backToPeopleBtn) {
      backToPeopleBtn.addEventListener("click", function () {
        if (isSpinning) return;
        returnToPeopleStage();
      });
    }

    if (soundToggleBtn) {
      soundToggleBtn.addEventListener("click", function () {
        state.soundEnabled = !state.soundEnabled;
        saveState(storage, state);
        renderSoundButton();
        if (state.soundEnabled) {
          soundEngine.unlock();
          soundEngine.playTick();
        }
      });
    }

    if (peopleInput) {
      peopleInput.addEventListener("input", function () {
        var parsed = parsePeopleInput(peopleInput.value);
        updatePeopleCountBadge(parsed.length);
      });
    }

    if (removePickedToggle) {
      removePickedToggle.addEventListener("change", function () {
        state.removePicked = Boolean(removePickedToggle.checked);
        saveState(storage, state);
      });
    }

    if (peopleForm) {
      peopleForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (isSpinning) return;

        var parsed = parsePeopleInput(peopleInput ? peopleInput.value : "");
        var check = validatePeopleList(parsed);
        updatePeopleCountBadge(parsed.length);

        if (!check.valid) {
          setPeopleFeedback(check.error, true);
          return;
        }

        state.people = check.people;
        state.remainingPeople = check.people.slice();
        if (peopleInput) {
          peopleInput.value = state.people.join("\n");
        }
        saveState(storage, state);

        if (currentStage === "people") {
          currentRotation = 0;
          updateStageUI();
          drawWheel(currentRotation, 0);
        }
        if (typeof refreshOpenRules === "function") {
          refreshOpenRules();
        }
        setPeopleFeedback("Đã lưu danh sách " + state.people.length + " người!", false);
      });
    }

    if (resetPeopleBtn) {
      resetPeopleBtn.addEventListener("click", function () {
        if (isSpinning) return;
        state.remainingPeople = state.people.slice();
        saveState(storage, state);
        if (currentStage === "people") {
          currentRotation = 0;
          updateStageUI();
          drawWheel(currentRotation, 0);
        }
        if (typeof refreshOpenRules === "function") {
          refreshOpenRules();
        }
        setPeopleFeedback("Đã đặt lại vòng người (" + state.remainingPeople.length + " người)!", false);
      });
    }

    if (giftsForm) {
      giftsForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (isSpinning) return;

        var nextGifts = [];
        for (var i = 0; i < GIFT_SLICE_COUNT; i++) {
          var inputEl = giftInputs.find(function (el) {
            return Number(el.getAttribute("data-index")) === i;
          });
          var val = inputEl ? inputEl.value.trim() : "";
          nextGifts[i] = val || DEFAULT_GIFTS[i];
          if (inputEl) inputEl.value = nextGifts[i];
        }

        state.gifts = nextGifts;
        saveState(storage, state);
        if (currentStage === "gifts") {
          drawWheel(currentRotation, 0);
        }
        if (typeof refreshOpenRules === "function") {
          refreshOpenRules();
        }

        if (giftsFeedback) {
          giftsFeedback.textContent = "Đã lưu danh sách quà!";
          if (giftsFeedbackTimer) global.clearTimeout(giftsFeedbackTimer);
          giftsFeedbackTimer = global.setTimeout(function () {
            giftsFeedback.textContent = "";
          }, 2500);
        }
      });
    }

    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener("click", function () {
        state.history = [];
        saveState(storage, state);
        renderHistory();
      });
    }

    if (proceedGiftBtn) {
      proceedGiftBtn.addEventListener("click", proceedToGiftsStage);
    }

    if (cancelPickedBtn) {
      cancelPickedBtn.addEventListener("click", hidePickedModal);
    }

    if (pickedModal) {
      pickedModal.addEventListener("click", function (e) {
        if (e.target === pickedModal) {
          hidePickedModal();
        }
      });
    }

    if (closeWinModalBtn) {
      closeWinModalBtn.addEventListener("click", hideWinModal);
    }

    if (winModal) {
      winModal.addEventListener("click", function (e) {
        if (e.target === winModal) {
          hideWinModal();
        }
      });
    }

    // Secret Trigger 1: Click #wheel-hub 5 times within 2.5 seconds (does NOT trigger spin)
    if (wheelHub) {
      wheelHub.addEventListener("click", function (e) {
        e.stopPropagation();
        var now = Date.now();
        hubClickTimes = hubClickTimes.filter(function (t) {
          return now - t <= HUB_CLICK_WINDOW_MS;
        });
        hubClickTimes.push(now);
        if (hubClickTimes.length >= HUB_CLICK_TARGET) {
          hubClickTimes = [];
          openConfigModal();
        }
      });
    }

    // Secret Trigger 2: Ctrl+Shift+K
    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === "K" || e.key === "k" || e.code === "KeyK")) {
        e.preventDefault();
        openConfigModal();
        return;
      }
      if (e.key === "Escape") {
        if (modalInstance) {
          closeConfigModal();
        } else if (winModal && !winModal.hidden) {
          hideWinModal();
        } else if (pickedModal && !pickedModal.hidden) {
          hidePickedModal();
        }
      }
    });

    // Initial render
    configureWheelCanvas();
    syncPeopleInputs();
    syncGiftInputs();
    renderSoundButton();
    renderHistory();
    updateStageUI();
    drawWheel(currentRotation, 0);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initApp);
    } else {
      initApp();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      STORAGE_KEY: STORAGE_KEY,
      SLICE_COUNT: SLICE_COUNT,
      GIFT_SLICE_COUNT: GIFT_SLICE_COUNT,
      SLICE_ANGLE: SLICE_ANGLE,
      MIN_PEOPLE: MIN_PEOPLE,
      MAX_PEOPLE: MAX_PEOPLE,
      DEFAULT_PEOPLE: DEFAULT_PEOPLE,
      DEFAULT_GIFTS: DEFAULT_GIFTS,
      SLICE_COLORS: SLICE_COLORS,
      SPIN_DURATION_MS: SPIN_DURATION_MS,
      easeSlowMo: easeSlowMo,
      normalizeAngle: normalizeAngle,
      normalizeExactName: normalizeExactName,
      normalizeVietnameseName: normalizeVietnameseName,
      getSliceAtRotation: getSliceAtRotation,
      computeTargetRotation: computeTargetRotation,
      getSliceColors: getSliceColors,
      parsePeopleInput: parsePeopleInput,
      validatePeopleList: validatePeopleList,
      findRuleIndexByName: findRuleIndexByName,
      matchRuleForPlayer: matchRuleForPlayer,
      findRemainingPersonIndexForRule: findRemainingPersonIndexForRule,
      sanitizeRoundsRemaining: sanitizeRoundsRemaining,
      applyRoundSlotToRule: applyRoundSlotToRule,
      sanitizeRules: sanitizeRules,
      choosePeopleSpinTarget: choosePeopleSpinTarget,
      advanceRoundRules: advanceRoundRules,
      chooseSpinTarget: chooseSpinTarget,
      createDefaultState: createDefaultState,
      loadState: loadState,
      saveState: saveState
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
