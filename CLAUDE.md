# 停云山居小程序项目说明

## 项目概览

这是“停云山居”微信小程序项目，包含小程序源码、HTML 原型、设计/需求文档和图片素材。

主要目标：

- 扫码点餐：堂食菜单、购物车、模拟支付、订单记录。
- 预约预订：住宿、用餐、空间等预约展示与咨询入口。
- 山居介绍：品牌、空间、活动信息展示。
- 会员中心：会员权益、积分/消费等模拟数据展示。

## 目录结构

- `tingyun2026/`：微信小程序源码目录，使用 TDesign Miniprogram 组件。
- `tingyun2026/app.json`：小程序页面、tabBar、全局组件配置。
- `tingyun2026/pages/home/`：首页。
- `tingyun2026/pages/menu/`：扫码点餐/菜单。
- `tingyun2026/pages/intro/`：山居介绍。
- `tingyun2026/pages/orders/`：订单列表。
- `tingyun2026/pages/profile/`：个人中心/会员。
- `tingyun2026/pages/booking/`：预约预订。
- `tingyun2026/custom-tab-bar/`：自定义底部导航。
- `tingyun2026/images/`：小程序内使用的图片资源。
- `prototype/`：HTML 原型页面。
- `部分图片/`：原始图片素材。
- `停云山居小程序-需求文档.md`：需求文档。
- `设计规范.md`：视觉与交互设计规范。

## 开发注意事项

- 这是微信小程序项目，优先使用微信开发者工具打开 `tingyun2026/`。
- 页面路径以 `tingyun2026/app.json` 中的 `pages` 为准。
- 组件库主要来自 `tingyun2026/miniprogram_npm/tdesign-miniprogram/`。
- 原型页面位于 `prototype/`，可用于对照小程序页面布局和交互。
- 中文文件名和图片素材是项目内容的一部分，不要随意重命名。

## Git 与隐私

仓库已配置 `.gitignore`，用于避免提交本地私有配置和临时文件：

- `**/project.private.config.json`
- `**/.cloudbase/container/debug.json`
- `.env`
- `.env.*`
- `node_modules/`
- `dist/`
- `build/`
- 系统/编辑器缓存文件

`.gitignore` 本身不是隐私文件，它只是告诉 Git 哪些文件不要提交。

如果之后新增真实密钥、token、账号密码、云开发密钥等，请放到 `.env` 或本地私有配置里，不要写进源码、文档或已跟踪文件。

## 当前远端

GitHub 仓库：

`https://github.com/su123uu/tingyun2026`
