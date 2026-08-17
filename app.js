(function () {
  "use strict";

  const STORAGE_KEY = "7flip_scoreboard_state";
  const TTL_MS = 60 * 60 * 1000; // 1 hour
  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 8;
  const SCORE_LIMIT = 200;

  const COLORS = [
    "#e63946", "#2a9d8f", "#ffb703", "#457b9d",
    "#8338ec", "#fb5607", "#06d6a0", "#f72585",
  ];

  let storageAvailable = true;
  let memoryState = null; // fallback when localStorage is unavailable

  const CONFETTI_COLORS = ["#ff6f59", "#ff3d81", "#ffb703", "#7b5cff", "#12b76a", "#2a9d8f"];

  function triggerConfetti() {
    const canvas = document.getElementById("confettiCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pieceCount = 160;
    const pieces = Array.from({ length: pieceCount }, () => ({
      x: Math.random() * window.innerWidth,
      y: -20 - Math.random() * window.innerHeight * 0.5,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      vy: 2 + Math.random() * 3,
      vx: (Math.random() - 0.5) * 2,
      sway: Math.random() * Math.PI * 2,
    }));

    const durationMs = 3200;
    const startTime = performance.now();

    function frame(now) {
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      pieces.forEach((p) => {
        p.y += p.vy;
        p.x += p.vx + Math.sin(p.sway + elapsed / 300) * 0.6;
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = elapsed > durationMs - 500 ? Math.max(0, (durationMs - elapsed) / 500) : 1;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });

      if (elapsed < durationMs) {
        requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    }

    requestAnimationFrame(frame);
  }

  function defaultState() {
    return {
      savedAt: Date.now(),
      players: [],
      rounds: [],
      status: "in-progress",
      winnerIds: [],
    };
  }

  function loadState() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      storageAvailable = false;
      showStorageWarning();
      return defaultState();
    }

    if (!raw) return defaultState();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return defaultState();
    }

    if (!parsed || typeof parsed.savedAt !== "number") return defaultState();

    if (Date.now() - parsed.savedAt > TTL_MS) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
      return defaultState();
    }

    return {
      savedAt: parsed.savedAt,
      players: Array.isArray(parsed.players) ? parsed.players : [],
      rounds: Array.isArray(parsed.rounds) ? parsed.rounds : [],
      status: parsed.status === "ended" ? "ended" : "in-progress",
      winnerIds: Array.isArray(parsed.winnerIds) ? parsed.winnerIds : [],
    };
  }

  function saveState() {
    state.savedAt = Date.now();
    if (!storageAvailable) {
      memoryState = state;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      storageAvailable = false;
      memoryState = state;
      showStorageWarning();
    }
  }

  function showStorageWarning() {
    const el = document.getElementById("storageWarning");
    if (el) el.classList.remove("hidden");
  }

  let state = loadState();
  let selectedColor = COLORS[0];
  let prevTotals = {};

  function getTotal(playerId) {
    return state.rounds.reduce((sum, round) => sum + (round[playerId] || 0), 0);
  }

  function determineWinners() {
    if (state.players.length === 0) return [];
    let max = -Infinity;
    for (const p of state.players) {
      const t = getTotal(p.id);
      if (t > max) max = t;
    }
    return state.players.filter((p) => getTotal(p.id) === max).map((p) => p.id);
  }

  function checkGameEnd() {
    const anyOver = state.players.some((p) => getTotal(p.id) > SCORE_LIMIT);
    if (anyOver) {
      state.status = "ended";
      state.winnerIds = determineWinners();
    }
  }

  function addPlayer(name, color) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (state.players.length >= MAX_PLAYERS) return;
    state.players.push({
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: trimmed,
      color: color,
    });
    saveState();
    render();
  }

  function removePlayer(id) {
    if (state.rounds.length > 0) return;
    state.players = state.players.filter((p) => p.id !== id);
    saveState();
    render();
  }

  function submitRound(scoresByPlayerId) {
    const errorEl = document.getElementById("scoreEntryError");
    errorEl.classList.add("hidden");

    if (state.players.length < MIN_PLAYERS || state.players.length > MAX_PLAYERS) {
      errorEl.textContent = `Need between ${MIN_PLAYERS} and ${MAX_PLAYERS} players to play a round.`;
      errorEl.classList.remove("hidden");
      return;
    }

    const round = {};
    for (const p of state.players) {
      const raw = scoresByPlayerId[p.id];
      const n = Number(raw);
      if (raw === "" || raw === undefined || !Number.isInteger(n) || n < 0) {
        errorEl.textContent = `Enter a whole number ≥ 0 for every player.`;
        errorEl.classList.remove("hidden");
        return;
      }
      round[p.id] = n;
    }

    const wasEnded = state.status === "ended";
    state.rounds.push(round);
    checkGameEnd();
    saveState();
    render();
    if (!wasEnded && state.status === "ended") triggerConfetti();
  }

  function resetGame(keepPlayers) {
    state.rounds = [];
    state.status = "in-progress";
    state.winnerIds = [];
    if (!keepPlayers) state.players = [];
    saveState();
    render();
  }

  // ---------- Rendering ----------

  function renderColorPicker() {
    const container = document.getElementById("colorPicker");
    container.innerHTML = "";
    COLORS.forEach((color) => {
      const swatch = document.createElement("div");
      swatch.className = "color-swatch" + (color === selectedColor ? " selected" : "");
      swatch.style.background = color;
      swatch.title = color;
      swatch.addEventListener("click", () => {
        selectedColor = color;
        renderColorPicker();
      });
      container.appendChild(swatch);
    });
  }

  function renderLiveTotals() {
    const panel = document.getElementById("liveTotalsPanel");
    const container = document.getElementById("liveTotals");

    if (state.players.length === 0) {
      panel.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");

    const ranked = [...state.players].sort((a, b) => getTotal(b.id) - getTotal(a.id));
    const topTotal = getTotal(ranked[0].id);

    container.innerHTML = "";
    ranked.forEach((p) => {
      const total = getTotal(p.id);
      const chip = document.createElement("div");
      chip.className = "live-total-chip" + (topTotal > 0 && total === topTotal ? " leader" : "");

      const dot = document.createElement("span");
      dot.className = "color-dot";
      dot.style.background = p.color;

      const name = document.createElement("span");
      name.className = "live-total-name";
      name.textContent = p.name;

      const value = document.createElement("span");
      value.className = "live-total-value" + (total > SCORE_LIMIT ? " over-limit" : "");
      if (prevTotals[p.id] !== undefined && prevTotals[p.id] !== total) {
        value.classList.add("pulse");
      }
      value.textContent = total;

      chip.appendChild(dot);
      chip.appendChild(name);
      chip.appendChild(value);
      container.appendChild(chip);
    });

    prevTotals = Object.fromEntries(state.players.map((p) => [p.id, getTotal(p.id)]));
  }

  function renderStatusBanner() {
    const el = document.getElementById("statusBanner");
    el.classList.remove("ended");
    if (state.status === "ended") {
      const names = state.winnerIds
        .map((id) => state.players.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => p.name);
      const label = names.length > 1 ? `${names.join(" & ")} tie for the win!` : `🏆 ${names[0]} wins!`;
      el.textContent = label;
      el.classList.add("ended");
    } else if (state.players.length < MIN_PLAYERS) {
      el.textContent = `In progress — add ${MIN_PLAYERS - state.players.length} more player(s) to start.`;
    } else {
      el.textContent = `In progress — round ${state.rounds.length + 1}.`;
    }
  }

  function renderPlayerList() {
    const list = document.getElementById("playerList");
    list.innerHTML = "";
    const locked = state.rounds.length > 0;
    state.players.forEach((p) => {
      const li = document.createElement("li");

      const dot = document.createElement("span");
      dot.className = "color-dot";
      dot.style.background = p.color;

      const name = document.createElement("span");
      name.className = "player-name";
      name.textContent = `${p.name} — ${getTotal(p.id)} pts`;

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "×";
      removeBtn.disabled = locked;
      removeBtn.title = locked ? "Can't remove players once a round has been played — start a new game" : "Remove player";
      removeBtn.addEventListener("click", () => removePlayer(p.id));

      li.appendChild(dot);
      li.appendChild(name);
      li.appendChild(removeBtn);
      list.appendChild(li);
    });

    document.getElementById("addPlayerBtn").disabled = state.players.length >= MAX_PLAYERS;
    const hint = document.getElementById("playerHint");
    if (state.players.length >= MAX_PLAYERS) {
      hint.textContent = `Maximum of ${MAX_PLAYERS} players reached.`;
    } else if (state.players.length < MIN_PLAYERS) {
      hint.textContent = `Add at least ${MIN_PLAYERS} players to start playing.`;
    } else {
      hint.textContent = "";
    }
  }

  function renderScoreEntry() {
    const panel = document.getElementById("scoreEntryPanel");
    const canPlay = state.status === "in-progress" &&
      state.players.length >= MIN_PLAYERS &&
      state.players.length <= MAX_PLAYERS;

    panel.classList.toggle("hidden", !canPlay);
    if (!canPlay) return;

    document.getElementById("roundNumber").textContent = state.rounds.length + 1;

    const form = document.getElementById("scoreEntryForm");
    form.innerHTML = "";
    state.players.forEach((p) => {
      const row = document.createElement("div");
      row.className = "score-row";

      const label = document.createElement("label");
      const dot = document.createElement("span");
      dot.className = "color-dot";
      dot.style.background = p.color;
      const nameSpan = document.createElement("span");
      nameSpan.textContent = p.name;
      label.appendChild(dot);
      label.appendChild(nameSpan);

      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "1";
      input.dataset.playerId = p.id;
      input.placeholder = "0";

      row.appendChild(label);
      row.appendChild(input);
      form.appendChild(row);
    });

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.textContent = "Submit Round";
    form.appendChild(submitBtn);
  }

  function renderGameOver() {
    const panel = document.getElementById("gameOverPanel");
    panel.classList.toggle("hidden", state.status !== "ended");
    if (state.status !== "ended") return;

    const standings = document.getElementById("standings");
    standings.innerHTML = "";
    const ranked = [...state.players].sort((a, b) => getTotal(b.id) - getTotal(a.id));
    ranked.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "standing-row" + (state.winnerIds.includes(p.id) ? " winner" : "");

      const rank = document.createElement("span");
      rank.className = "standing-rank";
      rank.textContent = `#${i + 1}`;

      const dot = document.createElement("span");
      dot.className = "color-dot";
      dot.style.background = p.color;

      const name = document.createElement("span");
      name.style.flex = "1";
      name.textContent = p.name;

      const total = document.createElement("span");
      total.textContent = `${getTotal(p.id)} pts`;

      row.appendChild(rank);
      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(total);
      standings.appendChild(row);
    });
  }

  function renderHistoryTable() {
    const table = document.getElementById("historyTable");
    table.innerHTML = "";
    const panel = document.getElementById("historyPanel");

    if (state.players.length === 0) {
      panel.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.appendChild(document.createElement("th"));
    state.players.forEach((p) => {
      const th = document.createElement("th");
      th.textContent = p.name;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    state.rounds.forEach((round, idx) => {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.textContent = `Round ${idx + 1}`;
      tr.appendChild(th);
      state.players.forEach((p) => {
        const td = document.createElement("td");
        td.textContent = round[p.id] !== undefined ? round[p.id] : "";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    const tfoot = document.createElement("tfoot");
    const totalsRow = document.createElement("tr");
    totalsRow.className = "totals-row";
    const totalsLabel = document.createElement("td");
    totalsLabel.textContent = "Total";
    totalsRow.appendChild(totalsLabel);
    state.players.forEach((p) => {
      const td = document.createElement("td");
      const total = getTotal(p.id);
      td.textContent = total;
      if (total > SCORE_LIMIT) td.classList.add("over-limit");
      totalsRow.appendChild(td);
    });
    tfoot.appendChild(totalsRow);
    table.appendChild(tfoot);
  }

  function render() {
    renderStatusBanner();
    renderLiveTotals();
    renderPlayerList();
    renderScoreEntry();
    renderGameOver();
    renderHistoryTable();
  }

  // ---------- Event wiring ----------

  document.getElementById("addPlayerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("playerNameInput");
    addPlayer(input.value, selectedColor);
    input.value = "";
  });

  document.getElementById("scoreEntryForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const inputs = e.target.querySelectorAll("input[data-player-id]");
    const scores = {};
    inputs.forEach((input) => {
      scores[input.dataset.playerId] = input.value;
    });
    submitRound(scores);
  });

  document.getElementById("newGameKeepBtn").addEventListener("click", () => resetGame(true));
  document.getElementById("newGameClearBtn").addEventListener("click", () => resetGame(false));

  renderColorPicker();
  render();
})();
