# 轻盈 PK

一个本地运行的减肥记录小应用，支持注册登录、记录每日体重、查看大家的体重数据，并按每天的减重进度排行 PK。

## 运行

```bash
node server.js
```

打开 http://localhost:2458。

## 功能

- 注册/登录个人账号
- 记录每天体重、状态和备注
- 查看自己的记录与累计变化
- 查看所有账号公开的体重记录
- 按日期查看每日减重 PK 排行
- 手机 App 式底部导航：首页、统计、打卡、排行、我的

数据默认保存在 `data/db.json`，适合本机原型和小范围试用。

## 上线存储方案

本地原型使用 JSON 文件，方便直接运行。正式上线建议换成 MySQL：

- 用户表：`users`
- 登录会话表：`sessions`
- 体重记录表：`weight_records`

建表 SQL 已放在 `docs/mysql-schema.sql`。后续部署时可以新增一个 MySQL 存储模块，让现有接口继续保持 `/api/register`、`/api/login`、`/api/records`、`/api/leaderboard` 不变，只替换读写数据的实现。
