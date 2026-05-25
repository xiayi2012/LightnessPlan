const api = require("../../utils/api");
const fmt = require("../../utils/format");

Page({
  data: {
    records: [],
    trend: [],
    firstWeight: "--",
    distanceToGoal: "--",
    avgChange: "--",
    bestDay: "--"
  },

  onShow() {
    this.syncTabBar();
    this.load();
  },

  syncTabBar() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  async load() {
    try {
      const [me, data] = await Promise.all([api.getMe(), api.getRecords()]);
      const records = data.mine.map((item) => ({ ...item, weightText: fmt.kg(item.weight) }));
      const asc = [...data.mine].reverse();
      const first = asc[0];
      const latest = asc[asc.length - 1];
      const diffs = asc.slice(1).map((item, index) => Number((asc[index].weight - item.weight).toFixed(2)));
      const best = diffs.length ? Math.max(...diffs) : 0;
      const avg = asc.length > 1 ? Number((me.stats.totalLoss / (asc.length - 1)).toFixed(2)) : 0;
      this.setData({
        records,
        trend: this.buildTrend(asc.slice(-8)),
        firstWeight: fmt.kg(first && first.weight),
        distanceToGoal: latest ? fmt.kg(Math.abs(latest.weight - me.user.targetWeight)) : "--",
        avgChange: fmt.signedKg(avg),
        bestDay: fmt.signedKg(best)
      }, () => {
        wx.nextTick(() => this.drawTrend());
      });
    } catch (error) {
      wx.redirectTo({ url: "/pages/auth/auth" });
    }
  },

  buildTrend(records) {
    if (!records.length) return [];
    return records.map((item) => ({
      date: item.date,
      shortDate: item.date.slice(5),
      weight: Number(item.weight),
      weightText: fmt.kg(item.weight)
    }));
  },

  drawTrend() {
    const trend = this.data.trend;
    if (!trend.length) return;
    const query = wx.createSelectorQuery().in(this);
    query.select("#trendCanvas").fields({ node: true, size: true }).exec((res) => {
      const canvas = res && res[0] && res[0].node;
      if (!canvas) return;
      const width = res[0].width || 320;
      const height = res[0].height || 160;
      const dpr = wx.getSystemInfoSync().pixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const pad = { left: 18, right: 18, top: 22, bottom: 28 };
      const weights = trend.map((item) => item.weight);
      const min = Math.min(...weights);
      const max = Math.max(...weights);
      const range = max - min || 1;
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;
      const points = trend.map((item, index) => {
        const x = pad.left + (trend.length === 1 ? plotW / 2 : (plotW / (trend.length - 1)) * index);
        const y = pad.top + ((max - item.weight) / range) * plotH;
        return { x, y, item };
      });

      ctx.strokeStyle = "#f0ddd3";
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i += 1) {
        const y = pad.top + (plotH / 3) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
      }

      ctx.strokeStyle = "#e9826e";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();

      points.forEach((point) => {
        ctx.beginPath();
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#e9826e";
        ctx.lineWidth = 3;
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      ctx.fillStyle = "#8b7a72";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      points.forEach((point) => {
        ctx.fillText(point.item.weightText, point.x, Math.max(14, point.y - 10));
      });
    });
  }
});
