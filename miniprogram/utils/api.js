const { API_BASE_URL } = require("./config");

function request(path, options = {}) {
  const cookie = wx.getStorageSync("sessionCookie");
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${path}`,
      method: options.method || "GET",
      data: options.data || undefined,
      header: {
        "content-type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options.header || {})
      },
      success(res) {
        const setCookie = res.header["Set-Cookie"] || res.header["set-cookie"];
        const rawCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
        if (rawCookie) wx.setStorageSync("sessionCookie", rawCookie.split(";")[0]);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data || {});
        } else {
          reject(new Error((res.data && res.data.error) || "请求失败"));
        }
      },
      fail(error) {
        const isLocalhost = API_BASE_URL.includes("127.0.0.1") || API_BASE_URL.includes("localhost");
        reject(new Error(isLocalhost ? "手机无法访问 127.0.0.1，请改成电脑局域网 IP" : (error.errMsg || "网络连接失败，请确认后端已启动且手机和电脑在同一局域网")));
      }
    });
  });
}

module.exports = {
  request,
  login: (data) => request("/api/login", { method: "POST", data }),
  register: (data) => request("/api/register", { method: "POST", data }),
  logout: () => request("/api/logout", { method: "POST", data: {} }),
  getMe: () => request("/api/me"),
  updateMe: (data) => request("/api/me", { method: "PATCH", data }),
  getRecords: () => request("/api/records"),
  saveRecord: (data) => request("/api/records", { method: "POST", data }),
  deleteRecord: (id) => request(`/api/records/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getLeaderboard: (date, mode = "totalLoss") => request(`/api/leaderboard?date=${encodeURIComponent(date)}&mode=${encodeURIComponent(mode)}`),
  saveCompetition: (data) => request("/api/competition", { method: "PATCH", data }),
  seed: () => request("/api/dev/seed", { method: "POST", data: {} })
};
