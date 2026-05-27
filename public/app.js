const state = {
  user: null,
  stats: null,
  records: [],
  community: [],
  leaderboard: [],
  competition: null,
  unit: localStorage.getItem("weightUnit") === "kg" ? "kg" : "jin"
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
const recordsImportInput = $("#recordsImportInput");
const avatarCanvas = $("#avatarCanvas");
const avatarZoom = $("#avatarZoom");
let rankMode = "dailyPercent";
let currentPage = "home";
let previousPageBeforeCheckin = "home";
let editingRecordId = null;
let pendingDeleteRecordId = null;
let detailRecordId = null;
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
  competitionSettings: ["比赛设置", "比赛设置"],
  passwordSettings: ["账号安全", "修改密码"]
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

function unitName() {
  return state.unit === "jin" ? "斤" : "kg";
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
  if (label) label.textContent = `体重 ${unitName()}`;
  const detailLabel = $("#detailWeightLabel");
  if (detailLabel) detailLabel.textContent = `体重 ${unitName()}`;
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

function openModal(selector) {
  const modal = typeof selector === "string" ? $(selector) : selector;
  if (!modal) return;
  modal.classList.remove("is-closing");
  modal.classList.remove("hidden");
}

function closeModal(selector, afterClose) {
  const modal = typeof selector === "string" ? $(selector) : selector;
  if (!modal || modal.classList.contains("hidden")) {
    afterClose?.();
    return;
  }
  modal.classList.add("is-closing");
  window.setTimeout(() => {
    modal.classList.add("hidden");
    modal.classList.remove("is-closing");
    afterClose?.();
  }, 180);
}

function openProfileEdit() {
  $("#profileAccountInput").value = state.user?.account || "";
  $("#profileNameInput").value = state.user?.name || "";
  $("#profileBirthdayInput").value = state.user?.birthday || "";
  $("#profileEditMessage").textContent = "";
  openModal("#profileEditModal");
}

function closeProfileEdit() {
  closeModal("#profileEditModal");
}

function openTargetSettings() {
  $("#targetStartInput").value = inputWeightFromKg(state.user?.startWeight);
  $("#targetGoalInput").value = inputWeightFromKg(state.user?.targetWeight);
  $("#targetStartLabel").textContent = `初始体重 ${unitName()}`;
  $("#targetGoalLabel").textContent = `目标体重 ${unitName()}`;
  $("#targetMessage").textContent = "";
  openModal("#targetModal");
}

function closeTargetSettings() {
  closeModal("#targetModal");
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
  openModal(modal);
}

function closeAvatarSource() {
  closeModal("#avatarSourceModal");
}

function closeAvatarEditor() {
  closeModal("#avatarEditorModal", () => {
    $("#avatarEditMessage").textContent = "";
    avatarEditorImage = null;
    avatarDragState = null;
    avatarCropX = 130;
    avatarCropY = 130;
  });
}

function closeDeleteModal() {
  closeModal("#deleteModal", () => {
    pendingDeleteRecordId = null;
  });
}

function closeRecordDetail() {
  closeModal("#recordDetailModal", () => {
    detailRecordId = null;
    $("#detailMessage").textContent = "";
  });
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
  $("#homeStartWeight").textContent = kg(state.user.startWeight);
  $("#latestWeight").textContent = kg(state.stats.latestWeight);
  $("#homeLatestWeight").textContent = kg(state.stats.latestWeight);
  $("#totalLoss").textContent = cumulativeKg(state.stats.totalLoss);
  $("#targetWeight").textContent = kg(state.user.targetWeight);
  const startWeight = Number(state.user?.startWeight);
  const totalLoss = Number(state.stats?.totalLoss || 0);
  $("#homeLossPercent").textContent = startWeight > 0 ? `${Math.max(0, (totalLoss / startWeight) * 100).toFixed(2)}%` : "--";
  $("#recordDays").textContent = `${state.stats.totalRecords} 天`;
  $("#profileName").textContent = state.user.name;
  $("#profileBirthday").textContent = state.user.birthday ? `出生日期 ${state.user.birthday}` : "点击编辑完善资料";
  renderAvatar();
  $("#desktopCurrentWeight").textContent = `当前体重 ${kg(state.stats.latestWeight)}`;
  $("#desktopTotalLoss").textContent = `累计减重 ${cumulativeKg(state.stats.totalLoss)}`;
  renderGoalProgress();
  updateUnitControls();
}

function renderRecords() {
  const recentHomeRecords = state.records.slice(0, 7);
  const myRecords = $("#myRecords");
  if (myRecords) {
    myRecords.innerHTML = state.records.length
      ? state.records.map((record) => recordCard(record, "", true)).join("")
      : emptyState("还没有记录", "从中间的加号开始第一次体重打卡。");
  }
  const communityRecords = $("#communityRecords");
  if (communityRecords) {
    communityRecords.innerHTML = state.community.length
      ? state.community.map((record) => recordCard(record, record.user.name)).join("")
      : `<div class="empty">大家还没有公开记录</div>`;
  }
  $("#homeRecentRecords").innerHTML = recentHomeRecords.length
    ? recentHomeRecords.map((record) => recordCard(record, "", true)).join("")
    : emptyState("今天从第一条记录开始", "打卡后这里会显示最近 7 天记录。");
  const statsAllRecords = $("#statsAllRecords");
  if (statsAllRecords) {
    statsAllRecords.innerHTML = state.records.length
      ? state.records.map((record) => recordCard(record, "", true)).join("")
      : emptyState("还没有体重记录", "有记录后折线趋势会更清晰。");
  }
  renderStats();
}

function emptyState(title, text = "") {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong>${text ? `<span>${escapeHtml(text)}</span>` : ""}</div>`;
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
    openModal("#avatarEditorModal");
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

function startRecordEdit(record) {
  if (!record) return;
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

function openRecordDetail(record, ownerName = "") {
  if (!record) return;
  detailRecordId = ownerName ? null : record.id;
  const isOwnRecord = !ownerName;
  $("#detailDateInput").value = record.date || today;
  $("#detailWeightInput").value = inputWeightFromKg(record.weight);
  $("#detailNoteInput").value = record.note || "";
  $("#detailTime").textContent = formatRecordTime(record.createdAt);
  $("#detailUpdatedTime").textContent = record.updatedAt ? formatRecordTime(record.updatedAt) : "未修改";
  $("#detailOwner").textContent = ownerName || "";
  $("#detailOwnerRow").classList.toggle("hidden", !ownerName);
  $("#detailWeightLabel").textContent = state.unit === "jin" ? "体重 斤" : "体重 kg";
  $("#detailMessage").textContent = ownerName ? "只能查看其他成员记录，不能修改。" : "";
  ["#detailDateInput", "#detailWeightInput", "#detailNoteInput"].forEach((selector) => {
    $(selector).disabled = !isOwnRecord;
  });
  $("#saveRecordDetailBtn").classList.toggle("hidden", !isOwnRecord);
  openModal("#recordDetailModal");
}

async function saveRecordDetail() {
  if (!detailRecordId) return;
  const message = $("#detailMessage");
  message.textContent = "";
  const originalRecord = state.records.find((item) => item.id === detailRecordId);
  try {
    const payload = {
      date: $("#detailDateInput").value,
      weight: inputWeightToKg($("#detailWeightInput").value),
      note: $("#detailNoteInput").value
    };
    await api("/api/records", { method: "POST", body: JSON.stringify(payload) });
    if (originalRecord && payload.date !== originalRecord.date) {
      await api(`/api/records/${encodeURIComponent(originalRecord.id)}`, { method: "DELETE" });
    }
    closeRecordDetail();
    const isFirstRank = await refreshAfterRecordChange();
    if (isFirstRank) showFirstRankConfetti();
  } catch (error) {
    message.textContent = error.message;
  }
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
  renderCompetitionHistory();
  $("#leaderboard").innerHTML = state.leaderboard.length
    ? state.leaderboard.map((item, index) => {
      const badge = rankBadge(item, index);
      return `
        <article class="rank-item ${item.own ? "own-rank" : ""}">
          <div class="rank-num">${index + 1}</div>
          ${rankAvatar(item.user)}
          <div>
            <div class="rank-name">${escapeHtml(item.user.name)}${badge ? `<span class="rank-badge badge-${Math.min(index + 1, 4)}">${badge}</span>` : ""}</div>
          </div>
        </article>
      `;
    }).join("")
    : emptyState("还没有排行", rankMode === "totalLoss" ? "大家打卡后会在这里看到名次。" : "今日有两次对比记录后会产生排行。");
}

function renderCompetitionHistory() {
  const history = $("#competitionHistory");
  if (!history) return;
  const items = state.competition?.history || [];
  history.innerHTML = items.length
    ? items.map((item) => `
      <article class="history-item">
        <span>${escapeHtml(item.startDate)} 至 ${escapeHtml(item.endDate)}</span>
        <strong>冠军 ${escapeHtml(item.winner?.user?.name || "--")}</strong>
        <p>请客 ${escapeHtml(item.loser?.user?.name || "--")} · ${item.treatDone ? "已请客" : "待请客"}</p>
      </article>
    `).join("")
    : emptyState("还没有比赛历史", "本期比赛结束后会自动生成历史记录。");
}

function rankAvatar(user = {}) {
  if (user.avatar) {
    return `<div class="rank-avatar"><img src="${escapeHtml(user.avatar)}" alt="${escapeHtml(user.name || "头像")}" /></div>`;
  }
  return `<div class="rank-avatar">${escapeHtml(avatarText(user.name))}</div>`;
}

function rankBadge(item, index) {
  if (index === 0) return "减肥王";
  if (index === 1) return "千年老二";
  if (index === 2) return "小菜鸡";
  return "拉完了";
}

function renderCompetition() {
  const competition = state.competition;
  if (!competition) return;
  $("#raceStatus").textContent = competition.isFinished ? "比赛已结束" : "比赛进行中";
  $("#raceTitle").textContent = competition.isFinished ? "最终结果" : "当前赛况";
  $("#raceDateRange").textContent = `${competition.startDate} 至 ${competition.endDate}`;
  $("#raceDaysLeft").textContent = competition.isFinished ? "0" : competition.daysLeft;
  $("#desktopRaceDays").textContent = competition.isFinished ? "比赛已结束" : `剩余 ${competition.daysLeft} 天`;
  $("#desktopLeaderText").textContent = competition.isFinished
    ? `获胜者 ${competition.winner?.user?.name || "--"}，请客候选 ${competition.loser?.user?.name || "--"}`
    : `当前第一 ${competition.winner?.user?.name || "--"}，请客候选 ${competition.loser?.user?.name || "--"}`;
  $("#winnerLabel").textContent = competition.isFinished ? "获胜者" : "当前第一";
  $("#loserLabel").textContent = competition.isFinished ? "请客吃饭" : "请客候选";
  $("#winnerName").textContent = competition.winner?.user?.name || "--";
  $("#winnerScore").textContent = competition.winner
    ? competition.isFinished
      ? `${Number(competition.winner.totalPercent || 0).toFixed(2)}% · ${signedKg(competition.winner.totalLoss)}`
      : ""
    : "--";
  $("#loserName").textContent = competition.loser?.user?.name || "--";
  $("#loserScore").textContent = competition.loser
    ? competition.isFinished
      ? `${Number(competition.loser.totalPercent || 0).toFixed(2)}% · ${signedKg(competition.loser.totalLoss)}`
      : ""
    : "--";
  renderHomeRankBadge();
  const treatButton = $("#treatDoneBtn");
  if (treatButton) {
    treatButton.classList.toggle("hidden", !competition.isFinished || !competition.loser);
    treatButton.textContent = competition.treatDone ? "已请客" : "标记已请客";
  }
  renderCompetitionSettings();
}

function renderHomeRankBadge() {
  const badge = $("#homeRankBadge");
  if (!badge) return;
  const ownIndex = state.leaderboard.findIndex((item) => item.own);
  const rank = ownIndex >= 0 ? ownIndex + 1 : null;
  const rankClass = rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : rank === 3 ? "rank-3" : rank ? "rank-other" : "rank-none";
  badge.className = `home-rank-medal ${rankClass}`;
  badge.innerHTML = `<span>今日</span><strong>${rank ? `第${rank}名` : "--"}</strong>`;
}

function renderCompetitionSettings() {
  const competition = state.competition;
  const startInput = $("#competitionStartDate");
  const durationInput = $("#competitionDurationDays");
  if (!competition || !startInput || !durationInput) return;
  startInput.value = competition.startDate || today;
  durationInput.value = competition.durationDays || 30;
}

async function exportRankReport() {
  const [daily, total] = await Promise.all([
    api(`/api/leaderboard?date=${encodeURIComponent(today)}&mode=dailyPercent`),
    api(`/api/leaderboard?date=${encodeURIComponent(today)}&mode=totalLoss`)
  ]);
  const dailyList = daily.leaderboard || [];
  const totalList = total.leaderboard || [];
  if (!dailyList.length && !totalList.length) {
    alert("暂无可导出的排行数据");
    return;
  }
  const rankLines = (title, list) => [
    title,
    ...(list.length ? list.map((item, index) => `第${index + 1}名：${item.user?.name || "未命名成员"}`) : ["暂无排行"])
  ];
  const lines = [
    "轻盈计划减肥排行报告",
    `生成时间：${new Date().toLocaleString("zh-CN")}`,
    "",
    ...rankLines("今日排行", dailyList),
    "",
    ...rankLines("总排行", totalList),
    "",
    "说明：本报告仅包含排行名次和成员名称，不包含具体体重、减重数或减重比例。"
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `轻盈计划-排行报告-${today}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadTextFile(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportMyRecords() {
  if (!state.records.length) {
    alert("暂无可导出的体重记录");
    return;
  }
  if (!window.confirm("确定导出我的体重记录吗？导出的文件会包含日期、体重和备注。")) return;
  const rows = [["date", "weightKg", "weightDisplay", "note", "createdAt"]];
  state.records
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((record) => rows.push([
      record.date,
      Number(record.weight).toFixed(2),
      kg(record.weight),
      record.note || "",
      record.createdAt || ""
    ]));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  downloadTextFile(`轻盈计划-我的体重记录-${today}.csv`, csv, "text/csv;charset=utf-8");
}

function parseImportedRecords(text, filename = "") {
  if (/\.json$/i.test(filename) || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : data.records || [];
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  const [headerLine, ...bodyLines] = lines;
  const headers = headerLine.split(",").map((item) => item.replace(/^"|"$/g, "").trim());
  return bodyLines.map((line) => {
    const cells = line.match(/("([^"]|"")*"|[^,]+)/g)?.map((cell) => cell.replace(/^"|"$/g, "").replaceAll('""', '"')) || [];
    const item = Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
    const rawWeight = item.weightKg || item.weight || item.weightDisplay || "";
    return {
      date: item.date,
      weight: item.weightKg ? Number(item.weightKg) : inputWeightToKg(String(rawWeight).replace(/[^\d.]/g, "")),
      note: item.note || ""
    };
  });
}

async function importMyRecords(file) {
  if (!file) return;
  const text = await file.text();
  const records = parseImportedRecords(text, file.name);
  const data = await api("/api/records/import", { method: "POST", body: JSON.stringify({ records }) });
  alert(`已导入 ${data.imported} 条记录`);
  recordsImportInput.value = "";
  await refreshAll();
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
  $("#homeProgressText").textContent = `已完成 ${progress.toFixed(0)}%，距离目标 ${kg(distance)}`;
}

function renderStats() {
  const records = [...state.records].sort((a, b) => a.date.localeCompare(b.date));
  renderCharts(records);
}

function predictGoalDate(records) {
  if (records.length < 3) return "--";
  const recent = records.slice(-7);
  const first = recent[0];
  const latest = recent[recent.length - 1];
  const days = Math.max(1, dateDiffDays(first.date, latest.date));
  const dailyLoss = (first.weight - latest.weight) / days;
  const target = Number(state.user?.targetWeight);
  if (!dailyLoss || dailyLoss <= 0 || !target || latest.weight <= target) return "保持即可";
  const daysLeft = Math.ceil((latest.weight - target) / dailyLoss);
  if (!Number.isFinite(daysLeft) || daysLeft > 365) return "暂不可测";
  return `${daysLeft} 天后`;
}

function dateDiffDays(from, to) {
  return Math.max(1, Math.ceil((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000));
}

function renderCharts(records) {
  const recent = records.slice(-10);
  $("#lineChart").innerHTML = recent.length > 1 ? lineChartSvg(recent) : emptyState("趋势正在生成", "至少 2 条记录后显示折线图。");
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
      ${points.map((point, index) => `<circle class="chart-dot" cx="${point.split(",")[0]}" cy="${point.split(",")[1]}" r="4"><title>${records[index].date} · ${kg(records[index].weight)}</title></circle>`).join("")}
      <text class="chart-label" x="${padding}" y="18">${kg(max)}</text>
      <text class="chart-label" x="${padding}" y="${height - 6}">${kg(min)}</text>
      <text class="chart-date-label" x="${padding}" y="${height - 22}">${records[0].date.slice(5)}</text>
      <text class="chart-date-label" x="${width - padding - 36}" y="${height - 22}">${records[records.length - 1].date.slice(5)}</text>
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

async function refreshAfterRecordChange() {
  if (rankDate) rankDate.value = today;
  await refreshAll();
  const daily = await fetchLeaderboard(today, "dailyPercent");
  return Boolean(daily.allCheckedToday) && daily.leaderboard.findIndex((item) => item.own) === 0;
}

function fetchLeaderboard(date = today, mode = rankMode) {
  const params = new URLSearchParams({
    date,
    mode,
    _: String(Date.now())
  });
  return api(`/api/leaderboard?${params.toString()}`);
}

function showFirstRankConfetti() {
  const oldLayer = document.querySelector(".confetti-layer");
  oldLayer?.remove();
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  layer.setAttribute("aria-hidden", "true");
  const card = document.createElement("div");
  card.className = "confetti-card";
  card.innerHTML = "<b>NO.1</b><strong>第一名</strong><span>今天状态很顶，继续稳住</span>";
  layer.appendChild(card);
  const colors = ["#f4c15d", "#e9826e", "#ffd98a", "#ffffff", "#d86e5d"];
  for (let index = 0; index < 72; index += 1) {
    const piece = document.createElement("i");
    piece.style.setProperty("--x", `${Math.random() * 100}vw`);
    piece.style.setProperty("--delay", `${Math.random() * 0.52}s`);
    piece.style.setProperty("--duration", `${2.15 + Math.random() * 1.05}s`);
    piece.style.setProperty("--rotate", `${Math.random() * 360}deg`);
    piece.style.background = colors[index % colors.length];
    piece.className = index % 3 === 0 ? "round" : "";
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 3800);
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
  if (actionButton.dataset.action === "delete-record") {
    pendingDeleteRecordId = record.id;
    $("#deleteModalText").textContent = `确定删除 ${record.date} 的体重记录吗？删除后不能恢复，但可以重新打卡覆盖当天数据。`;
    openModal("#deleteModal");
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
  const offset = Math.max(-72, Math.min(0, swipeState.record.classList.contains("actions-open") ? -72 + dx : dx));
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
  const offset = Math.max(-72, Math.min(0, pointerSwipeState.record.classList.contains("actions-open") ? -72 + dx : dx));
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
    const payload = formData(event.currentTarget);
    payload.startWeight = inputWeightToKg(payload.startWeight);
    payload.targetWeight = inputWeightToKg(payload.targetWeight);
    const data = await api("/api/register", { method: "POST", body: JSON.stringify(payload) });
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
    resetRecordForm();
    const isFirstRank = await refreshAfterRecordChange();
    switchPage(wasEditing ? (previousPageBeforeCheckin || "home") : "rank");
    if (isFirstRank) showFirstRankConfetti();
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

$("#treatDoneBtn")?.addEventListener("click", async () => {
  const done = !state.competition?.treatDone;
  const data = await api("/api/competition/treat", { method: "PATCH", body: JSON.stringify({ done }) });
  state.competition = data.competition;
  renderCompetition();
});

$("#logoutBtn").addEventListener("click", () => openModal("#logoutConfirmModal"));

$("#cancelLogoutBtn").addEventListener("click", () => closeModal("#logoutConfirmModal"));
$("#logoutConfirmModal").addEventListener("click", (event) => {
  if (event.target.id === "logoutConfirmModal") closeModal("#logoutConfirmModal");
});
$("#confirmLogoutBtn").addEventListener("click", async () => {
  closeModal("#logoutConfirmModal");
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
    if (button.dataset.profileAction === "target") openTargetSettings();
    if (button.dataset.profileAction === "password") switchPage("passwordSettings");
    if (button.dataset.profileAction === "rules") openModal("#rulesModal");
    if (button.dataset.profileAction === "backup") openModal("#backupModal");
    if (button.dataset.profileAction === "rankReport") exportRankReport().catch((error) => alert(error.message));
  });
});

$("#backProfileBtn").addEventListener("click", () => switchPage("profile"));
$("#backPasswordProfileBtn").addEventListener("click", () => switchPage("profile"));

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
  await refreshAfterRecordChange();
});

$("#closeRecordDetailBtn").addEventListener("click", closeRecordDetail);
$("#saveRecordDetailBtn").addEventListener("click", saveRecordDetail);
$("#recordDetailForm").addEventListener("submit", (event) => {
  event.preventDefault();
  saveRecordDetail();
});
$("#recordDetailModal").addEventListener("click", (event) => {
  if (event.target.id === "recordDetailModal") closeRecordDetail();
});

$("#saveProfileBtn").addEventListener("click", async () => {
  const message = $("#profileEditMessage");
  message.textContent = "";
  try {
    const payload = {
      name: $("#profileNameInput").value,
      birthday: $("#profileBirthdayInput").value
    };
    const data = await api("/api/me", { method: "PATCH", body: JSON.stringify(payload) });
    if (payload.birthday && data.user?.birthday !== payload.birthday) {
      throw new Error("出生日期未保存成功，请确认正式服务器已更新并重启。");
    }
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

$("#passwordForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("#passwordMessage");
  message.textContent = "";
  try {
    const payload = {
      currentPassword: $("#passwordCurrentInput").value,
      password: $("#passwordNewInput").value
    };
    await api("/api/me", { method: "PATCH", body: JSON.stringify(payload) });
    $("#passwordForm").reset();
    message.textContent = "密码已修改。";
  } catch (error) {
    message.textContent = error.message;
  }
});

recordsImportInput?.addEventListener("change", () => {
  importMyRecords(recordsImportInput.files?.[0]).catch((error) => {
    alert(error.message);
    recordsImportInput.value = "";
  });
});
$("#profileEditModal").addEventListener("click", (event) => {
  if (event.target.id === "profileEditModal") closeProfileEdit();
});

$("#saveTargetBtn")?.addEventListener("click", async () => {
  const message = $("#targetMessage");
  message.textContent = "";
  try {
    const payload = {
      startWeight: inputWeightToKg($("#targetStartInput").value),
      targetWeight: inputWeightToKg($("#targetGoalInput").value)
    };
    const data = await api("/api/me", { method: "PATCH", body: JSON.stringify(payload) });
    state.user = data.user;
    state.stats = data.stats;
    closeTargetSettings();
    renderShell();
    renderStats();
  } catch (error) {
    message.textContent = error.message;
  }
});
$("#targetModal")?.addEventListener("click", (event) => {
  if (event.target.id === "targetModal") closeTargetSettings();
});

$("#exportRecordsBtn")?.addEventListener("click", exportMyRecords);
$("#importRecordsBtn")?.addEventListener("click", () => {
  closeModal("#backupModal", () => recordsImportInput?.click());
});
$("#closeBackupBtn")?.addEventListener("click", () => closeModal("#backupModal"));
$("#backupModal")?.addEventListener("click", (event) => {
  if (event.target.id === "backupModal") closeModal("#backupModal");
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

$("#closeRulesBtn").addEventListener("click", () => closeModal("#rulesModal"));
$("#rulesModal").addEventListener("click", (event) => {
  if (event.target.id === "rulesModal") closeModal("#rulesModal");
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
