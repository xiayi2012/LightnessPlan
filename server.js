const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const SESSION_DAYS = 14;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

let writeQueue = Promise.resolve();

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify({ users: [], records: [], sessions: [] }, null, 2));
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw || "{}");
}

async function writeDb(db) {
  writeQueue = writeQueue.then(() => fs.writeFile(DB_PATH, JSON.stringify(db, null, 2)));
  return writeQueue;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key]) => key)
      .map(([key, value]) => [key, decodeURIComponent(value || "")])
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("请求体过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("JSON 格式不正确"));
      }
    });
    req.on("error", reject);
  });
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeAccount(value) {
  return String(value || "").trim().toLowerCase();
}

function todayInLocalDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function addDays(dateText, offset) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + offset);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function dateDiffInDays(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  return Math.ceil((to - from) / (24 * 60 * 60 * 1000));
}

function isDateText(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.passwordHash, "hex"));
}

function safeUser(user) {
  return {
    id: user.id,
    account: user.account,
    name: user.name,
    startWeight: user.startWeight,
    targetWeight: user.targetWeight,
    avatar: user.avatar || "",
    createdAt: user.createdAt
  };
}

async function getAuthedUser(req, db) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.session || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const now = Date.now();
  db.sessions = db.sessions.filter((session) => new Date(session.expiresAt).getTime() > now);
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  return user || null;
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || String(body[field]).trim() === "") {
      return `${field} 不能为空`;
    }
  }
  return null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function enrichUserRecords(db) {
  const users = new Map(db.users.map((user) => [user.id, safeUser(user)]));
  return db.records
    .map((record) => ({
      ...record,
      user: users.get(record.userId)
    }))
    .filter((record) => record.user)
    .sort((a, b) => `${b.date} ${b.createdAt}`.localeCompare(`${a.date} ${a.createdAt}`));
}

function latestRecordForUser(records, userId, maxDate) {
  return records
    .filter((record) => record.userId === userId && record.date <= maxDate)
    .sort((a, b) => `${b.date} ${b.createdAt}`.localeCompare(`${a.date} ${a.createdAt}`))[0];
}

function previousRecordForUser(records, userId, beforeDate) {
  return records
    .filter((record) => record.userId === userId && record.date < beforeDate)
    .sort((a, b) => `${b.date} ${b.createdAt}`.localeCompare(`${a.date} ${a.createdAt}`))[0];
}

function firstRecordForUser(records, userId, maxDate) {
  return records
    .filter((record) => record.userId === userId && record.date <= maxDate)
    .sort((a, b) => `${a.date} ${a.createdAt}`.localeCompare(`${b.date} ${b.createdAt}`))[0];
}

function buildLeaderboard(db, date, mode = "totalLoss") {
  const items = db.users
    .map((user) => {
      const latest = latestRecordForUser(db.records, user.id, date);
      const first = firstRecordForUser(db.records, user.id, date);
      const previous = latest && latest.date === date
        ? previousRecordForUser(db.records, user.id, date)
        : null;
      if (!latest) return null;

      const dailyLoss = previous ? Number((previous.weight - latest.weight).toFixed(2)) : null;
      const dailyPercent = previous && previous.weight > 0 ? Number(((dailyLoss / previous.weight) * 100).toFixed(2)) : null;
      const totalLoss = first ? Number((first.weight - latest.weight).toFixed(2)) : 0;
      const totalPercent = first && first.weight > 0 ? Number(((totalLoss / first.weight) * 100).toFixed(2)) : 0;

      return {
        user: safeUser(user),
        date,
        weight: latest.weight,
        latestDate: latest.date,
        firstWeight: first?.weight ?? null,
        previousWeight: previous?.weight ?? null,
        loss: dailyLoss,
        percent: dailyPercent,
        totalLoss,
        totalPercent,
        mood: latest.mood,
        note: latest.note
      };
    })
    .filter(Boolean);

  const dailyItems = items.filter((item) => item.latestDate === date && item.previousWeight !== null);
  const sortable = mode === "totalLoss" ? items : dailyItems;
  const sorters = {
    dailyPercent: (a, b) => b.percent - a.percent || b.loss - a.loss || a.weight - b.weight,
    totalLoss: (a, b) => b.totalPercent - a.totalPercent || b.totalLoss - a.totalLoss || a.weight - b.weight
  };
  return sortable.sort(sorters[mode] || sorters.totalLoss);
}

function earliestRecordDate(db, fallbackDate) {
  const datedRecords = db.records
    .filter((record) => isDateText(record.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  return datedRecords[0]?.date || fallbackDate;
}

function ensureCompetitionSettings(db, fallbackDate = todayInLocalDate()) {
  db.settings ||= {};
  db.settings.competition ||= {};
  const settings = db.settings.competition;
  if (!isDateText(settings.startDate)) settings.startDate = earliestRecordDate(db, fallbackDate);
  const durationDays = Number(settings.durationDays);
  settings.durationDays = Number.isInteger(durationDays) && durationDays >= 1 && durationDays <= 365 ? durationDays : 30;
  return settings;
}

function buildCompetition(db, date) {
  const settings = ensureCompetitionSettings(db, date);
  const startDate = settings.startDate;
  const durationDays = settings.durationDays;
  const endDate = addDays(startDate, durationDays - 1);
  const daysLeft = Math.max(0, dateDiffInDays(date, endDate));
  const totalRanking = buildLeaderboard(db, date, "totalLoss");
  const ranked = totalRanking.filter((item) => item.firstWeight !== null);
  return {
    startDate,
    endDate,
    durationDays,
    daysLeft,
    isFinished: date >= endDate,
    winner: ranked[0] || null,
    loser: ranked.length > 1 ? ranked[ranked.length - 1] : null
  };
}

function maskLeaderboardItem(item, currentUserId) {
  if (item.user.id === currentUserId) {
    return {
      ...item,
      own: true
    };
  }
  return {
    user: item.user,
    date: item.date,
    latestDate: item.latestDate,
    hidden: true,
    own: false
  };
}

function maskCompetitionItem(item) {
  return item ? { user: item.user, hidden: true } : null;
}

function privateCompetitionPayload(competition) {
  if (competition.isFinished) return competition;
  return {
    ...competition,
    winner: maskCompetitionItem(competition.winner),
    loser: maskCompetitionItem(competition.loser)
  };
}

function userStats(db, userId) {
  const records = db.records
    .filter((record) => record.userId === userId)
    .sort((a, b) => `${a.date} ${a.createdAt}`.localeCompare(`${b.date} ${b.createdAt}`));
  const first = records[0];
  const latest = records[records.length - 1];
  return {
    totalRecords: records.length,
    firstWeight: first?.weight ?? null,
    latestWeight: latest?.weight ?? null,
    totalLoss: first && latest ? Number((first.weight - latest.weight).toFixed(2)) : 0,
    latestDate: latest?.date ?? null
  };
}

function upsertRecord(db, userId, date, weight, mood = "", note = "") {
  const existing = db.records.find((record) => record.userId === userId && record.date === date);
  const payload = {
    weight: Number(weight.toFixed(2)),
    mood: normalizeName(mood).slice(0, 16),
    note: normalizeName(note).slice(0, 120)
  };
  if (existing) {
    Object.assign(existing, payload, { updatedAt: new Date().toISOString() });
    return existing;
  }
  const record = {
    id: crypto.randomUUID(),
    userId,
    date,
    ...payload,
    createdAt: new Date().toISOString()
  };
  db.records.push(record);
  return record;
}

function ensureMockUser(db, account, name, startWeight, targetWeight) {
  let user = db.users.find((item) => item.account === account);
  if (user) return user;
  const { salt, hash } = hashPassword("123456");
  user = {
    id: crypto.randomUUID(),
    account,
    name,
    startWeight,
    targetWeight,
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  return user;
}

function seedMockData(db, currentUser) {
  const today = todayInLocalDate();
  const users = [
    currentUser,
    ensureMockUser(db, "mock_xiaxia", "夏宜", 80, 68),
    ensureMockUser(db, "mock_alan", "阿澜", 76, 66),
    ensureMockUser(db, "mock_momo", "沫沫", 68, 60),
    ensureMockUser(db, "mock_qing", "青山", 92, 78)
  ];
  const moods = ["轻松", "稳住", "冲刺", "自律", "恢复"];
  users.forEach((user, userIndex) => {
    const start = Number(user.startWeight || 75);
    for (let index = 9; index >= 0; index -= 1) {
      const dayOffset = 9 - index;
      const date = addDays(today, -index);
      const drift = userIndex * 0.16 + Math.sin(dayOffset + userIndex) * 0.18;
      const loss = dayOffset * (0.18 + userIndex * 0.025);
      upsertRecord(db, user.id, date, start - loss + drift, moods[(dayOffset + userIndex) % moods.length], "模拟数据");
    }
  });
}

async function handleApi(req, res, pathname) {
  try {
    const db = await readDb();

    if (req.method === "POST" && pathname === "/api/register") {
      const body = await readBody(req);
      const missing = requireFields(body, ["account", "password", "name", "startWeight", "targetWeight"]);
      if (missing) return json(res, 400, { error: missing });

      const account = normalizeAccount(body.account);
      const name = normalizeName(body.name);
      const password = String(body.password);
      const startWeight = numberOrNull(body.startWeight);
      const targetWeight = numberOrNull(body.targetWeight);
      if (!/^[a-z0-9_@.-]{3,32}$/.test(account)) return json(res, 400, { error: "账号需为 3-32 位英文、数字或 _ @ . -" });
      if (password.length < 6) return json(res, 400, { error: "密码至少 6 位" });
      if (!name || name.length > 24) return json(res, 400, { error: "昵称需为 1-24 个字符" });
      if (!startWeight || !targetWeight || startWeight <= 0 || targetWeight <= 0) return json(res, 400, { error: "体重目标必须是正数" });
      if (db.users.some((user) => user.account === account)) return json(res, 409, { error: "账号已存在" });

      const { salt, hash } = hashPassword(password);
      const user = {
        id: crypto.randomUUID(),
        account,
        name,
        startWeight,
        targetWeight,
        salt,
        passwordHash: hash,
        createdAt: new Date().toISOString()
      };
      db.users.push(user);
      db.records.push({
        id: crypto.randomUUID(),
        userId: user.id,
        date: todayInLocalDate(),
        weight: startWeight,
        mood: "起步",
        note: "注册时的初始体重",
        createdAt: new Date().toISOString()
      });
      const token = crypto.randomBytes(32).toString("hex");
      db.sessions.push({
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
      });
      await writeDb(db);
      res.setHeader("Set-Cookie", `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`);
      return json(res, 201, { user: safeUser(user), stats: userStats(db, user.id) });
    }

    if (req.method === "POST" && pathname === "/api/login") {
      const body = await readBody(req);
      const missing = requireFields(body, ["account", "password"]);
      if (missing) return json(res, 400, { error: missing });

      const user = db.users.find((item) => item.account === normalizeAccount(body.account));
      if (!user || !verifyPassword(String(body.password), user)) return json(res, 401, { error: "账号或密码错误" });
      const token = crypto.randomBytes(32).toString("hex");
      db.sessions.push({
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
      });
      await writeDb(db);
      res.setHeader("Set-Cookie", `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`);
      return json(res, 200, { user: safeUser(user), stats: userStats(db, user.id) });
    }

    if (req.method === "POST" && pathname === "/api/logout") {
      const cookies = parseCookies(req.headers.cookie);
      db.sessions = db.sessions.filter((session) => session.token !== cookies.session);
      await writeDb(db);
      res.setHeader("Set-Cookie", "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
      return json(res, 200, { ok: true });
    }

    const user = await getAuthedUser(req, db);
    if (!user) return json(res, 401, { error: "请先登录" });

    if (req.method === "GET" && pathname === "/api/me") {
      return json(res, 200, { user: safeUser(user), stats: userStats(db, user.id) });
    }

    if (req.method === "PATCH" && pathname === "/api/me") {
      const body = await readBody(req);
      if (body.avatar !== undefined) {
        const avatar = String(body.avatar || "");
        if (avatar && !/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(avatar)) {
          return json(res, 400, { error: "头像格式不正确" });
        }
        if (avatar.length > 512 * 1024) return json(res, 400, { error: "头像图片太大，请换一张小图" });
        user.avatar = avatar;
      }
      if (body.name !== undefined) {
        const name = normalizeName(body.name);
        if (!name || name.length > 24) return json(res, 400, { error: "昵称需为 1-24 个字符" });
        user.name = name;
      }
      await writeDb(db);
      return json(res, 200, { user: safeUser(user), stats: userStats(db, user.id) });
    }

    if (req.method === "PATCH" && pathname === "/api/competition") {
      const body = await readBody(req);
      const settings = ensureCompetitionSettings(db);
      if (body.startDate !== undefined) {
        const startDate = String(body.startDate || "").slice(0, 10);
        if (!isDateText(startDate)) return json(res, 400, { error: "比赛开始日期格式不正确" });
        settings.startDate = startDate;
      }
      if (body.durationDays !== undefined) {
        const durationDays = Number(body.durationDays);
        if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
          return json(res, 400, { error: "比赛天数需要在 1-365 天之间" });
        }
        settings.durationDays = durationDays;
      }
      await writeDb(db);
      return json(res, 200, { competition: privateCompetitionPayload(buildCompetition(db, todayInLocalDate())) });
    }

    if (req.method === "GET" && pathname === "/api/records") {
      return json(res, 200, {
        mine: db.records
          .filter((record) => record.userId === user.id)
          .sort((a, b) => `${b.date} ${b.createdAt}`.localeCompare(`${a.date} ${a.createdAt}`)),
        community: enrichUserRecords(db).slice(0, 100)
      });
    }

    if (req.method === "POST" && pathname === "/api/records") {
      const body = await readBody(req);
      const date = String(body.date || todayInLocalDate()).slice(0, 10);
      const weight = numberOrNull(body.weight);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: "日期格式不正确" });
      if (!weight || weight < 20 || weight > 400) return json(res, 400, { error: "请输入 20-400kg 之间的体重" });

      upsertRecord(db, user.id, date, Number(weight.toFixed(2)), body.mood, body.note);
      await writeDb(db);
      const competition = buildCompetition(db, date);
      const leaderboard = buildLeaderboard(db, date);
      return json(res, 201, {
        ok: true,
        stats: userStats(db, user.id),
        leaderboard: competition.isFinished ? leaderboard : leaderboard.map((item) => maskLeaderboardItem(item, user.id)),
        competition: privateCompetitionPayload(competition)
      });
    }

    const recordDeleteMatch = pathname.match(/^\/api\/records\/([^/]+)$/);
    if (req.method === "DELETE" && recordDeleteMatch) {
      const recordId = recordDeleteMatch[1];
      const record = db.records.find((item) => item.id === recordId && item.userId === user.id);
      if (!record) return json(res, 404, { error: "记录不存在" });
      db.records = db.records.filter((item) => item.id !== recordId);
      await writeDb(db);
      return json(res, 200, { ok: true, stats: userStats(db, user.id) });
    }

    if (req.method === "POST" && pathname === "/api/dev/seed") {
      seedMockData(db, user);
      await writeDb(db);
      return json(res, 201, { ok: true, stats: userStats(db, user.id), date: todayInLocalDate() });
    }

    if (req.method === "GET" && pathname === "/api/leaderboard") {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const date = url.searchParams.get("date") || todayInLocalDate();
      const mode = url.searchParams.get("mode") || "totalLoss";
      const competition = buildCompetition(db, date);
      const leaderboard = buildLeaderboard(db, date, mode);
      return json(res, 200, {
        date,
        mode,
        leaderboard: competition.isFinished ? leaderboard : leaderboard.map((item) => maskLeaderboardItem(item, user.id)),
        competition: privateCompetitionPayload(competition)
      });
    }

    return json(res, 404, { error: "接口不存在" });
  } catch (error) {
    return json(res, 500, { error: error.message || "服务器错误" });
  }
}

async function serveStatic(req, res, pathname) {
  const filePath = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const data = await fs.readFile(normalized);
    const ext = path.extname(normalized).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    const index = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(index);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    return handleApi(req, res, url.pathname);
  }
  return serveStatic(req, res, decodeURIComponent(url.pathname));
});

ensureDb().then(() => {
  server.listen(PORT, () => {
    console.log(`减肥记录应用已启动：http://localhost:${PORT}`);
  });
});
