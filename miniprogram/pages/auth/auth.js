const api = require("../../utils/api");

Page({
  data: {
    mode: "login",
    loginForm: { account: "", password: "" },
    registerForm: { account: "", name: "", password: "", startWeight: "", targetWeight: "" }
  },

  switchMode(event) {
    this.setData({ mode: event.currentTarget.dataset.mode });
  },

  onLoginInput(event) {
    this.setData({ [`loginForm.${event.currentTarget.dataset.key}`]: event.detail.value });
  },

  onRegisterInput(event) {
    this.setData({ [`registerForm.${event.currentTarget.dataset.key}`]: event.detail.value });
  },

  async submitLogin() {
    try {
      wx.showLoading({ title: "登录中" });
      const data = await api.login(this.data.loginForm);
      getApp().globalData.user = data.user;
      getApp().globalData.stats = data.stats;
      wx.switchTab({ url: "/pages/home/home" });
    } catch (error) {
      wx.hideLoading();
      this.showError(error.message);
    } finally {
      wx.hideLoading();
    }
  },

  async submitRegister() {
    const form = this.data.registerForm;
    const startWeight = Number(form.startWeight);
    const targetWeight = Number(form.targetWeight);
    if (!form.account || !form.name || !form.password || !form.startWeight || !form.targetWeight) {
      this.showError("请先填写完整注册信息");
      return;
    }
    if (!/^[a-z0-9_@.-]{3,32}$/i.test(form.account)) {
      this.showError("账号需为 3-32 位英文、数字或 _ @ . -");
      return;
    }
    if (form.password.length < 6) {
      this.showError("密码至少 6 位");
      return;
    }
    if (!startWeight || !targetWeight || startWeight <= 0 || targetWeight <= 0) {
      this.showError("初始体重和目标体重必须大于 0");
      return;
    }

    try {
      wx.showLoading({ title: "创建中" });
      const data = await api.register({
        ...form,
        startWeight,
        targetWeight
      });
      getApp().globalData.user = data.user;
      getApp().globalData.stats = data.stats;
      wx.switchTab({ url: "/pages/home/home" });
    } catch (error) {
      wx.hideLoading();
      this.showError(error.message);
    } finally {
      wx.hideLoading();
    }
  },

  showError(message) {
    wx.showModal({
      title: "提示",
      content: message || "操作失败，请稍后再试",
      showCancel: false
    });
  }
});
