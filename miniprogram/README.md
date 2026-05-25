# 轻盈计划微信小程序版

这是当前网页项目的原生微信小程序版本，目录独立在 `miniprogram/`，可用微信开发者工具直接导入。

## 运行方式

1. 先启动现有后端：

```bash
node server.js
```

2. 修改 `utils/config.js`：

```js
API_BASE_URL: "http://你的电脑局域网IP:3000"
```

例如：

```js
API_BASE_URL: "http://192.168.31.189:3000"
```

3. 微信开发者工具导入 `miniprogram/` 目录。

4. 开发阶段如果使用 `http://局域网IP:3000`，需要在微信开发者工具中勾选：

`不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书`

正式上线时，后端接口需要部署为 HTTPS，并在小程序后台配置 request 合法域名。

## 页面结构

- `pages/auth`：登录 / 注册
- `pages/home`：首页概览和最近 7 条体重记录
- `pages/stats`：数据统计、趋势图、全部记录
- `pages/checkin`：体重打卡，支持输入和滑动选择
- `pages/rank`：今日排行 / 总排行，按减重比例排序
- `pages/profile`：个人信息、头像、单位、比赛说明
- `pages/competition`：比赛开始日期和比赛天数设置

## 接口复用

小程序复用现有 Node 接口：

- `/api/register`
- `/api/login`
- `/api/logout`
- `/api/me`
- `/api/records`
- `/api/leaderboard`
- `/api/competition`

后续切换 MySQL 时，只要保持这些接口不变，小程序端无需大改。
