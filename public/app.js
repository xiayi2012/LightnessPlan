const state = {
  user: null,
  stats: null,
  records: [],
  community: [],
  leaderboard: [],
  competition: null,
  unit: localStorage.getItem("weightUnit") === "jin" ? "jin" : "kg"
};

const $ = (selector) => document.querySelector(selector);
const today = localDateString(new Date());

const authView = $("#authView");
const dashboardView = $("#dashboardView");
const authMessage = $("#authMessage");
const recordMessage = $("#recordMessage");
const recordDate = $("#recordDate");
const recordWeightInput = $("#recordWeightInput");
const recordWeightRange = $("#recordWeightRange");
const rankDate = $("#rankDate");
const avatarInput = $("#avatarInput");
const avatarCameraInput = $("#avatarCameraInput");
const avatarCanvas = $("#avatarCanvas");
const avatarZoom = $("#avatarZoom");
let rankMode = "totalLoss";
let currentPage = "home";
let previousPageBeforeCheckin = "home";
let editingRecordId = null;
let pendingDeleteRecordId = null;
let avatarEditorImage = null;
let avatarCropX = 130;
let avatarCropY = 130;
let avatarCropRadius = 92;
let avatarDragState = null;
let avatarSourceOpenedAt = 0;
const pageMeta = {
  home: ["今日战况", "轻盈计划"],
  stats: ["体重数据", "统计"],
  checkin: ["每日打卡", "体重打卡"],
  rank: ["好友 PK", "排行榜"],
  profile: ["个人中心", "我的"],
  competitionSettings: ["比赛设置", "比赛设置"]
};

recordDate.value = today;
if (rankDate) rankDate.value = today;

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function localDateString(date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

function kg(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const number = Number(value);
  return state.unit === "jin" ? `${(number * 2).toFixed(1)}斤` : `${number.toFixed(1)}kg`;
}

function signedKg(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const number = Number(value);
  const display = state.unit === "jin" ? Math.abs(number * 2) : Math.abs(number);
  const unit = state.unit === "jin" ? "斤" : "kg";
  return `${number > 0 ? "-" : number < 0 ? "+" : ""}${display.toFixed(1)}${unit}`;
}

function cumulativeKg(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const number = Number(value);
  const display = state.unit === "jin" ? Math.abs(number * 2) : Math.abs(number);
  const unit = state.unit === "jin" ? "斤" : "kg";
  return number >= 0 ? `${display.toFixed(1)}${unit}` : `+${display.toFixed(1)}${unit}`;
}

function inputWeightFromKg(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  const number = Number(value);
  return state.unit === "jin" ? Number((number * 2).toFixed(1)) : Number(number.toFixed(1));
}

function inputWeightToKg(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return state.unit === "jin" ? Number((number / 2).toFixed(2)) : number;
}

function updateUnitControls() {
  document.querySelectorAll("[data-unit]").forEach((button) => {
    button.classList.toggle("active", button.dataset.unit === state.unit);
  });
  const input = $("#recordForm")?.elements.weight;
  const label = $("#recordWeightLabel");
  if (input) {
    input.min = state.unit === "jin" ? "40" : "20";
    input.max = state.unit === "jin" ? "800" : "400";
  }
  if (recordWeightRange) {
    recordWeightRange.min = state.unit === "jin" ? "40" : "20";
    recordWeightRange.max = state.unit === "jin" ? "800" : "400";
  }
  if (label) label.textContent = state.unit === "jin" ? "体重 斤" : "体重 kg";
  syncWeightRangeFromInput();
}

function syncWeightRangeFromInput() {
  if (!recordWeightInput || !recordWeightRange) return;
  const value = Number(recordWeightInput.value || recordWeightRange.value || (state.unit === "jin" ? 120 : 60));
  if (Number.isFinite(value)) recordWeightRange.value = String(value);
}

function syncWeightInputFromRange() {
  if (!recordWeightInput || !recordWeightRange) return;
  recordWeightInput.value = Number(recordWeightRange.value).toFixed(1);
}

function switchPage(page) {
  if (page === "checkin" && currentPage !== "checkin") {
    previousPageBeforeCheckin = currentPage || "home";
  }
  document.querySelectorAll(".app-page").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === page);
  });
  document.querySelectorAll("[data-tab-page]").forEach((item) => {
    item.classList.toggle("active", item.dataset.tabPage === page);
  });
  const [eyebrow, title] = pageMeta[page] || pageMeta.home;
  $("#pageEyebrow").textContent = eyebrow;
  $("#pageTitle").textContent = title;
  $("#pageTitle").classList.toggle("hidden-title", !title);
  currentPage = page;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetRecordForm() {
  $("#recordForm").reset();
  recordDate.value = today;
  editingRecordId = null;
  $("#saveRecordBtn").textContent = "保存打卡";
  syncWeightRangeFromInput();
  recordMessage.textContent = "";
}

function closeRecordPage() {
  resetRecordForm();
  switchPage(previousPageBeforeCheckin || "home");
}

function openProfileEdit() {
  $("#profileNameInput").value = state.user?.name || "";
  $("#profileEditMessage").textContent = "";
  $("#profileEditModal").classList.remove("hidden");
}

function closeProfileEdit() {
  $("#profileEditModal").classList.add("hidden");
}

function openAvatarSource(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const now = Date.now();
  const modal = $("#avatarSourceModal");
  if (!modal.classList.contains("hidden") || now - avatarSourceOpenedAt < 450) return;
  avatarSourceOpenedAt = now;
  closeProfileEdit();
  closeAvatarEditor();
  modal.classList.remove("hidden");
}

function closeAvatarSource() {
  $("#avatarSourceModal").classList.add("hidden");
}

function closeAvatarEditor() {
  $("#avatarEditorModal").classList.add("hidden");
  $("#avatarEditMessage").textContent = "";
  avatarEditorImage = null;
  avatarDragState = null;
  avatarCropX = 130;
  avatarCropY = 130;
}

function closeDeleteModal() {
  pendingDeleteRecordId = null;
  $("#deleteModal").classList.add("hidden");
}

function closeRecordDetail() {
  $("#recordDetailModal").classList.add("hidden");
}

function renderShell() {
  if (!state.user) {
    authView.classList.remove("hidden");
    dashboardView.classList.add("hidden");
    return;
  }
  authView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  $("#helloTitle").textContent = `${state.user.name}，今天继续向目标靠近`;
  $("#latestWeight").textContent = kg(state.stats.latestWeight);
  $("#homeLatestWeight").textContent = kg(state.stats.latestWeight);
  $("#totalLoss").textContent = cumulativeKg(state.stats.totalLoss);
  $("#targetWeight").textContent = kg(state.user.targetWeight);
  $("#recordDays").textContent = `${state.stats.totalRecords} 天`;
  $("#profileName").textContent = state.user.name;
  $("#profileAccount").textContent = state.user.account;
  renderAvatar();
  $("#profileCurrentWeight").textContent = kg(state.stats.latestWeight);
  $("#profileTargetWeight").textContent = kg(state.user.targetWeight);
  $("#profileTotalLoss").textContent = cumulativeKg(state.stats.totalLoss);
  $("#profileRecordDays").textContent = `${state.stats.totalRecords} 天`;
  renderGoalProgress();
  updateUnitControls();
}

function renderRecords() {
  const recentHomeRecords = state.records.slice(0, 7);
  const myRecords = $("#myRecords");
  if (myRecords) {
    myRecords.innerHTML = state.records.length
      ? state.records.map((record) => recordCard(record, "", true)).join("")
      : `<div class="empty">还没有记录</div>`;
  }
  const communityRecords = $("#communityRecords");
  if (communityRecords) {
    communityRecords.innerHTML = state.community.length
      ? state.community.map((record) => recordCard(record, record.user.name)).join("")
      : `<div class="empty">大家还没有公开记录</div>`;
  }
  $("#homeRecentRecords").innerHTML = recentHomeRecords.length
    ? recentHomeRecords.map((record) => recordCard(record, "", true)).join("")
    : `<div class="empty">今天从第一条记录开始。</div>`;
  const statsAllRecords = $("#statsAllRecords");
  if (statsAllRecords) {
    statsAllRecords.innerHTML = state.records.length
      ? state.records.map((record) => recordCard(record, "", true)).join("")
      : `<div class="empty">还没有体重记录</div>`;
  }
  renderStats();
}

function avatarText(name) {
  const text = String(name || "").trim();
  return text ? text.slice(0, 2).toUpperCase() : "我";
}

function renderAvatar() {
  const avatar = $("#profileAvatar");
  if (!avatar) return;
  if (state.user?.avatar) {
    avatar.innerHTML = `<img src="${state.user.avatar}" alt="头像" />`;
  } else {
    avatar.textContent = avatarText(state.user?.name);
  }
}

function openAvatarEditor(dataUrl) {
  const image = new Image();
  image.onload = () => {
    avatarEditorImage = image;
    avatarCropX = avatarCanvas.width / 2;
    avatarCropY = avatarCanvas.height / 2;
    avatarCropRadius = Math.round(avatarCanvas.width * 0.36);
    avatarDragState = null;
    avatarZoom.value = "1";
    $("#avatarEditorModal").classList.remove("hidden");
    $("#avatarEditMessage").textContent = "";
    renderAvatarEditor();
  };
  image.onerror = () => alert("头像读取失败，请换一张图片");
  image.src = dataUrl;
}

function renderAvatarEditor() {
  if (!avatarEditorImage || !avatarCanvas) return;
  const context = avatarCanvas.getContext("2d");
  const size = avatarCanvas.width;
  const scale = Number(avatarZoom.value || 1);
  const imageRatio = avatarEditorImage.width / avatarEditorImage.height;
  const baseWidth = imageRatio > 1 ? size * imageRatio : size;
  const baseHeight = imageRatio > 1 ? size : size / imageRatio;
  const drawWidth = baseWidth * scale;
  const drawHeight = baseHeight * scale;
  const x = (size - drawWidth) / 2;
  const y = (size - drawHeight) / 2;
  clampAvatarCrop();

  context.clearRect(0, 0, size, size);
  context.fillStyle = "#fff8f3";
  context.fillRect(0, 0, size, size);
  context.drawImage(avatarEditorImage, x, y, drawWidth, drawHeight);

  context.save();
  context.fillStyle = "rgba(59, 47, 42, 0.42)";
  context.fillRect(0, 0, size, size);
  context.globalCompositeOperation = "destination-out";
  context.beginPath();
  context.arc(avatarCropX, avatarCropY, avatarCropRadius, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.beginPath();
  context.arc(avatarCropX, avatarCropY, avatarCropRadius, 0, Math.PI * 2);
  context.lineWidth = 4;
  context.strokeStyle = "rgba(255, 255, 255, 0.92)";
  context.stroke();
}

function clampAvatarCrop() {
  if (!avatarEditorImage || !avatarCanvas) return;
  const size = avatarCanvas.width;
  avatarCropRadius = Math.max(54, Math.min(size / 2 - 8, 92 * Number(avatarZoom.value || 1)));
  avatarCropX = Math.max(avatarCropRadius, Math.min(size - avatarCropRadius, avatarCropX));
  avatarCropY = Math.max(avatarCropRadius, Math.min(size - avatarCropRadius, avatarCropY));
}

function canvasPoint(event) {
  const rect = avatarCanvas.getBoundingClientRect();
  const point = event.touches?.[0] || event.changedTouches?.[0] || event;
  const scale = avatarCanvas.width / rect.width;
  return {
    x: (point.clientX - rect.left) * scale,
    y: (point.clientY - rect.top) * scale
  };
}

function startAvatarDrag(event) {
  if (!avatarEditorImage) return;
  event.preventDefault();
  const point = canvasPoint(event);
  avatarDragState = {
    startX: point.x,
    startY: point.y,
    cropX: avatarCropX,
    cropY: avatarCropY
  };
  avatarCanvas.setPointerCapture?.(event.pointerId);
}

function moveAvatarDrag(event) {
  if (!avatarDragState) return;
  event.preventDefault();
  const point = canvasPoint(event);
  avatarCropX = avatarDragState.cropX + point.x - avatarDragState.startX;
  avatarCropY = avatarDragState.cropY + point.y - avatarDragState.startY;
  renderAvatarEditor();
}

function endAvatarDrag(event) {
  if (!avatarDragState) return;
  avatarCanvas.releasePointerCapture?.(event.pointerId);
  avatarDragState = null;
}

async function saveEditedAvatar() {
  if (!avatarCanvas) return;
  const message = $("#avatarEditMessage");
  message.textContent = "";
  const output = document.createElement("canvas");
  output.width = 260;
  output.height = 260;
  const context = output.getContext("2d");
  const size = avatarCanvas.width;
  const scale = Number(avatarZoom.value || 1);
  const imageRatio = avatarEditorImage.width / avatarEditorImage.height;
  const baseWidth = imageRatio > 1 ? size * imageRatio : size;
  const baseHeight = imageRatio > 1 ? size : size / imageRatio;
  const drawWidth = baseWidth * scale;
  const drawHeight = baseHeight * scale;
  const x = (size - drawWidth) / 2;
  const y = (size - drawHeight) / 2;
  const sourceX = Math.round(avatarCropX - avatarCropRadius);
  const sourceY = Math.round(avatarCropY - avatarCropRadius);
  const sourceSize = Math.round(avatarCropRadius * 2);
  context.drawImage(avatarEditorImage, x, y, drawWidth, drawHeight);
  const cropped = context.getImageData(sourceX, sourceY, sourceSize, sourceSize);
  context.clearRect(0, 0, output.width, output.height);
  const temp = document.createElement("canvas");
  temp.width = sourceSize;
  temp.height = sourceSize;
  temp.getContext("2d").putImageData(cropped, 0, 0);
  context.save();
  context.beginPath();
  context.arc(130, 130, 130, 0, Math.PI * 2);
  context.clip();
  context.drawImage(temp, 0, 0, 260, 260);
  context.restore();
  const avatar = output.toDataURL("image/jpeg", 0.86);
  try {
    const data = await api("/api/me", { method: "PATCH", body: JSON.stringify({ avatar }) });
    state.user = data.user;
    state.stats = data.stats;
    closeAvatarEditor();
    renderShell();
  } catch (error) {
    message.textContent = error.message;
  }
}

function recordCard(record, name = "", editable = false) {
  const note = [record.mood, record.note].filter(Boolean).join(" · ");
  const metaLines = name ? `<div class="record-meta">${escapeHtml(record.date)}</div>` : "";
  const noMetaClass = metaLines ? "" : " no-meta";
  return `
    <article class="record-item${noMetaClass} ${editable ? "swipe-record" : ""}" data-record-id="${escapeHtml(record.id)}" data-record-owner="${escapeHtml(name)}">
      ${editable ? `
        <div class="record-actions">
          <button type="button" data-action="edit-record" data-record-id="${escapeHtml(record.id)}">编辑</button>
          <button type="button" data-action="delete-record" data-record-id="${escapeHtml(record.id)}">删除</button>
        </div>
      ` : ""}
      <div class="record-content">
        <div>
          <div class="record-title">${escapeHtml(name || record.date)}</div>
          ${metaLines}
        </div>
        <div class="record-weight">${kg(record.weight)}</div>
      </div>
    </article>
  `;
}

function findRecordById(recordId, ownerName = "") {
  const source = ownerName ? state.community : state.records;
  return source.find((item) => item.id === recordId);
}

function openRecordDetail(record, ownerName = "") {
  if (!record) return;
  const note = [record.mood, record.note].filter(Boolean).join(" · ");
  $("#detailDate").textContent = record.date || "--";
  $("#detailTime").textContent = formatRecordTime(record.createdAt);
  $("#detailWeight").textContent = kg(record.weight);
  $("#detailNote").textContent = note || "暂无备注";
  $("#detailOwner").textContent = ownerName || "";
  $("#detailOwnerRow").classList.toggle("hidden", !ownerName);
  $("#recordDetailModal").classList.remove("hidden");
}

function formatRecordTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderLeaderboard() {
  renderCompetition();
  $("#leaderboard").innerHTML = state.leaderboard.length
    ? state.leaderboard.map((item, index) => {
      const description = rankDescription(item, index);
      const score = rankScore(item);
      return `
        <article class="rank-item ${item.own ? "own-rank" : ""}">
          <div class="rank-num">${index + 1}</div>
          <div>
            <div class="rank-name">${escapeHtml(item.user.name)}</div>
            ${description ? `<div class="rank-meta">${description}</div>` : ""}
          </div>
          ${score ? `<div class="rank-score">${score}</div>` : ""}
        </article>
      `;
    }).join("")
    : `<div class="empty">${rankMode === "totalLoss" ? "还没有可排行的体重记录。" : "这个日期还没有可排行的今日减重比例。"}</div>`;
}

function renderCompetition() {
  const competition = state.competition;
  if (!competition) return;
  $("#raceStatus").textContent = competition.isFinished ? "比赛已结束" : "比赛进行中";
  $("#raceTitle").textContent = competition.isFinished ? "最终结果" : "当前赛况";
  $("#raceDateRange").textContent = `${competition.startDate} 至 ${competition.endDate}`;
  $("#raceDaysLeft").textContent = competition.isFinished ? "0" : competition.daysLeft;
  $("#winnerLabel").textContent = competition.isFinished ? "获胜者" : "当前第一";
  $("#loserLabel").textContent = competition.isFinished ? "请客吃饭" : "请客候选";
  $("#winnerName").textContent = competition.winner?.user?.name || "--";
  $("#winnerScore").textContent = competition.winner
    ? competition.isFinished
      ? `${Number(competition.winner.totalPercent || 0).toFixed(2)}% · ${signedKg(competition.winner.totalLoss)}`
      : "比赛结束后公开数值"
    : "--";
  $("#loserName").textContent = competition.loser?.user?.name || "--";
  $("#loserScore").textContent = competition.loser
    ? competition.isFinished
      ? `${Number(competition.loser.totalPercent || 0).toFixed(2)}% · ${signedKg(competition.loser.totalLoss)}`
      : "比赛结束后公开数值"
    : "--";
  renderCompetitionSettings();
}

function renderCompetitionSettings() {
  const competition = state.competition;
  const startInput = $("#competitionStartDate");
  const durationInput = $("#competitionDurationDays");
  if (!competition || !startInput || !durationInput) return;
  startInput.value = competition.startDate || today;
  durationInput.value = competition.durationDays || 30;
}

function rankDescription(item, index) {
  if (item.hidden) {
    return "";
  }
  if (item.own) return `当前体重 ${kg(item.weight)} · 减重比例 ${Number(item.totalPercent ?? 0).toFixed(2)}%`;
  return "";
}

function rankScore(item) {
  if (!item.own || item.hidden) return "";
  return `${kg(item.weight)}<br><span>${Number(item.totalPercent ?? 0).toFixed(2)}%</span>`;
}

function renderGoalProgress() {
  const start = Number(state.user?.startWeight);
  const target = Number(state.user?.targetWeight);
  const latest = Number(state.stats?.latestWeight);
  if (!start || !target || !latest || start === target) {
    $("#goalProgress").style.width = "0%";
    $("#homeProgressText").textContent = "设置目标后开始追踪进度";
    return;
  }
  const total = Math.abs(start - target);
  const done = Math.abs(start - latest);
  const progress = Math.max(0, Math.min(100, (done / total) * 100));
  const distance = Math.abs(latest - target);
  $("#goalProgress").style.width = `${progress.toFixed(0)}%`;
  $("#homeProgressText").textContent = `已完成 ${progress.toFixed(0)}%，距离目标 ${distance.toFixed(1)}kg`;
}

function renderStats() {
  const records = [...state.records].sort((a, b) => a.date.localeCompare(b.date));
  renderCharts(records);
  const first = records[0];
  const latest = records[records.length - 1];
  const dayDiffs = records.slice(1).map((record, index) => Number((records[index].weight - record.weight).toFixed(1)));
  const best = dayDiffs.length ? Math.max(...dayDiffs) : 0;
  const average = records.length > 1 ? Number((state.stats.totalLoss / (records.length - 1)).toFixed(1)) : 0;
  $("#firstWeight").textContent = kg(first?.weight);
  $("#distanceToGoal").textContent = latest ? kg(Math.abs(latest.weight - state.user.targetWeight)) : "--";
  $("#avgChange").textContent = signedKg(average);
  $("#bestDay").textContent = signedKg(best);
}

function renderCharts(records) {
  const recent = records.slice(-10);
  $("#lineChart").innerHTML = recent.length > 1 ? lineChartSvg(recent) : `<div class="empty">至少 2 条记录后显示折线图</div>`;
  $("#barChart").innerHTML = recent.length > 1 ? barChartSvg(recent) : `<div class="empty">至少 2 条记录后显示柱状图</div>`;
}

function lineChartSvg(records) {
  const width = 320;
  const height = 160;
  const padding = 24;
  const weights = records.map((record) => record.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;
  const points = records.map((record, index) => {
    const x = padding + (index / Math.max(1, records.length - 1)) * (width - padding * 2);
    const y = padding + ((max - record.weight) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="体重折线图">
      <path class="chart-grid" d="M${padding} ${padding}H${width - padding}M${padding} ${height / 2}H${width - padding}M${padding} ${height - padding}H${width - padding}" />
      <polyline class="chart-line" points="${points.join(" ")}" />
      ${points.map((point) => `<circle class="chart-dot" cx="${point.split(",")[0]}" cy="${point.split(",")[1]}" r="4" />`).join("")}
      <text x="${padding}" y="18">${kg(max)}</text>
      <text x="${padding}" y="${height - 6}">${kg(min)}</text>
    </svg>
  `;
}

function barChartSvg(records) {
  const width = 320;
  const height = 160;
  const padding = 24;
  const diffs = records.slice(1).map((record, index) => ({
    date: record.date,
    value: Number((records[index].weight - record.weight).toFixed(2))
  }));
  const max = Math.max(0.1, ...diffs.map((item) => Math.abs(item.value)));
  const barWidth = (width - padding * 2) / diffs.length - 6;
  const zeroY = height / 2;
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="每日变化柱状图">
      <path class="chart-grid" d="M${padding} ${padding}H${width - padding}M${padding} ${zeroY}H${width - padding}M${padding} ${height - padding}H${width - padding}" />
      ${diffs.map((item, index) => {
        const x = padding + index * ((width - padding * 2) / diffs.length) + 3;
        const barHeight = Math.max(3, Math.abs(item.value) / max * 54);
        const y = item.value >= 0 ? zeroY - barHeight : zeroY;
        return `<rect class="${item.value >= 0 ? "chart-bar-good" : "chart-bar-bad"}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="4" />`;
      }).join("")}
      <text x="${padding}" y="18">减重</text>
      <text x="${padding}" y="${height - 6}">增重</text>
    </svg>
  `;
}

function trendWidth(weight, records) {
  const weights = records.map((record) => record.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  if (min === max) return 55;
  return 24 + ((max - weight) / (max - min)) * 70;
}

function closeOpenSwipeRecords(exceptRecord = null) {
  document.querySelectorAll(".swipe-record.actions-open").forEach((record) => {
    if (record !== exceptRecord) record.classList.remove("actions-open");
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function refreshAll() {
  const [me, records, leaderboard] = await Promise.all([
    api("/api/me"),
    api("/api/records"),
    fetchLeaderboard()
  ]);
  state.user = me.user;
  state.stats = me.stats;
  state.records = records.mine;
  state.community = records.community;
  state.leaderboard = leaderboard.leaderboard;
  state.competition = leaderboard.competition;
  renderShell();
  renderRecords();
  renderLeaderboard();
}

function fetchLeaderboard() {
  return api(`/api/leaderboard?date=${encodeURIComponent(rankDate?.value || today)}&mode=${encodeURIComponent(rankMode)}`);
}

document.querySelectorAll("[data-auth-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-auth-tab]").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".auth-panel .form").forEach((form) => form.classList.remove("active"));
    button.classList.add("active");
    $(`#${button.dataset.authTab}Form`).classList.add("active");
    authMessage.textContent = "";
  });
});

document.querySelectorAll("[data-tab-page]").forEach((button) => {
  button.addEventListener("click", () => switchPage(button.dataset.tabPage));
});

document.querySelectorAll("[data-rank-mode]").forEach((button) => {
  button.addEventListener("click", async () => {
    rankMode = button.dataset.rankMode;
    document.querySelectorAll("[data-rank-mode]").forEach((item) => item.classList.toggle("active", item === button));
    const data = await fetchLeaderboard();
    state.leaderboard = data.leaderboard;
    state.competition = data.competition;
    renderLeaderboard();
  });
});

recordWeightInput.addEventListener("input", syncWeightRangeFromInput);
recordWeightRange?.addEventListener("input", syncWeightInputFromRange);

document.querySelectorAll("[data-unit]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.unit === state.unit) return;
    const input = $("#recordForm")?.elements.weight;
    const kgValue = input?.value ? inputWeightToKg(input.value) : "";
    state.unit = button.dataset.unit;
    localStorage.setItem("weightUnit", state.unit);
    if (input?.value) input.value = inputWeightFromKg(kgValue);
    syncWeightRangeFromInput();
    renderShell();
    renderRecords();
    renderLeaderboard();
  });
});

document.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    const recordContent = event.target.closest(".record-content");
    const recordItem = recordContent?.closest(".record-item");
    if (recordItem) {
      if (recordItem.classList.contains("actions-open")) {
        closeOpenSwipeRecords();
        return;
      }
      const record = findRecordById(recordItem.dataset.recordId, recordItem.dataset.recordOwner || "");
      openRecordDetail(record, recordItem.dataset.recordOwner || "");
      return;
    }
    if (!event.target.closest(".swipe-record")) closeOpenSwipeRecords();
    return;
  }
  closeOpenSwipeRecords(actionButton.closest(".swipe-record"));
  const record = state.records.find((item) => item.id === actionButton.dataset.recordId);
  if (!record) return;
  if (actionButton.dataset.action === "edit-record") {
    recordDate.value = record.date;
    const form = $("#recordForm");
    form.elements.weight.value = inputWeightFromKg(record.weight);
    syncWeightRangeFromInput();
    form.elements.note.value = record.note || "";
    editingRecordId = record.id;
    $("#saveRecordBtn").textContent = "保存修改";
    recordMessage.textContent = "正在编辑已有记录，保存后会覆盖当天数据。";
    closeOpenSwipeRecords();
    switchPage("checkin");
  }
  if (actionButton.dataset.action === "delete-record") {
    pendingDeleteRecordId = record.id;
    $("#deleteModalText").textContent = `确定删除 ${record.date} 的体重记录吗？删除后不能恢复，但可以重新打卡覆盖当天数据。`;
    $("#deleteModal").classList.remove("hidden");
  }
});

let swipeState = null;
let pointerSwipeState = null;
document.addEventListener("touchstart", (event) => {
  const record = event.target.closest(".swipe-record");
  if (!record || event.target.closest("[data-action]")) return;
  const touch = event.touches[0];
  swipeState = {
    record,
    startX: touch.clientX,
    startY: touch.clientY,
    dx: 0,
    isHorizontal: false
  };
}, { passive: true });

document.addEventListener("touchmove", (event) => {
  if (!swipeState) return;
  const touch = event.touches[0];
  const dx = touch.clientX - swipeState.startX;
  const dy = touch.clientY - swipeState.startY;
  swipeState.dx = dx;
  if (!swipeState.isHorizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) {
    swipeState.isHorizontal = true;
    closeOpenSwipeRecords(swipeState.record);
  }
  if (!swipeState.isHorizontal) return;
  event.preventDefault();
  const offset = Math.max(-132, Math.min(0, swipeState.record.classList.contains("actions-open") ? -132 + dx : dx));
  swipeState.record.style.setProperty("--swipe-x", `${offset}px`);
}, { passive: false });

document.addEventListener("touchend", () => {
  if (!swipeState) return;
  const shouldOpen = swipeState.record.classList.contains("actions-open")
    ? swipeState.dx > 56 ? false : true
    : swipeState.dx < -44;
  swipeState.record.classList.toggle("actions-open", shouldOpen);
  swipeState.record.style.removeProperty("--swipe-x");
  swipeState = null;
}, { passive: true });

document.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "mouse") return;
  const record = event.target.closest(".swipe-record");
  if (!record || event.target.closest("[data-action]")) return;
  pointerSwipeState = {
    record,
    startX: event.clientX,
    startY: event.clientY,
    dx: 0,
    isHorizontal: false
  };
}, { passive: true });

document.addEventListener("pointermove", (event) => {
  if (!pointerSwipeState) return;
  const dx = event.clientX - pointerSwipeState.startX;
  const dy = event.clientY - pointerSwipeState.startY;
  pointerSwipeState.dx = dx;
  if (!pointerSwipeState.isHorizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) {
    pointerSwipeState.isHorizontal = true;
    closeOpenSwipeRecords(pointerSwipeState.record);
  }
  if (!pointerSwipeState.isHorizontal) return;
  event.preventDefault();
  const offset = Math.max(-132, Math.min(0, pointerSwipeState.record.classList.contains("actions-open") ? -132 + dx : dx));
  pointerSwipeState.record.style.setProperty("--swipe-x", `${offset}px`);
}, { passive: false });

document.addEventListener("pointerup", () => {
  if (!pointerSwipeState) return;
  const shouldOpen = pointerSwipeState.record.classList.contains("actions-open")
    ? pointerSwipeState.dx > 56 ? false : true
    : pointerSwipeState.dx < -44;
  pointerSwipeState.record.classList.toggle("actions-open", shouldOpen);
  pointerSwipeState.record.style.removeProperty("--swipe-x");
  pointerSwipeState = null;
}, { passive: true });

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  authMessage.textContent = "";
  try {
    const data = await api("/api/login", { method: "POST", body: JSON.stringify(formData(event.currentTarget)) });
    state.user = data.user;
    state.stats = data.stats;
    await refreshAll();
  } catch (error) {
    authMessage.textContent = error.message;
  }
});

$("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  authMessage.textContent = "";
  try {
    const data = await api("/api/register", { method: "POST", body: JSON.stringify(formData(event.currentTarget)) });
    state.user = data.user;
    state.stats = data.stats;
    await refreshAll();
  } catch (error) {
    authMessage.textContent = error.message;
  }
});

$("#recordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  recordMessage.textContent = "";
  try {
    const payload = formData(event.currentTarget);
    payload.weight = inputWeightToKg(payload.weight);
    await api("/api/records", { method: "POST", body: JSON.stringify(payload) });
    const wasEditing = Boolean(editingRecordId);
    recordMessage.textContent = wasEditing ? "已修改。" : "已保存，排行榜刷新了。";
    if (rankDate) rankDate.value = recordDate.value;
    resetRecordForm();
    await refreshAll();
    switchPage(wasEditing ? (previousPageBeforeCheckin || "home") : "rank");
  } catch (error) {
    recordMessage.textContent = error.message;
  }
});

$("#backFromRecordBtn")?.addEventListener("click", closeRecordPage);
$("#cancelRecordBtn").addEventListener("click", closeRecordPage);

rankDate?.addEventListener("change", async () => {
  const data = await fetchLeaderboard();
  state.leaderboard = data.leaderboard;
  state.competition = data.competition;
  renderLeaderboard();
});

$("#competitionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("#competitionMessage");
  message.textContent = "";
  try {
    const data = await api("/api/competition", { method: "PATCH", body: JSON.stringify(formData(event.currentTarget)) });
    state.competition = data.competition;
    message.textContent = "比赛设置已保存";
    await refreshAll();
  } catch (error) {
    message.textContent = error.message;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" });
  state.user = null;
  state.stats = null;
  renderShell();
});

$("#seedBtn")?.addEventListener("click", async () => {
  await api("/api/dev/seed", { method: "POST", body: "{}" });
  await refreshAll();
  switchPage("stats");
});

$("#profileAvatar").addEventListener("click", openAvatarSource);
$("#profileAvatar").addEventListener("touchend", (event) => {
  event.preventDefault();
  openAvatarSource(event);
}, { passive: false });

document.querySelectorAll("[data-profile-action]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.profileAction === "profile") openProfileEdit();
    if (button.dataset.profileAction === "competition") switchPage("competitionSettings");
    if (button.dataset.profileAction === "rules") $("#rulesModal").classList.remove("hidden");
  });
});

$("#backProfileBtn").addEventListener("click", () => switchPage("profile"));

$("#cancelDeleteBtn").addEventListener("click", closeDeleteModal);
$("#deleteModal").addEventListener("click", (event) => {
  if (event.target.id === "deleteModal") closeDeleteModal();
});

$("#confirmDeleteBtn").addEventListener("click", async () => {
  if (!pendingDeleteRecordId) return closeDeleteModal();
  const recordId = pendingDeleteRecordId;
  closeDeleteModal();
  await api(`/api/records/${encodeURIComponent(recordId)}`, { method: "DELETE" });
  closeOpenSwipeRecords();
  await refreshAll();
});

$("#closeRecordDetailBtn").addEventListener("click", closeRecordDetail);
$("#recordDetailModal").addEventListener("click", (event) => {
  if (event.target.id === "recordDetailModal") closeRecordDetail();
});

$("#saveProfileBtn").addEventListener("click", async () => {
  const message = $("#profileEditMessage");
  message.textContent = "";
  try {
    const data = await api("/api/me", { method: "PATCH", body: JSON.stringify({ name: $("#profileNameInput").value }) });
    state.user = data.user;
    state.stats = data.stats;
    closeProfileEdit();
    renderShell();
    renderRecords();
    renderLeaderboard();
  } catch (error) {
    message.textContent = error.message;
  }
});
$("#profileEditModal").addEventListener("click", (event) => {
  if (event.target.id === "profileEditModal") closeProfileEdit();
});

function triggerAvatarPicker(input) {
  closeAvatarSource();
  window.setTimeout(() => {
    input.value = "";
    input.click();
  }, 120);
}

$("#uploadAvatarBtn").addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  closeAvatarSource();
  triggerAvatarPicker(avatarInput);
});
$("#cameraAvatarBtn").addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  closeAvatarSource();
  triggerAvatarPicker(avatarCameraInput);
});
$("#cancelAvatarSourceBtn").addEventListener("click", closeAvatarSource);
$("#avatarSourceModal").addEventListener("click", (event) => {
  if (event.target.id === "avatarSourceModal") closeAvatarSource();
});
avatarZoom.addEventListener("input", renderAvatarEditor);
avatarCanvas.addEventListener("pointerdown", startAvatarDrag);
avatarCanvas.addEventListener("pointermove", moveAvatarDrag);
avatarCanvas.addEventListener("pointerup", endAvatarDrag);
avatarCanvas.addEventListener("pointercancel", endAvatarDrag);
$("#cancelAvatarEditBtn").addEventListener("click", closeAvatarEditor);
$("#saveAvatarBtn").addEventListener("click", saveEditedAvatar);
$("#avatarEditorModal").addEventListener("click", (event) => {
  if (event.target.id === "avatarEditorModal") closeAvatarEditor();
});

$("#closeRulesBtn").addEventListener("click", () => $("#rulesModal").classList.add("hidden"));
$("#rulesModal").addEventListener("click", (event) => {
  if (event.target.id === "rulesModal") $("#rulesModal").classList.add("hidden");
});

async function handleAvatarFile(file, input) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("请选择图片文件");
    input.value = "";
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    alert("图片太大，请选择 8MB 以内的图片");
    input.value = "";
    return;
  }
  const avatar = await readFileAsDataUrl(file);
  openAvatarEditor(avatar);
  input.value = "";
}

avatarInput.addEventListener("change", () => handleAvatarFile(avatarInput.files?.[0], avatarInput));
avatarCameraInput.addEventListener("change", () => handleAvatarFile(avatarCameraInput.files?.[0], avatarCameraInput));

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取头像失败"));
    reader.readAsDataURL(file);
  });
}

api("/api/me")
  .then((data) => {
    state.user = data.user;
    state.stats = data.stats;
    return refreshAll();
  })
  .catch(() => renderShell());

document.addEventListener("gesturestart", (event) => event.preventDefault(), { passive: false });
document.addEventListener("gesturechange", (event) => event.preventDefault(), { passive: false });
document.addEventListener("gestureend", (event) => event.preventDefault(), { passive: false });

let lastTouchEnd = 0;
document.addEventListener("touchend", (event) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 320) {
    event.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });
