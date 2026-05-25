Component({
  data: {
    selected: 0,
    list: [
      { pagePath: "/pages/home/home", text: "首页", icon: "icon-home" },
      { pagePath: "/pages/stats/stats", text: "统计", icon: "icon-stats" },
      { pagePath: "/pages/checkin/checkin", text: "", icon: "icon-plus", main: true },
      { pagePath: "/pages/rank/rank", text: "排行", icon: "icon-rank" },
      { pagePath: "/pages/profile/profile", text: "我的", icon: "icon-user" }
    ]
  },

  methods: {
    switchTab(event) {
      wx.switchTab({ url: event.currentTarget.dataset.path });
    }
  }
});
