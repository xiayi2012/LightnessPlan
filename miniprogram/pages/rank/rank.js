const api = require("../../utils/api");
const fmt = require("../../utils/format");

Page({
  data: {
    mode: "totalLoss",
    leaderboard: [],
    competition: { winner: { user: {} }, loser: { user: {} } },
    winnerScore: "--",
    loserScore: "--"
  },

  onShow() {
    this.syncTabBar();
    this.load();
  },

  syncTabBar() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
  },

  async changeMode(event) {
    this.setData({ mode: event.currentTarget.dataset.mode });
    await this.load();
  },

  async load() {
    try {
      const data = await api.getLeaderboard(fmt.today(), this.data.mode);
      const leaderboard = data.leaderboard.map((item) => ({
        ...item,
        weightText: item.weight !== undefined ? fmt.kg(item.weight) : "",
        percentText: `${Number(this.data.mode === "totalLoss" ? item.totalPercent || 0 : item.percent || 0).toFixed(2)}%`
      }));
      const competition = {
        ...data.competition,
        winner: data.competition.winner || { user: {} },
        loser: data.competition.loser || { user: {} }
      };
      this.setData({
        leaderboard,
        competition,
        winnerScore: competition.winner.totalPercent !== undefined ? `${Number(competition.winner.totalPercent || 0).toFixed(2)}% · ${fmt.signedKg(competition.winner.totalLoss)}` : "--",
        loserScore: competition.loser.totalPercent !== undefined ? `${Number(competition.loser.totalPercent || 0).toFixed(2)}% · ${fmt.signedKg(competition.loser.totalLoss)}` : "--"
      });
    } catch (error) {
      wx.redirectTo({ url: "/pages/auth/auth" });
    }
  }
});
