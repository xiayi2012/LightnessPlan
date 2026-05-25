const api = require("../../utils/api");
const fmt = require("../../utils/format");

Page({
  data: {
    form: { date: fmt.today(), weight: 60, note: "" },
    unitText: "kg",
    rangeMin: 20,
    rangeMax: 400,
    isEditing: false
  },

  onShow() {
    this.syncTabBar();
    const isJin = fmt.unit() === "jin";
    this.setData({
      unitText: isJin ? "斤" : "kg",
      rangeMin: isJin ? 40 : 20,
      rangeMax: isJin ? 800 : 400
    });
    this.applyEditingRecord();
  },

  syncTabBar() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  onDateChange(event) {
    this.setData({ "form.date": event.detail.value });
  },

  onWeightInput(event) {
    this.setData({ "form.weight": event.detail.value });
  },

  onWeightSlide(event) {
    this.setData({ "form.weight": Number(event.detail.value).toFixed(1) });
  },

  onInput(event) {
    this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value });
  },

  cancel() {
    wx.removeStorageSync("editingRecord");
    this.setData({ isEditing: false });
    wx.switchTab({ url: "/pages/home/home" });
  },

  applyEditingRecord() {
    const record = wx.getStorageSync("editingRecord");
    if (!record) {
      this.setData({ isEditing: false });
      return;
    }
    wx.removeStorageSync("editingRecord");
    const weight = fmt.unit() === "jin" ? Number(record.weight) * 2 : Number(record.weight);
    this.setData({
      isEditing: true,
      form: {
        date: record.date || fmt.today(),
        weight: weight ? weight.toFixed(1) : "",
        note: record.note || ""
      }
    });
  },

  async submit() {
    try {
      wx.showLoading({ title: "保存中" });
      await api.saveRecord({
        date: this.data.form.date,
        weight: fmt.inputToKg(this.data.form.weight),
        note: this.data.form.note
      });
      wx.showToast({ title: this.data.isEditing ? "已修改" : "已保存" });
      const target = this.data.isEditing ? "/pages/home/home" : "/pages/rank/rank";
      this.setData({ isEditing: false });
      wx.switchTab({ url: target });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      wx.hideLoading();
    }
  }
});
