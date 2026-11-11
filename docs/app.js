const COLORS = {
  W: "#1b5e20", EP: "#0277bd", EF: "#e65100", ENF: "#b71c1c",
  score: "#5e35b1", grid: "rgba(70, 91, 81, .14)", ink: "#14251e"
};

const SCORE = { W: 4, EP: 3, EF: -2, ENF: -5 };
const charts = {};
let payload = null;
let activeEvents = [];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const key = (value) => String(value ?? "").trim().toLocaleLowerCase("es");
const pct = (value, total) => total ? value / total * 100 : 0;
const fmt = (value, digits = 1) => Number(value || 0).toLocaleString("es-CL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (value) => `${Number(value) >= 0 ? "+" : ""}${fmt(value)}`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

function isParticipant(event, player) {
  const playerKey = key(player);
  return event.participants.some(name => key(name) === playerKey);
}

function metrics(events, player) {
  const playerKey = key(player);
  const points = events.filter(event => isParticipant(event, player)).length;
  const W = events.filter(event => key(event.player) === playerKey && event.eventType === "Winner").length;
  const EF = events.filter(event => key(event.player) === playerKey && event.eventType === "Error forzado").length;
  const ENF = events.filter(event => key(event.player) === playerKey && event.eventType === "Error no forzado").length;
  const EP = events.filter(event => key(event.forcedBy) === playerKey && event.eventType === "Error forzado").length;
  const score = SCORE.W * W + SCORE.EP * EP + SCORE.EF * EF + SCORE.ENF * ENF;
  return { points, W, EP, EF, ENF, score, score100: pct(score, points), pctW: pct(W, points), pctEP: pct(EP, points), pctEF: pct(EF, points), pctENF: pct(ENF, points) };
}

const MATCH_COLORS = ["#0a6b46", "#5e35b1", "#0277bd", "#e65100"];
const RIVAL_REVES = "Reves Rival";
const RIVAL_DRIVE = "Drive Rival";

const normalizedKey = (value) => key(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const firstValue = (events, field) => events.map(event => event[field]).find(value => String(value || "").trim()) || "";

function isAmericano(events) {
  return events.some(event => normalizedKey(event.matchType).includes("americano"));
}

function buildMatchContext(events) {
  const americano = isAmericano(events);
  const reves1 = firstValue(events, "reves1");
  const drive1 = firstValue(events, "drive1");
  const reves2 = firstValue(events, "reves2");
  const drive2 = firstValue(events, "drive2");
  const positionMap = new Map();
  const team1Keys = new Set();

  events.forEach(event => {
    [event.reves1, event.drive1].forEach(name => {
      if (normalizedKey(name)) team1Keys.add(normalizedKey(name));
    });
    if (normalizedKey(event.reves2)) positionMap.set(normalizedKey(event.reves2), RIVAL_REVES);
    if (normalizedKey(event.drive2) && !positionMap.has(normalizedKey(event.drive2))) positionMap.set(normalizedKey(event.drive2), RIVAL_DRIVE);
  });

  positionMap.set(normalizedKey(RIVAL_REVES), RIVAL_REVES);
  positionMap.set(normalizedKey(RIVAL_DRIVE), RIVAL_DRIVE);

  if (americano) {
    const participantOrder = [];
    const seen = new Set();
    events.forEach(event => {
      [event.player, event.forcedBy, event.server].forEach(name => {
        const nameKey = normalizedKey(name);
        if (nameKey && !seen.has(nameKey)) {
          participantOrder.push(nameKey);
          seen.add(nameKey);
        }
      });
    });

    let revesCount = [...positionMap.values()].filter(value => value === RIVAL_REVES).length;
    let driveCount = [...positionMap.values()].filter(value => value === RIVAL_DRIVE).length;
    participantOrder
      .filter(nameKey => !team1Keys.has(nameKey) && !positionMap.has(nameKey))
      .forEach(nameKey => {
        if (revesCount <= driveCount) {
          positionMap.set(nameKey, RIVAL_REVES);
          revesCount++;
        } else {
          positionMap.set(nameKey, RIVAL_DRIVE);
          driveCount++;
        }
      });
  }

  let players;
  if (americano) {
    players = [
      { name: reves1, position: "Revés", team: "Equipo 1" },
      { name: drive1, position: "Drive", team: "Equipo 1" },
      { name: RIVAL_REVES, position: "Revés", team: "Equipo 2" },
      { name: RIVAL_DRIVE, position: "Drive", team: "Equipo 2" }
    ];
  } else {
    players = [
      { name: reves1, position: "Revés", team: "Equipo 1" },
      { name: drive1, position: "Drive", team: "Equipo 1" },
      { name: reves2, position: "Revés", team: "Equipo 2" },
      { name: drive2, position: "Drive", team: "Equipo 2" }
    ];
  }

  const uniquePlayers = [];
  const playerKeys = new Set();
  players.forEach(player => {
    const playerKey = normalizedKey(player.name);
    if (playerKey && !playerKeys.has(playerKey)) {
      uniquePlayers.push(player);
      playerKeys.add(playerKey);
    }
  });

  return { americano, positionMap, players: uniquePlayers };
}

function matchIdentity(event, name, context) {
  const nameKey = normalizedKey(name);
  if (!nameKey) return "";
  if (!context.americano) return String(name).trim();

  if (nameKey === normalizedKey(event.reves1) || nameKey === normalizedKey(event.drive1)) {
    return String(name).trim();
  }
  if (nameKey === normalizedKey(event.reves2)) return RIVAL_REVES;
  if (nameKey === normalizedKey(event.drive2)) return RIVAL_DRIVE;
  return context.positionMap.get(nameKey) || String(name).trim();
}

function matchMetrics(events, player, context) {
  const playerKey = normalizedKey(player);
  let W = 0, EP = 0, EF = 0, ENF = 0, services = 0, firstServices = 0;
  events.forEach(event => {
    const eventPlayer = normalizedKey(matchIdentity(event, event.player, context));
    const forcedBy = normalizedKey(matchIdentity(event, event.forcedBy, context));
    const server = normalizedKey(matchIdentity(event, event.server, context));
    if (eventPlayer === playerKey && event.eventType === "Winner") W++;
    if (eventPlayer === playerKey && event.eventType === "Error forzado") EF++;
    if (eventPlayer === playerKey && event.eventType === "Error no forzado") ENF++;
    if (forcedBy === playerKey && event.eventType === "Error forzado") EP++;
    if (server === playerKey) {
      services++;
      if (["1er saque", "primer saque", "1 saque"].includes(normalizedKey(event.serveType))) firstServices++;
    }
  });
  const score = SCORE.W * W + SCORE.EP * EP + SCORE.EF * EF + SCORE.ENF * ENF;
  const points = events.length;
  return { W, EP, EF, ENF, score, score100: pct(score, points), points, services, firstServices, firstServePct: pct(firstServices, services) };
}

function destroyChart(name) {
  if (charts[name]) charts[name].destroy();
}

function makeChart(name, element, config) {
  destroyChart(name);
  charts[name] = new Chart(element, config);
}

function baseScales() {
  return { x: { grid: { color: COLORS.grid } }, y: { grid: { color: COLORS.grid } } };
}

function selectedSets() {
  return $$("#set-filter input:checked").map(input => input.value);
}

function filterEvents({ ignorePointType = false } = {}) {
  const from = $("#date-from").value;
  const to = $("#date-to").value;
  const sets = selectedSets();
  const pointType = $("#point-filter").value;
  return payload.events.filter(event => {
    const inDates = (!from || event.date >= from) && (!to || event.date <= to);
    const inSets = sets.includes(String(event.set));
    const inPointType = ignorePointType || pointType === "all" || (pointType === "key" ? event.pointType === "Key Point" : event.pointType !== "Key Point");
    return inDates && inSets && inPointType;
  });
}

function uniqueMatches(events, player) {
  return new Set(events.filter(event => isParticipant(event, player)).map(event => `${event.date}|${event.match}`)).size;
}

function renderSummary(events, player) {
  const data = metrics(events, player);
  $("#hero-score").textContent = signed(data.score100);
  const cards = [
    ["Partidos", uniqueMatches(events, player), "registrados", "#0a6b46"],
    ["Puntos", data.points, "jugados", "#37474f"],
    ["Winners", `${fmt(data.pctW)}%`, `${data.W} eventos`, COLORS.W],
    ["Errores provocados", `${fmt(data.pctEP)}%`, `${data.EP} eventos`, COLORS.EP],
    ["Errores forzados", `${fmt(data.pctEF)}%`, `${data.EF} eventos`, COLORS.EF],
    ["Errores no forzados", `${fmt(data.pctENF)}%`, `${data.ENF} eventos`, COLORS.ENF],
    ["Score / 100", signed(data.score100), `${data.score >= 0 ? "+" : ""}${data.score} total`, COLORS.score]
  ];
  $("#summary-cards").innerHTML = cards.map(([label, value, note, color]) => `
    <article class="stat-card card" style="--accent:${color}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join("");

  makeChart("summary", $("#summary-chart"), {
    type: "bar",
    data: { labels: ["Winners", "Errores provocados", "Errores forzados", "Errores no forzados"], datasets: [{ data: [data.W, data.EP, data.EF, data.ENF], backgroundColor: [COLORS.W, COLORS.EP, COLORS.EF, COLORS.ENF], borderRadius: 7 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { ...baseScales(), y: { beginAtZero: true, grid: { color: COLORS.grid }, ticks: { precision: 0 } } } }
  });
}

function evolutionRows(events, player) {
  const groups = new Map();
  events.forEach(event => {
    const id = `${event.date}|${event.match}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(event);
  });
  return [...groups.entries()].map(([id, rows]) => {
    const [date, ...matchParts] = id.split("|");
    return { date, match: matchParts.join("|"), ...metrics(rows, player) };
  }).filter(row => row.points).sort((a, b) => a.date.localeCompare(b.date) || a.match.localeCompare(b.match));
}

function linearTrend(values) {
  if (!values.length) return [];
  if (values.length === 1) return [values[0]];
  const n = values.length;
  const sumX = n * (n - 1) / 2;
  const sumY = values.reduce((sum, value) => sum + value, 0);
  const sumXY = values.reduce((sum, value, index) => sum + index * value, 0);
  const sumXX = values.reduce((sum, _, index) => sum + index * index, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return values.map((_, index) => intercept + slope * index);
}

function renderEvolution(events, player) {
  const rows = evolutionRows(events, player);
  const scoreValues = rows.map(row => row.score100);
  makeChart("evolution", $("#evolution-chart"), {
    type: "line",
    data: { labels: rows.map(row => row.date.split("-").reverse().join("-")), datasets: [
      { label: "Score / 100", data: scoreValues, borderColor: COLORS.score, backgroundColor: "rgba(94,53,177,.12)", fill: true, tension: .28, pointRadius: 4, pointHoverRadius: 7 },
      { label: "Tendencia lineal", data: linearTrend(scoreValues), borderColor: "#c62828", backgroundColor: "transparent", borderWidth: 2, borderDash: [9, 6], fill: false, tension: 0, pointRadius: 0, pointHoverRadius: 0 }
    ] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { ...baseScales(), y: { grid: { color: COLORS.grid }, title: { display: true, text: "Score / 100" } } } }
  });
  renderTable("#evolution-table", ["Fecha", "Partido", "Puntos", "W", "EP", "EF", "ENF", "Score/100"], rows.map(row => [
    row.date.split("-").reverse().join("-"), row.match, row.points,
    metricCell(`${fmt(row.pctW)}% (${row.W})`, "w"), metricCell(`${fmt(row.pctEP)}% (${row.EP})`, "ep"),
    metricCell(`${fmt(row.pctEF)}% (${row.EF})`, "ef"), metricCell(`${fmt(row.pctENF)}% (${row.ENF})`, "enf"), metricCell(signed(row.score100), "score")
  ]));
}

function shotRows(events, player) {
  const playerKey = key(player);
  const rows = new Map();
  const getRow = (shot) => {
    if (!rows.has(shot)) rows.set(shot, { shot, W: 0, EP: 0, EF: 0, ENF: 0 });
    return rows.get(shot);
  };
  events.forEach(event => {
    const row = getRow(event.shotType || "Sin golpe");
    if (key(event.player) === playerKey && event.eventType === "Winner") row.W++;
    if (key(event.forcedBy) === playerKey && event.eventType === "Error forzado") row.EP++;
    if (key(event.player) === playerKey && event.eventType === "Error forzado") row.EF++;
    if (key(event.player) === playerKey && event.eventType === "Error no forzado") row.ENF++;
  });
  return [...rows.values()].map(row => ({ ...row, events: row.W + row.EP + row.EF + row.ENF })).filter(row => row.events).sort((a, b) => b.events - a.events || a.shot.localeCompare(b.shot));
}

function renderShots(events, player) {
  const rows = shotRows(events, player);
  renderTable("#shots-table", ["Golpe", "Eventos", "W", "EP", "EF", "ENF"], rows.map(row => [escapeHtml(row.shot), row.events, metricCell(row.W, "w"), metricCell(row.EP, "ep"), metricCell(row.EF, "ef"), metricCell(row.ENF, "enf")]));
  const totalPositive = rows.reduce((sum, row) => sum + row.W + row.EP, 0);
  const totalENF = rows.reduce((sum, row) => sum + row.ENF, 0);
  const order = $("#shot-order").value;
  const ordered = [...rows].sort((a, b) => order === "positive" ? (b.W + b.EP) - (a.W + a.EP) : b.ENF - a.ENF);
  makeChart("shots", $("#shots-chart"), {
    type: "bar",
    data: { labels: ordered.map(row => row.shot), datasets: [
      { label: "% Winners + EP", data: ordered.map(row => pct(row.W + row.EP, totalPositive)), backgroundColor: COLORS.W, borderRadius: 5 },
      { label: "% Errores no forzados", data: ordered.map(row => -pct(row.ENF, totalENF)), backgroundColor: COLORS.ENF, borderRadius: 5 }
    ] },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", align: "end", labels: { boxWidth: 12, font: { size: 10 } } }, tooltip: { callbacks: { label: context => `${context.dataset.label}: ${fmt(Math.abs(context.raw))}%` } } }, scales: { x: { grid: { color: COLORS.grid }, ticks: { callback: value => `${Math.abs(value)}%` } }, y: { grid: { display: false } } } }
  });
  renderShotDifferential(events, player);
}

function shotDifferentialRows(events, player, selectedShot) {
  const playerKey = key(player);
  const groups = new Map();
  events.filter(event => isParticipant(event, player)).forEach(event => {
    const id = `${event.date}|${event.match}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(event);
  });

  return [...groups.entries()].map(([id, matchEvents]) => {
    const [date, ...matchParts] = id.split("|");
    const filtered = selectedShot === "all"
      ? matchEvents
      : matchEvents.filter(event => key(event.shotType) === key(selectedShot));
    const W = filtered.filter(event => key(event.player) === playerKey && event.eventType === "Winner").length;
    const EP = filtered.filter(event => key(event.forcedBy) === playerKey && event.eventType === "Error forzado").length;
    const EF = filtered.filter(event => key(event.player) === playerKey && event.eventType === "Error forzado").length;
    const ENF = filtered.filter(event => key(event.player) === playerKey && event.eventType === "Error no forzado").length;
    return { date, match: matchParts.join("|"), W, EP, EF, ENF, differential: W + EP - ENF };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.match.localeCompare(b.match));
}

function renderShotDifferential(events, player) {
  const selectedShot = $("#shot-differential-filter").value;
  const rows = shotDifferentialRows(events, player, selectedShot);
  const selectedLabel = selectedShot === "all" ? "Todos los golpes" : selectedShot;
  makeChart("shotDifferential", $("#shot-differential-chart"), {
    type: "line",
    data: {
      labels: rows.map(row => row.date.split("-").reverse().join("-")),
      datasets: [{
        label: `Diferencial · ${selectedLabel}`,
        data: rows.map(row => row.differential),
        borderColor: COLORS.ink,
        backgroundColor: "rgba(20, 37, 30, .08)",
        pointBackgroundColor: rows.map(row => row.differential > 0 ? COLORS.W : row.differential < 0 ? COLORS.ENF : "#78909c"),
        pointBorderColor: "#ffffff",
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 2,
        tension: .22,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: {
          title: items => `${rows[items[0].dataIndex].date.split("-").reverse().join("-")} · ${rows[items[0].dataIndex].match}`,
          afterLabel: item => {
            const row = rows[item.dataIndex];
            return `W ${row.W} · EP ${row.EP} · ENF ${row.ENF}`;
          }
        } }
      },
      scales: {
        x: { grid: { display: false }, title: { display: true, text: "Fecha del partido" } },
        y: { grid: { color: context => context.tick.value === 0 ? "rgba(20,37,30,.65)" : COLORS.grid, lineWidth: context => context.tick.value === 0 ? 2 : 1 }, title: { display: true, text: "Diferencial" }, ticks: { precision: 0 } }
      }
    }
  });
}

function initializeShotDifferentialFilter() {
  const shots = [...new Map(payload.events.map(event => {
    const shot = event.shotType || "Sin golpe";
    return [key(shot), shot];
  })).values()]
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  $("#shot-differential-filter").innerHTML = `<option value="all">Todos los golpes</option>${shots.map(shot => `<option value="${escapeHtml(shot)}">${escapeHtml(shot)}</option>`).join("")}`;
}

function renderKeyPoints(player) {
  const baseEvents = filterEvents({ ignorePointType: true });
  const all = metrics(baseEvents, player);
  const keyData = metrics(baseEvents.filter(event => event.pointType === "Key Point"), player);
  const labels = ["% Winners", "% EP", "% EF", "% ENF", "Score / 100"];
  makeChart("key", $("#key-chart"), {
    type: "bar",
    data: { labels, datasets: [
      { label: "Todos", data: [all.pctW, all.pctEP, all.pctEF, all.pctENF, all.score100], backgroundColor: "rgba(10,107,70,.35)", borderColor: "#0a6b46", borderWidth: 1, borderRadius: 5 },
      { label: "Key Points", data: [keyData.pctW, keyData.pctEP, keyData.pctEF, keyData.pctENF, keyData.score100], backgroundColor: COLORS.score, borderRadius: 5 }
    ] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { ...baseScales(), y: { grid: { color: COLORS.grid }, ticks: { callback: value => `${value}%` } } } }
  });
  renderTable("#key-table", ["Tipo", "Puntos", "%W", "%EP", "%EF", "%ENF", "Score/100"], [
    comparisonRow("Todos los puntos", all), comparisonRow("Key Points", keyData)
  ]);
}

function comparisonRow(label, row) {
  return [label, row.points, metricCell(`${fmt(row.pctW)}% (${row.W})`, "w"), metricCell(`${fmt(row.pctEP)}% (${row.EP})`, "ep"), metricCell(`${fmt(row.pctEF)}% (${row.EF})`, "ef"), metricCell(`${fmt(row.pctENF)}% (${row.ENF})`, "enf"), metricCell(signed(row.score100), "score")];
}

function renderSets(events, player) {
  const groups = new Map();
  events.forEach(event => {
    if (!groups.has(event.set)) groups.set(event.set, []);
    groups.get(event.set).push(event);
  });
  const rows = [...groups.entries()].map(([set, values]) => ({ set, ...metrics(values, player) })).filter(row => row.points).sort((a, b) => String(a.set).localeCompare(String(b.set), undefined, { numeric: true }));
  makeChart("sets", $("#sets-chart"), {
    type: "bar",
    data: { labels: rows.map(row => `Set ${row.set}`), datasets: [{ label: "Score / 100", data: rows.map(row => row.score100), backgroundColor: rows.map(row => row.score100 >= 0 ? COLORS.W : COLORS.ENF), borderRadius: 7 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { ...baseScales(), y: { grid: { color: COLORS.grid } } } }
  });
  renderTable("#sets-table", ["Set", "Puntos", "%W", "%EP", "%EF", "%ENF", "Score/100"], rows.map(row => comparisonRow(row.set, row)));
}

function playerRanking(events) {
  return payload.players.map(player => ({ player, ...metrics(events, player) })).filter(row => row.points).sort((a, b) => b.points - a.points || b.score100 - a.score100 || a.player.localeCompare(b.player));
}

function renderPlayers(events) {
  const search = key($("#player-search").value);
  const rows = playerRanking(events).filter(row => key(row.player).includes(search));
  renderTable("#players-table", ["# / Jugador", "Puntos", "% Winners", "% ENF", "% EF", "% EP", "Score/100"], rows.map((row, index) => [
    `<span class="rank">${index + 1}</span><button class="player-link" data-player="${escapeHtml(row.player)}">${escapeHtml(row.player)}</button>`, row.points,
    metricCell(fmt(row.pctW), "w"), metricCell(fmt(row.pctENF), "enf"), metricCell(fmt(row.pctEF), "ef"), metricCell(fmt(row.pctEP), "ep"), metricCell(signed(row.score100), "score")
  ]));
  $$(".player-link").forEach(button => button.addEventListener("click", () => {
    $("#player-filter").value = button.dataset.player;
    activateTab("summary");
    updateDashboard();
    window.scrollTo({ top: 150, behavior: "smooth" });
  }));
}

function matchDates() {
  return [...new Set(payload.events.map(event => event.date).filter(Boolean))].sort().reverse();
}

function eventsForMatchSelection({ includeSet = true } = {}) {
  const date = $("#match-date-filter").value;
  const match = $("#match-filter").value;
  const set = $("#match-set-filter").value;
  return payload.events
    .filter(event => event.date === date && String(event.match) === match && (!includeSet || set === "all" || String(event.set) === set))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function updateMatchOptions() {
  const date = $("#match-date-filter").value;
  const previous = $("#match-filter").value;
  const matches = [...new Map(payload.events
    .filter(event => event.date === date)
    .map(event => [String(event.match), event])).entries()];
  $("#match-filter").innerHTML = matches.map(([match, event]) => {
    const type = event.matchType ? ` · ${escapeHtml(event.matchType)}` : "";
    return `<option value="${escapeHtml(match)}">${escapeHtml(match)}${type}</option>`;
  }).join("");
  if (matches.some(([match]) => match === previous)) $("#match-filter").value = previous;
  updateMatchSetOptions();
}

function updateMatchSetOptions() {
  const previous = $("#match-set-filter").value;
  const sets = [...new Set(eventsForMatchSelection({ includeSet: false }).map(event => String(event.set)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  $("#match-set-filter").innerHTML = `<option value="all">Todos</option>${sets.map(set => `<option value="${escapeHtml(set)}">Set ${escapeHtml(set)}</option>`).join("")}`;
  if (previous === "all" || sets.includes(previous)) $("#match-set-filter").value = previous || "all";
}

function initializeMatchFilters() {
  const dates = matchDates();
  $("#match-date-filter").innerHTML = dates.map(date => `<option value="${escapeHtml(date)}">${date.split("-").reverse().join("-")}</option>`).join("");
  updateMatchOptions();
}

function matchFinalLabelsPlugin() {
  return {
    id: "matchFinalLabels",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.font = "700 11px Inter, sans-serif";
      ctx.textBaseline = "middle";
      chart.data.datasets.forEach((dataset, index) => {
        const meta = chart.getDatasetMeta(index);
        const point = meta.data.at(-1);
        if (!point || !dataset.data.length) return;
        const value = dataset.data.at(-1);
        ctx.fillStyle = dataset.borderColor;
        ctx.fillText(`${value >= 0 ? "+" : ""}${value}`, Math.min(point.x + 7, chartArea.right + 8), point.y);
      });
      ctx.restore();
    }
  };
}

function renderMatch() {
  const events = eventsForMatchSelection();
  const hasEvents = events.length > 0;
  $("#match-empty").classList.toggle("hidden", hasEvents);
  $("#match-summary-cards").classList.toggle("hidden", !hasEvents);
  $(".match-chart-card").classList.toggle("hidden", !hasEvents);
  if (!hasEvents) return;

  const context = buildMatchContext(events);
  const selectedSet = $("#match-set-filter").value;
  const dateText = events[0].date.split("-").reverse().join("-");
  const type = events[0].matchType || "Partido";
  $("#match-chart-title").textContent = `Score acumulado · ${dateText}${selectedSet === "all" ? "" : ` · Set ${selectedSet}`}`;
  $("#match-badge").textContent = context.americano ? "Americano · rivales agrupados" : type;

  const running = new Map(context.players.map(player => [normalizedKey(player.name), 0]));
  const series = new Map(context.players.map(player => [normalizedKey(player.name), []]));
  events.forEach(event => {
    const eventPlayer = normalizedKey(matchIdentity(event, event.player, context));
    const forcedBy = normalizedKey(matchIdentity(event, event.forcedBy, context));
    context.players.forEach(player => {
      const playerKey = normalizedKey(player.name);
      let value = running.get(playerKey) || 0;
      if (eventPlayer === playerKey && event.eventType === "Winner") value += SCORE.W;
      if (eventPlayer === playerKey && event.eventType === "Error forzado") value += SCORE.EF;
      if (eventPlayer === playerKey && event.eventType === "Error no forzado") value += SCORE.ENF;
      if (forcedBy === playerKey && event.eventType === "Error forzado") value += SCORE.EP;
      running.set(playerKey, value);
      series.get(playerKey).push(value);
    });
  });

  makeChart("match", $("#match-chart"), {
    type: "line",
    data: {
      labels: events.map((_, index) => index + 1),
      datasets: context.players.map((player, index) => ({
        label: player.name,
        data: series.get(normalizedKey(player.name)),
        borderColor: MATCH_COLORS[index % MATCH_COLORS.length],
        backgroundColor: MATCH_COLORS[index % MATCH_COLORS.length],
        pointRadius: events.length > 80 ? 0 : 2,
        pointHoverRadius: 5,
        borderWidth: 2.2,
        tension: .16
      }))
    },
    plugins: [matchFinalLabelsPlugin()],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      layout: { padding: { right: 44 } },
      plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 9 } }, tooltip: { callbacks: { title: items => `Punto ${items[0].label}`, label: item => `${item.dataset.label}: ${item.raw >= 0 ? "+" : ""}${item.raw}` } } },
      scales: {
        x: { grid: { color: COLORS.grid }, title: { display: true, text: "Punto" } },
        y: { grid: { color: COLORS.grid }, title: { display: true, text: "Score acumulado" } }
      }
    }
  });

  $("#match-summary-cards").innerHTML = context.players.map((player, index) => {
    const data = matchMetrics(events, player.name, context);
    const color = MATCH_COLORS[index % MATCH_COLORS.length];
    const service = data.services ? `${fmt(data.firstServePct)}% (${data.firstServices}/${data.services})` : "N/D";
    return `<article class="card match-player-card" style="--accent:${color}">
      <header><div><span>${escapeHtml(player.team)} · ${escapeHtml(player.position)}</span><h3>${escapeHtml(player.name)}</h3></div><div class="match-score"><small>Score / 100</small><strong>${signed(data.score100)}</strong><em>${data.score >= 0 ? "+" : ""}${data.score} total</em></div></header>
      <div class="match-metrics">
        <div class="metric-w"><span>Winners</span><b>${data.W}</b></div>
        <div class="metric-ep"><span>Errores provocados</span><b>${data.EP}</b></div>
        <div class="metric-ef"><span>Errores forzados</span><b>${data.EF}</b></div>
        <div class="metric-enf"><span>Errores no forzados</span><b>${data.ENF}</b></div>
        <div><span>1er servicio</span><b>${service}</b></div>
      </div>
    </article>`;
  }).join("");
}

function metricCell(value, type) { return `<span class="metric-${type}">${value}</span>`; }

function renderTable(selector, headers, rows) {
  $(selector).innerHTML = `<thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${value}</td>`).join("")}</tr>`).join("")}</tbody>`;
}

function activateTab(id) {
  $$(".tab").forEach(tab => tab.classList.toggle("is-active", tab.dataset.tab === id));
  $$(".panel").forEach(panel => panel.classList.toggle("is-active", panel.id === id));
  $("#global-filters").classList.toggle("hidden", id === "match");
  $("#hero-score-card").classList.toggle("hidden", id === "match");
  if (id === "match") renderMatch();
  setTimeout(() => Object.values(charts).forEach(chart => chart.resize()), 0);
}

function updateDashboard() {
  const player = $("#player-filter").value;
  activeEvents = filterEvents();
  const hasData = metrics(activeEvents, player).points > 0;
  $("#empty-state").classList.toggle("hidden", hasData);
  $$(".panel").forEach(panel => panel.classList.toggle("hidden", !hasData && panel.id !== "match"));
  if (!hasData) { $("#hero-score").textContent = "—"; return; }
  renderSummary(activeEvents, player);
  renderEvolution(activeEvents, player);
  renderShots(activeEvents, player);
  renderKeyPoints(player);
  renderSets(activeEvents, player);
  renderPlayers(activeEvents);
}

function initializeFilters() {
  $("#player-filter").innerHTML = payload.players.map(player => `<option>${escapeHtml(player)}</option>`).join("");
  const defaultPlayer = payload.players
    .map(player => ({ player, points: payload.events.filter(event => isParticipant(event, player)).length }))
    .sort((a, b) => b.points - a.points || a.player.localeCompare(b.player))[0]?.player;
  if (defaultPlayer) $("#player-filter").value = defaultPlayer;
  const dates = payload.events.map(event => event.date).filter(Boolean).sort();
  $("#date-from").value = dates[0] || "";
  $("#date-to").value = dates.at(-1) || "";
  const sets = [...new Set(payload.events.map(event => String(event.set)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  $("#set-filter").innerHTML = sets.map(set => `<label class="set-check"><input type="checkbox" value="${escapeHtml(set)}" checked> Set ${escapeHtml(set)}</label>`).join("");
}

function resetFilters() {
  const dates = payload.events.map(event => event.date).filter(Boolean).sort();
  $("#date-from").value = dates[0] || "";
  $("#date-to").value = dates.at(-1) || "";
  $("#point-filter").value = "all";
  $$("#set-filter input").forEach(input => { input.checked = true; });
  updateDashboard();
}

async function init() {
  try {
    const response = await fetch("data/events.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
    if (!payload.events?.length || !payload.players?.length) throw new Error("El archivo de datos está vacío");
    initializeFilters();
    initializeShotDifferentialFilter();
    initializeMatchFilters();
    $("#demo-banner").classList.toggle("hidden", !payload.isDemo);
    $("#data-status").textContent = `${payload.events.length.toLocaleString("es-CL")} eventos · ${payload.players.length} jugadores · actualizado ${new Date(payload.generatedAt).toLocaleString("es-CL")}`;
    ["#player-filter", "#date-from", "#date-to", "#point-filter", "#set-filter"].forEach(selector => $(selector).addEventListener("change", updateDashboard));
    $("#shot-order").addEventListener("change", () => renderShots(activeEvents, $("#player-filter").value));
    $("#shot-differential-filter").addEventListener("change", () => renderShotDifferential(activeEvents, $("#player-filter").value));
    $("#player-search").addEventListener("input", () => renderPlayers(activeEvents));
    $("#match-date-filter").addEventListener("change", () => { updateMatchOptions(); renderMatch(); });
    $("#match-filter").addEventListener("change", () => { updateMatchSetOptions(); renderMatch(); });
    $("#match-set-filter").addEventListener("change", renderMatch);
    $("#reset-filters").addEventListener("click", resetFilters);
    $$(".tab").forEach(tab => tab.addEventListener("click", () => activateTab(tab.dataset.tab)));
    updateDashboard();
    renderMatch();
  } catch (error) {
    $("#data-status").textContent = `No fue posible cargar los datos: ${error.message}`;
    $("#empty-state").classList.remove("hidden");
    $("#empty-state h2").textContent = "No fue posible cargar el histórico";
    $("#empty-state p").textContent = "Ejecuta python scripts/generar_datos_web.py y vuelve a publicar el sitio.";
  }
}

window.addEventListener("DOMContentLoaded", init);

