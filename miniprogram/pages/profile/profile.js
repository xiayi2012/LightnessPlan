const api = require("../../utils/api");
const fmt = require("../../utils/format");

Page({
  data: {
    user: {},
    stats: {},
    avatarText: "我",
    latestWeight: "--",
    targetWeight: "--",
    totalLoss: "--",
    unit: "kg"
  },

  onShow() {
    this.syncTabBar();
    this.load();
  },

  syncTabBar() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
  },

  async load() {
    try {
      const data = await api.getMe();
      const avatarText = String(data.user.name || "我").slice(0, 2).toUpperCase();
      this.setData({
        user: data.user,
        stats: data.stats,
        avatarText,
        latestWeight: fmt.kg(data.stats.latestWeight),
        targetWeight: fmt.kg(data.user.targetWeight),
        totalLoss: fmt.signedKg(data.stats.totalLoss),
        unit: fmt.unit()
      });
    } catch (error) {
      wx.redirectTo({ url: "/pages/auth/auth" });
    }
  },

  editName() {
    wx.showModal({
      title: "编辑昵称",
      editable: true,
      placeholderText: this.data.user.name,
      success: async (res) => {
        if (!res.confirm || !res.content) return;
        const data = await api.updateMe({ name: res.content });
        getApp().globalData.user = data.user;
        this.load();
      }
    });
  },

  async onChooseAvatar(event) {
    const filePath = await this.compressAvatar(event.detail.avatarUrl);
    const fs = wx.getFileSystemManager();
    const base64 = fs.readFileSync(filePath, "base64");
    const data = await api.updateMe({ avatar: `data:image/jpeg;base64,${base64}` });
    getApp().globalData.user = data.user;
    this.load();
  },

  compressAvatar(src) {
    return new Promise((resolve) => {
      wx.compressImage({
        src,
        quality: 72,
        success: (res) => resolve(res.tempFilePath),
        fail: () => resolve(src)
      });
    });
  },

  setUnit(event) {
    wx.setStorageSync("weightUnit", event.currentTarget.dataset.unit);
    this.load();
  },

  goCompetition() {
    wx.navigateTo({ url: "/pages/competition/competition" });
  },

  showRules() {
    wx.showModal({
      title: "比赛说明",
      content: "比赛周期默认 30 天，可在比赛设置中调整。比赛中只公开排名，结束当天公开最终排行和具体数值。",
      showCancel: false
    });
  },

  async seed() {
    await api.seed();
    wx.showToast({ title: "已生成" });
    this.load();
  },

  async logout() {
    await api.logout();
    wx.removeStorageSync("sessionCookie");
    wx.redirectTo({ url: "/pages/auth/auth" });
  }
});
