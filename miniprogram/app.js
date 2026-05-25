const { getMe } = require("./utils/api");

App({
  globalData: {
    user: null,
    stats: null,
    unit: wx.getStorageSync("weightUnit") || "kg"
  },

  async onLaunch() {
    const token = wx.getStorageSync("sessionCookie");
    if (!token) return;
    try {
      const data = await getMe();
      this.globalData.user = data.user;
      this.globalData.stats = data.stats;
    } catch (error) {
      wx.removeStorageSync("sessionCookie");
    }
  }
});
