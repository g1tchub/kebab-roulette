(function () {
  "use strict";

  const STORAGE_KEY = "stagRouletteConfigV1";
  const ASSETS = {
    chip: "assets/chip.png",
    winner: "assets/winner.png",
    loser: "assets/loser.png"
  };
  const DEFAULT_CONFIG = {
    groomName: "Conor",
    powerNumbers: [11, 2, 27, 30, 5, 36],
    powerChance: 37
  };
  const DEFAULT_LEGACY_BOOST = 3;
  const OLD_DEFAULT_POWER_NUMBERS = [7, 14, 23, 29, 32];
  const MAX_POWER_CHANCE = 95;

  const WHEEL_ORDER = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
  ];
  const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const TWO_PI = Math.PI * 2;
  const WHEEL_ZERO_ANGLE = -Math.PI / 2;
  const BALL_LANDING_ANGLE = -Math.PI / 2;
  const OUTCOME_REVEAL_DELAY = 900;
  const CHIP_TOTAL = 5;

  const elements = {
    gameTitle: document.getElementById("gameTitle"),
    sceneCaption: document.getElementById("sceneCaption"),
    bettingScene: document.getElementById("bettingScene"),
    wheelScene: document.getElementById("wheelScene"),
    wheelCanvas: document.getElementById("wheelCanvas"),
    resultDial: document.getElementById("resultDial"),
    resultKicker: document.getElementById("resultKicker"),
    resultNumber: document.getElementById("resultNumber"),
    resultCopy: document.getElementById("resultCopy"),
    resultScreen: document.getElementById("resultScreen"),
    landingNumber: document.getElementById("landingNumber"),
    outcomeTitle: document.getElementById("outcomeTitle"),
    outcomeImage: document.getElementById("outcomeImage"),
    chipCount: document.getElementById("chipCount"),
    chipRack: document.getElementById("chipRack"),
    spinButton: document.getElementById("spinButton"),
    clearButton: document.getElementById("clearButton"),
    newRoundButton: document.getElementById("newRoundButton"),
    rouletteTable: document.getElementById("rouletteTable"),
    historyStrip: document.getElementById("historyStrip"),
    settingsButton: document.getElementById("settingsButton"),
    settingsDialog: document.getElementById("settingsDialog"),
    closeSettingsButton: document.getElementById("closeSettingsButton"),
    settingsForm: document.getElementById("settingsForm"),
    groomNameInput: document.getElementById("groomNameInput"),
    powerNumbersInput: document.getElementById("powerNumbersInput"),
    powerChanceInput: document.getElementById("powerChanceInput"),
    powerChanceOutput: document.getElementById("powerChanceOutput"),
    powerBoostPreview: document.getElementById("powerBoostPreview"),
    resetSettingsButton: document.getElementById("resetSettingsButton")
  };

  const ctx = elements.wheelCanvas.getContext("2d");
  let config = loadConfig();
  const assetState = {
    chip: false,
    winner: false,
    loser: false
  };
  let canvasSize = 0;
  let wheelRotation = 0;
  let ballAngle = BALL_LANDING_ANGLE;
  let ballWobble = 0;
  let selectedChip = 0;
  let spinFinishTimer = null;

  const state = {
    scene: "betting",
    chipBets: Array(CHIP_TOTAL).fill(null),
    spinning: false,
    revealingOutcome: false,
    spun: false,
    lastResult: null,
    history: []
  };

  init();

  function init() {
    buildTable();
    bindEvents();
    applyConfig();
    preloadAssets();
    clearBets();
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js").catch(() => {});
      });
    }
  }

  function bindEvents() {
    elements.spinButton.addEventListener("click", spin);
    elements.clearButton.addEventListener("click", clearBets);
    elements.newRoundButton.addEventListener("click", clearBets);
    elements.settingsButton.addEventListener("click", () => {
      if (!state.spinning) {
        openSettings();
      }
    });
    elements.closeSettingsButton.addEventListener("click", closeSettings);
    elements.settingsForm.addEventListener("submit", saveSettings);
    elements.resetSettingsButton.addEventListener("click", resetSettings);
    elements.groomNameInput.addEventListener("input", applySettingsFromForm);
    elements.powerNumbersInput.addEventListener("input", applySettingsFromForm);
    elements.powerChanceInput.addEventListener("input", applySettingsFromForm);
  }

  function loadConfig() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!stored || typeof stored !== "object") {
        return { ...DEFAULT_CONFIG };
      }
      return sanitizeConfig(stored);
    } catch (_error) {
      return { ...DEFAULT_CONFIG };
    }
  }

  function sanitizeConfig(nextConfig) {
    const source = nextConfig && typeof nextConfig === "object" ? nextConfig : {};
    const merged = { ...DEFAULT_CONFIG, ...source };
    const powerNumbers = sanitizePowerNumbers(merged.powerNumbers);
    const rawPowerChance = Object.prototype.hasOwnProperty.call(source, "powerChance")
      ? source.powerChance
      : legacyBoostToChance(powerNumbers.length, source.boost);
    const powerChance = sanitizePowerChance(rawPowerChance);
    const groomName = String(merged.groomName || DEFAULT_CONFIG.groomName).trim().slice(0, 32) || DEFAULT_CONFIG.groomName;
    return { groomName, powerNumbers, powerChance };
  }

  function sanitizePowerNumbers(values) {
    const numbers = normalizePowerNumberValues(values);
    const unique = [];
    numbers.forEach((value) => {
      const parsed = parseInt(value, 10);
      if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 36 && !unique.includes(parsed)) {
        unique.push(parsed);
      }
    });

    if (matchesNumberList(unique, OLD_DEFAULT_POWER_NUMBERS)) {
      return DEFAULT_CONFIG.powerNumbers;
    }
    return unique;
  }

  function matchesNumberList(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  function normalizePowerNumberValues(values) {
    if (values === undefined || values === null) {
      return DEFAULT_CONFIG.powerNumbers;
    }
    if (Array.isArray(values)) {
      return values;
    }
    return String(values).match(/\d+/g) || [];
  }

  function sanitizePowerChance(value) {
    const parsed = Math.round(parseFloat(value));
    if (!Number.isFinite(parsed)) {
      return DEFAULT_CONFIG.powerChance;
    }
    return clamp(parsed, 0, MAX_POWER_CHANCE);
  }

  function legacyBoostToChance(powerCount, boost) {
    const parsedBoost = Math.max(0, parseFloat(boost) || DEFAULT_LEGACY_BOOST);
    return Math.round(calculatePowerChance(powerCount, parsedBoost));
  }

  function saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (_error) {}
  }

  function applyConfig() {
    const initials = getInitials(config.groomName);
    document.documentElement.style.setProperty("--chip-face-image", `url("${ASSETS.chip}")`);
    document.title = "Kebab Roulette";
    elements.gameTitle.textContent = "Kebab Roulette";
    document.querySelectorAll(".chip-initials").forEach((node) => {
      node.textContent = initials;
    });
    document.querySelectorAll(".chip").forEach((node) => {
      node.classList.toggle("has-photo", assetState.chip);
    });
    updatePowerReadouts();
    drawWheel();
  }

  function preloadAssets() {
    Object.entries(ASSETS).forEach(([key, src]) => {
      testImage(src).then((loaded) => {
        assetState[key] = loaded;
        applyConfig();
      });
    });
  }

  function testImage(src) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = `${src}?asset=${Date.now()}`;
    });
  }

  function getInitials(name) {
    const parts = String(name || "CR").trim().split(/\s+/).filter(Boolean);
    const first = parts[0] ? parts[0][0] : "C";
    const second = parts[1] ? parts[1][0] : "R";
    return `${first}${second}`.toUpperCase();
  }

  function buildTable() {
    elements.rouletteTable.innerHTML = "";

    const zero = createBetCell("0", "number", 0, "green");
    zero.style.gridColumn = "1";
    zero.style.gridRow = "1 / span 3";
    elements.rouletteTable.appendChild(zero);

    for (let number = 1; number <= 36; number += 1) {
      const column = Math.ceil(number / 3) + 1;
      const row = 4 - (number % 3 || 3);
      const cell = createBetCell(String(number), "number", number, getNumberColor(number));
      cell.style.gridColumn = String(column);
      cell.style.gridRow = String(row);
      elements.rouletteTable.appendChild(cell);
    }

  }

  function createBetCell(label, type, value, colorClass) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `bet-cell ${colorClass}`;
    button.dataset.betType = type;
    button.dataset.betValue = String(value);
    button.setAttribute("aria-label", `Bet ${label}`);
    button.textContent = label;

    const chips = document.createElement("span");
    chips.className = "placed-chips";
    button.appendChild(chips);
    button.addEventListener("click", () => placeNextChip(type, value));
    return button;
  }

  function buildChips() {
    elements.chipRack.innerHTML = "";
    for (let index = 0; index < CHIP_TOTAL; index += 1) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.chipIndex = String(index);
      chip.setAttribute("aria-label", `Chip ${index + 1}`);
      chip.innerHTML = `<span class="chip-face"></span><span class="chip-initials">${getInitials(config.groomName)}</span>`;
      chip.addEventListener("click", () => selectChip(index));
      elements.chipRack.appendChild(chip);
    }
  }

  function selectChip(index) {
    if (state.spinning || state.chipBets[index]) {
      return;
    }
    selectedChip = index;
    render();
  }

  function placeNextChip(type, value) {
    if (state.spinning || state.spun) {
      return;
    }

    const betValue = String(value);
    const existingBetIndex = state.chipBets.findIndex((bet) => bet && bet.type === type && bet.value === betValue);
    if (existingBetIndex !== -1) {
      state.chipBets[existingBetIndex] = null;
      selectedChip = existingBetIndex;
      render();
      return;
    }

    const chipIndex = state.chipBets[selectedChip] ? firstAvailableChip() : selectedChip;
    if (chipIndex === -1) {
      return;
    }

    state.chipBets[chipIndex] = { type, value: betValue };
    selectedChip = firstAvailableChip();
    render();
  }

  function firstAvailableChip() {
    return state.chipBets.findIndex((bet) => !bet);
  }

  function clearBets() {
    window.clearTimeout(spinFinishTimer);
    spinFinishTimer = null;
    state.chipBets = Array(CHIP_TOTAL).fill(null);
    state.spinning = false;
    state.revealingOutcome = false;
    state.spun = false;
    state.lastResult = null;
    ballAngle = BALL_LANDING_ANGLE;
    ballWobble = 0;
    selectedChip = 0;
    showScene("betting");
    hideOutcome();
    elements.resultKicker.textContent = "Open";
    elements.resultNumber.textContent = "--";
    elements.resultCopy.textContent = "Order up";
    render();
  }

  function spin() {
    const placedCount = state.chipBets.filter(Boolean).length;
    if (state.spinning || placedCount === 0) {
      return;
    }

    const winner = pickWeightedNumber();
    showScene("wheel");
    animateWheel(winner);
  }

  function pickWeightedNumber() {
    const powerSet = new Set(config.powerNumbers);
    const powerWeight = calculatePowerWeight(config.powerNumbers.length, config.powerChance);
    const weights = [];
    let total = 0;

    for (let number = 0; number <= 36; number += 1) {
      const weight = powerSet.has(number) ? powerWeight : 1;
      total += weight;
      weights.push({ number, total });
    }

    if (total <= 0) {
      return WHEEL_ORDER[Math.floor(randomUnit() * WHEEL_ORDER.length)];
    }

    const roll = randomUnit() * total;
    return weights.find((entry) => roll < entry.total).number;
  }

  function randomUnit() {
    if (window.crypto && window.crypto.getRandomValues) {
      const array = new Uint32Array(1);
      window.crypto.getRandomValues(array);
      return array[0] / 4294967296;
    }
    return Math.random();
  }

  function calculatePowerWeight(powerCount, powerChance) {
    const cappedPowerCount = clamp(powerCount, 0, WHEEL_ORDER.length);
    const regularCount = WHEEL_ORDER.length - cappedPowerCount;
    const targetChance = clamp(powerChance, 0, MAX_POWER_CHANCE) / 100;

    if (cappedPowerCount === 0) {
      return 0;
    }
    if (regularCount === 0) {
      return 1;
    }
    if (targetChance <= 0) {
      return 0;
    }

    return (targetChance * regularCount) / (cappedPowerCount * (1 - targetChance));
  }

  function calculatePowerChance(powerCount, powerWeight) {
    const cappedPowerCount = clamp(powerCount, 0, WHEEL_ORDER.length);
    const regularCount = WHEEL_ORDER.length - cappedPowerCount;
    const weight = Math.max(0, parseFloat(powerWeight) || 0);

    if (cappedPowerCount === 0) {
      return 0;
    }
    if (regularCount === 0) {
      return 100;
    }

    const total = regularCount + cappedPowerCount * weight;
    return total > 0 ? (cappedPowerCount * weight * 100) / total : 0;
  }

  function animateWheel(winner) {
    state.spinning = true;
    state.revealingOutcome = false;
    state.spun = false;
    hideOutcome();
    elements.newRoundButton.hidden = true;
    elements.resultKicker.textContent = "";
    elements.resultNumber.textContent = "";
    elements.resultCopy.textContent = "";
    render();

    const winnerIndex = WHEEL_ORDER.indexOf(winner);
    const slice = TWO_PI / WHEEL_ORDER.length;
    const offsetWithinPocket = (randomUnit() - 0.5) * slice * 0.54;
    const start = wheelRotation;
    let target = BALL_LANDING_ANGLE + offsetWithinPocket - WHEEL_ZERO_ANGLE - (winnerIndex * slice + slice / 2);
    while (target < start + TWO_PI * 5.5) {
      target += TWO_PI;
    }

    const ballStart = ballAngle;
    const ballLoops = 4 + Math.floor(randomUnit() * 2);
    let ballTarget = BALL_LANDING_ANGLE - TWO_PI * ballLoops;
    while (ballTarget > ballStart - TWO_PI * 3.75) {
      ballTarget -= TWO_PI;
    }

    const duration = 4200 + randomUnit() * 650;
    const startedAt = performance.now();
    window.clearTimeout(spinFinishTimer);
    spinFinishTimer = window.setTimeout(() => {
      if (!state.spinning) {
        return;
      }
      wheelRotation = normalizeAngle(target);
      ballAngle = BALL_LANDING_ANGLE;
      ballWobble = 0;
      finishSpin(winner);
    }, duration + 300);

    function frame(now) {
      if (!state.spinning) {
        return;
      }
      const elapsed = now - startedAt;
      const t = clamp(elapsed / duration, 0, 1);
      const wheelEased = easeOutCubic(t);
      const ballEased = easeOutQuart(t);
      const settle = clamp((t - 0.58) / 0.42, 0, 1);
      wheelRotation = start + (target - start) * wheelEased;
      ballAngle = ballStart + (ballTarget - ballStart) * ballEased;
      ballWobble = Math.sin(t * Math.PI * 26) * (1 - t) * settle * 0.08;
      drawWheel();

      if (t < 1) {
        requestAnimationFrame(frame);
        return;
      }

      wheelRotation = normalizeAngle(target);
      ballAngle = BALL_LANDING_ANGLE;
      ballWobble = 0;
      window.clearTimeout(spinFinishTimer);
      spinFinishTimer = null;
      finishSpin(winner);
    }

    requestAnimationFrame(frame);
  }

  function finishSpin(winner) {
    const winningChips = state.chipBets
      .map((bet, index) => ({ bet, index }))
      .filter((entry) => entry.bet && betWins(entry.bet, winner));
    const won = winningChips.length > 0;

    state.spinning = false;
    state.revealingOutcome = true;
    state.spun = true;
    state.lastResult = winner;
    state.history = [won ? "Dubber" : "Loser", ...state.history].slice(0, 8);
    elements.resultKicker.textContent = "Landed";
    elements.resultNumber.textContent = String(winner);
    elements.resultCopy.textContent = getNumberColor(winner);
    render();
    drawWheel();
    window.clearTimeout(spinFinishTimer);
    spinFinishTimer = window.setTimeout(() => {
      if (!state.revealingOutcome || state.lastResult !== winner) {
        return;
      }

      spinFinishTimer = null;
      state.revealingOutcome = false;
      showOutcome(won, winner);
      render();
      drawWheel();
    }, OUTCOME_REVEAL_DELAY);
  }

  function betWins(bet, winner) {
    if (bet.type === "number") {
      return String(winner) === String(bet.value);
    }
    if (winner === 0) {
      return false;
    }
    if (bet.type === "color") {
      return bet.value === (RED_NUMBERS.has(winner) ? "red" : "black");
    }
    if (bet.type === "parity") {
      return bet.value === (winner % 2 === 0 ? "even" : "odd");
    }
    if (bet.type === "range") {
      return bet.value === "low" ? winner <= 18 : winner >= 19;
    }
    if (bet.type === "dozen") {
      const dozen = Math.ceil(winner / 12);
      return String(dozen) === String(bet.value);
    }
    if (bet.type === "column") {
      if (bet.value === "top") {
        return winner % 3 === 0;
      }
      if (bet.value === "middle") {
        return winner % 3 === 2;
      }
      return winner % 3 === 1;
    }
    return false;
  }

  function render() {
    if (!elements.chipRack.children.length) {
      buildChips();
    }

    const placedCount = state.chipBets.filter(Boolean).length;
    const availableCount = CHIP_TOTAL - placedCount;
    elements.chipCount.textContent = String(availableCount);
    const controlsLocked = state.spinning || state.revealingOutcome;
    elements.spinButton.disabled = controlsLocked || placedCount === 0 || state.spun;
    elements.clearButton.disabled = controlsLocked || placedCount === 0;
    elements.newRoundButton.hidden = !state.spun || state.revealingOutcome;
    elements.settingsButton.disabled = controlsLocked;

    document.querySelectorAll(".chip").forEach((chip) => {
      const index = parseInt(chip.dataset.chipIndex || "-1", 10);
      if (index >= 0) {
        chip.disabled = controlsLocked || state.spun || Boolean(state.chipBets[index]);
        chip.classList.toggle("selected", index === selectedChip && !chip.disabled);
      }
      chip.classList.toggle("has-photo", assetState.chip);
      const initials = chip.querySelector(".chip-initials");
      if (initials) {
        initials.textContent = getInitials(config.groomName);
      }
    });

    renderPlacedChips();
    renderHistory();
    markWinningCells();
  }

  function renderPlacedChips() {
    document.querySelectorAll(".placed-chips").forEach((slot) => {
      slot.innerHTML = "";
    });

    state.chipBets.forEach((bet, index) => {
      if (!bet) {
        return;
      }
      const selector = `.bet-cell[data-bet-type="${bet.type}"][data-bet-value="${bet.value}"] .placed-chips`;
      const slot = elements.rouletteTable.querySelector(selector);
      if (!slot) {
        return;
      }
      const chip = document.createElement("span");
      chip.className = `placed-chip${assetState.chip ? "" : " no-photo"}`;
      chip.setAttribute("aria-hidden", "true");
      slot.appendChild(chip);
    });
  }

  function renderHistory() {
    elements.historyStrip.innerHTML = "";
    state.history.forEach((number) => {
      const pill = document.createElement("span");
      const isDubber = number === "Dubber";
      pill.className = `history-pill outcome ${isDubber ? "winner" : "loser"}`;
      pill.textContent = isDubber ? "W" : "L";
      elements.historyStrip.appendChild(pill);
    });
  }

  function markWinningCells() {
    document.querySelectorAll(".bet-cell").forEach((cell) => {
      const fakeBet = { type: cell.dataset.betType, value: cell.dataset.betValue };
      cell.classList.toggle("winning", state.spun && betWins(fakeBet, state.lastResult));
    });
  }

  function getNumberColor(number) {
    if (number === 0) {
      return "green";
    }
    return RED_NUMBERS.has(number) ? "red" : "black";
  }

  function resizeCanvas() {
    const rect = elements.wheelCanvas.getBoundingClientRect();
    const nextSize = Math.round(Math.min(rect.width || 360, rect.height || rect.width || 360));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const backingSize = Math.max(320, nextSize) * dpr;

    if (canvasSize !== backingSize) {
      canvasSize = backingSize;
      elements.wheelCanvas.width = backingSize;
      elements.wheelCanvas.height = backingSize;
      drawWheel();
    }
  }

  function showScene(scene) {
    state.scene = scene;
    const isWheel = scene === "wheel";
    elements.bettingScene.hidden = isWheel;
    elements.wheelScene.hidden = !isWheel;
    elements.bettingScene.classList.toggle("is-active", !isWheel);
    elements.wheelScene.classList.toggle("is-active", isWheel);
    elements.sceneCaption.textContent = "";
    elements.sceneCaption.hidden = true;

    if (isWheel) {
      requestAnimationFrame(() => {
        resizeCanvas();
        drawWheel();
      });
    }

    window.scrollTo(0, 0);
  }

  function showOutcome(won, winner) {
    const outcome = won ? "Dubber" : "Loser";
    const image = won ? ASSETS.winner : ASSETS.loser;
    elements.resultKicker.textContent = outcome;
    elements.resultNumber.textContent = "";
    elements.resultCopy.textContent = "";
    elements.resultDial.classList.add("outcome-mode");
    elements.wheelScene.classList.add("has-result");
    elements.resultScreen.hidden = false;
    elements.landingNumber.textContent = String(winner);
    elements.landingNumber.classList.remove("is-zooming");
    void elements.landingNumber.offsetWidth;
    elements.landingNumber.classList.add("is-zooming");
    elements.outcomeTitle.textContent = outcome;
    elements.outcomeImage.hidden = false;
    elements.outcomeImage.classList.remove("is-visible");
    elements.resultScreen.classList.remove("no-image");
    elements.outcomeImage.onload = () => {
      if (!elements.resultScreen.hidden) {
        elements.outcomeImage.classList.add("is-visible");
      }
    };
    elements.outcomeImage.onerror = () => {
      if (!elements.resultScreen.hidden) {
        elements.resultScreen.classList.add("no-image");
      }
      elements.outcomeImage.hidden = true;
      elements.outcomeImage.removeAttribute("src");
      elements.outcomeImage.alt = "";
    };
    elements.outcomeImage.src = image;
    elements.outcomeImage.alt = outcome;
    if (elements.outcomeImage.complete && elements.outcomeImage.naturalWidth > 0) {
      elements.outcomeImage.classList.add("is-visible");
    }
  }

  function hideOutcome() {
    elements.resultDial.classList.remove("outcome-mode");
    elements.wheelScene.classList.remove("has-result");
    elements.resultScreen.hidden = true;
    elements.resultScreen.classList.remove("no-image");
    elements.landingNumber.classList.remove("is-zooming");
    elements.outcomeImage.hidden = true;
    elements.outcomeImage.onload = null;
    elements.outcomeImage.onerror = null;
    elements.outcomeImage.classList.remove("is-visible");
    elements.outcomeImage.removeAttribute("src");
    elements.outcomeImage.alt = "";
  }

  function drawWheel() {
    if (!canvasSize) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = canvasSize / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const center = size / 2;
    const outerRadius = size * 0.485;
    const pocketRadius = size * 0.407;
    const innerRadius = size * 0.185;
    const slice = TWO_PI / WHEEL_ORDER.length;

    ctx.save();
    ctx.translate(center, center);
    ctx.beginPath();
    ctx.arc(0, 0, outerRadius, 0, TWO_PI);
    ctx.fillStyle = "#40110e";
    ctx.fill();
    ctx.strokeStyle = "#ffd24a";
    ctx.lineWidth = size * 0.018;
    ctx.stroke();

    WHEEL_ORDER.forEach((number, index) => {
      const startAngle = wheelRotation + index * slice + WHEEL_ZERO_ANGLE;
      const endAngle = startAngle + slice;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, outerRadius * 0.96, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = number === 0 ? "#22a96b" : RED_NUMBERS.has(number) ? "#d71f32" : "#1a1411";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 210, 74, 0.54)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.rotate(startAngle + slice / 2);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff4c7";
      ctx.font = `900 ${Math.max(10, size * 0.031)}px system-ui, sans-serif`;
      ctx.fillText(String(number), outerRadius * 0.88, 0);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(0, 0, pocketRadius * 0.93, 0, TWO_PI);
    ctx.strokeStyle = "rgba(255, 79, 216, 0.78)";
    ctx.lineWidth = size * 0.006;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, innerRadius, 0, TWO_PI);
    ctx.fillStyle = "#fff3cf";
    ctx.fill();
    ctx.strokeStyle = "#ff4fd8";
    ctx.lineWidth = size * 0.015;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, innerRadius * 0.52, 0, TWO_PI);
    ctx.fillStyle = "#b91424";
    ctx.fill();

    const ballDrawAngle = ballAngle + ballWobble;
    const ballDistance = outerRadius * 0.73;
    ctx.beginPath();
    ctx.arc(Math.cos(ballDrawAngle) * ballDistance, Math.sin(ballDrawAngle) * ballDistance, size * 0.022, 0, TWO_PI);
    ctx.fillStyle = "#fffbe8";
    ctx.fill();
    ctx.strokeStyle = "rgba(23, 16, 12, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function openSettings() {
    syncSettingsForm();

    if (!elements.settingsDialog.open && typeof elements.settingsDialog.showModal === "function") {
      elements.settingsDialog.showModal();
    } else if (!elements.settingsDialog.open) {
      elements.settingsDialog.setAttribute("open", "");
    }
  }

  function closeSettings() {
    applySettingsFromForm();
    syncSettingsForm();
    elements.settingsDialog.close();
  }

  function saveSettings(event) {
    event.preventDefault();
    applySettingsFromForm();
    syncSettingsForm();
    elements.settingsDialog.close();
  }

  function applySettingsFromForm() {
    config = sanitizeConfig({
      groomName: elements.groomNameInput.value,
      powerNumbers: elements.powerNumbersInput.value,
      powerChance: elements.powerChanceInput.value
    });
    saveConfig();
    applyConfig();
    render();
  }

  function resetSettings() {
    config = { ...DEFAULT_CONFIG };
    saveConfig();
    applyConfig();
    syncSettingsForm();
    render();
  }

  function syncSettingsForm() {
    elements.groomNameInput.value = config.groomName;
    elements.powerNumbersInput.value = config.powerNumbers.join(", ");
    elements.powerChanceInput.value = String(config.powerChance);
    updatePowerReadouts();
  }

  function updatePowerReadouts() {
    const powerWeight = calculatePowerWeight(config.powerNumbers.length, config.powerChance);

    elements.powerChanceOutput.textContent = `${config.powerChance}%`;
    elements.powerBoostPreview.textContent = `x${formatBoost(powerWeight)}`;
  }

  function formatBoost(value) {
    if (value >= 100) {
      return String(Math.round(value));
    }
    if (value >= 10) {
      return value.toFixed(1).replace(/\.0$/, "");
    }
    return value.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
  }

  function easeOutQuart(value) {
    return 1 - Math.pow(1 - value, 4);
  }

  function normalizeAngle(value) {
    return ((value % TWO_PI) + TWO_PI) % TWO_PI;
  }
})();
