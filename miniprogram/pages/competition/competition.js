const api = require("../../utils/api");
const fmt = require("../../utils/format");

Page({
  data: {
    form: { startDate: fmt.today(), durationDays: 30 }
  },

  async onLoad() {
    const data = await api.getLeaderboard(fmt.today(), "totalLoss");
    this.setData({
      form: {
        startDate: data.competition.startDate || fmt.today(),
        durationDays: data.competition.durationDays || 30
      }
    });
  },

  onDateChange(event) {
    this.setData({ "form.startDate": event.detail.value });
  },

  onDurationInput(event) {
    this.setData({ "form.durationDays": Number(event.detail.value) });
  },

  async submit() {
    try {
      await api.saveCompetition(this.data.form);
      wx.showToast({ title: "已保存" });
      wx.navigateBack();
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  }
});
