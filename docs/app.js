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

function renderEvolution(events, player) {
  const rows = evolutionRows(events, player);
  makeChart("evolution", $("#evolution-chart"), {
    type: "line",
    data: { labels: rows.map(row => row.date.split("-").reverse().join("-")), datasets: [{ label: "Score / 100", data: rows.map(row => row.score100), borderColor: COLORS.score, backgroundColor: "rgba(94,53,177,.12)", fill: true, tension: .28, pointRadius: 4, pointHoverRadius: 7 }] },
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

function metricCell(value, type) { return `<span class="metric-${type}">${value}</span>`; }

function renderTable(selector, headers, rows) {
  $(selector).innerHTML = `<thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${value}</td>`).join("")}</tr>`).join("")}</tbody>`;
}

function activateTab(id) {
  $$(".tab").forEach(tab => tab.classList.toggle("is-active", tab.dataset.tab === id));
  $$(".panel").forEach(panel => panel.classList.toggle("is-active", panel.id === id));
  setTimeout(() => Object.values(charts).forEach(chart => chart.resize()), 0);
}

function updateDashboard() {
  const player = $("#player-filter").value;
  activeEvents = filterEvents();
  const hasData = metrics(activeEvents, player).points > 0;
  $("#empty-state").classList.toggle("hidden", hasData);
  $$(".panel").forEach(panel => panel.classList.toggle("hidden", !hasData));
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
    $("#demo-banner").classList.toggle("hidden", !payload.isDemo);
    $("#data-status").textContent = `${payload.events.length.toLocaleString("es-CL")} eventos · ${payload.players.length} jugadores · actualizado ${new Date(payload.generatedAt).toLocaleString("es-CL")}`;
    ["#player-filter", "#date-from", "#date-to", "#point-filter", "#set-filter"].forEach(selector => $(selector).addEventListener("change", updateDashboard));
    $("#shot-order").addEventListener("change", () => renderShots(activeEvents, $("#player-filter").value));
    $("#player-search").addEventListener("input", () => renderPlayers(activeEvents));
    $("#reset-filters").addEventListener("click", resetFilters);
    $$(".tab").forEach(tab => tab.addEventListener("click", () => activateTab(tab.dataset.tab)));
    updateDashboard();
  } catch (error) {
    $("#data-status").textContent = `No fue posible cargar los datos: ${error.message}`;
    $("#empty-state").classList.remove("hidden");
    $("#empty-state h2").textContent = "No fue posible cargar el histórico";
    $("#empty-state p").textContent = "Ejecuta python scripts/generar_datos_web.py y vuelve a publicar el sitio.";
  }
}

window.addEventListener("DOMContentLoaded", init);

