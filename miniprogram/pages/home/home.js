const api = require("../../utils/api");
const fmt = require("../../utils/format");

Page({
  data: {
    user: {},
    stats: {},
    latestWeight: "--",
    totalLoss: "--",
    targetWeight: "--",
    progressText: "距离目标还有 --",
    progress: 0,
    records: [],
    openRecordId: "",
    touchStartX: 0
  },

  onShow() {
    this.syncTabBar();
    this.load();
  },

  syncTabBar() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  async load() {
    try {
      const [me, records] = await Promise.all([api.getMe(), api.getRecords()]);
      getApp().globalData.user = me.user;
      getApp().globalData.stats = me.stats;
      const progress = this.calcProgress(me.user, me.stats);
      this.setData({
        user: me.user,
        stats: me.stats,
        latestWeight: fmt.kg(me.stats.latestWeight),
        totalLoss: fmt.signedKg(me.stats.totalLoss),
        targetWeight: fmt.kg(me.user.targetWeight),
        progress: progress.value,
        progressText: progress.text,
        openRecordId: "",
        records: records.mine.slice(0, 7).map((item) => ({ ...item, weightText: fmt.kg(item.weight) }))
      });
    } catch (error) {
      wx.redirectTo({ url: "/pages/auth/auth" });
    }
  },

  calcProgress(user, stats) {
    const start = Number(user.startWeight);
    const target = Number(user.targetWeight);
    const latest = Number(stats.latestWeight);
    if (!start || !target || !latest || start === target) return { value: 0, text: "设置目标后开始追踪进度" };
    const value = Math.max(0, Math.min(100, Math.abs(start - latest) / Math.abs(start - target) * 100));
    return { value: value.toFixed(0), text: `已完成 ${value.toFixed(0)}%，距离目标 ${Math.abs(latest - target).toFixed(1)}kg` };
  },

  onRecordTouchStart(event) {
    this.setData({ touchStartX: event.changedTouches[0].clientX });
  },

  onRecordTouchEnd(event) {
    const endX = event.changedTouches[0].clientX;
    const deltaX = endX - this.data.touchStartX;
    const id = event.currentTarget.dataset.id;
    if (deltaX < -35) {
      this.setData({ openRecordId: id });
    } else if (deltaX > 25) {
      this.setData({ openRecordId: "" });
    }
  },

  closeActions() {
    if (this.data.openRecordId) this.setData({ openRecordId: "" });
  },

  editRecord(event) {
    const record = this.data.records.find((item) => item.id === event.currentTarget.dataset.id);
    if (!record) return;
    wx.setStorageSync("editingRecord", {
      id: record.id,
      date: record.date,
      weight: record.weight,
      note: record.note || ""
    });
    wx.switchTab({ url: "/pages/checkin/checkin" });
  },

  confirmDelete(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: "删除记录",
      content: "确定删除这条体重记录吗？",
      confirmText: "删除",
      confirmColor: "#d94f4f",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.deleteRecord(id);
          wx.showToast({ title: "已删除" });
          this.load();
        } catch (error) {
          wx.showModal({
            title: "删除失败",
            content: error.message || "请稍后再试",
            showCancel: false
          });
        }
      }
    });
  }
});
