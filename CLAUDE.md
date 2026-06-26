# 停云山居小程序项目说明
客服电话：15192670475
## 项目概览

这是“停云山居”微信小程序项目，包含小程序源码、HTML 原型、设计/需求文档和图片素材。

主要目标：

- 扫码点餐：桌码开台、首单/加菜、整桌双价格、订单详情统一结账。
- 预约预订：住宿、用餐、空间等预约展示与咨询入口。
- 山居介绍：品牌、空间、活动信息展示。
- 会员中心：手机号匹配、会员权益、线下核销状态与会员活动展示。

## 开发注意事项

- 这是微信小程序项目，优先使用微信开发者工具打开 `tingyun2026/`。
- 页面路径以 `tingyun2026/app.json` 中的 `pages` 为准。
- 组件库来自 `tdesign-miniprogram`；依赖变更后先执行 `npm ci`，再在微信开发者工具中执行“构建 npm”生成 `miniprogram_npm/`。
- 原型页面位于 `prototype/`，可用于对照小程序页面布局和交互。
- 中文文件名和图片素材是项目内容的一部分，不要随意重命名。

## 页面顶部统一规范

后续修改业务页面顶部时，默认去除微信自带标题栏，使用自定义顶部。页面 JSON 使用：

```json
{ "navigationStyle": "custom" }
```

页面 JS 在 `data` 中保留 `navTop: 28, navHeight: 32`，并在 `onLoad()` 调用 `setNavigationMetrics()`。顶部高度优先读取微信右上角胶囊按钮，失败时使用状态栏高度兜底：

```js
setNavigationMetrics() {
  const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  let navTop = (windowInfo.statusBarHeight || 20) + 6;
  let navHeight = 32;
  try {
    const capsule = wx.getMenuButtonBoundingClientRect();
    if (capsule && capsule.top && capsule.height) {
      navTop = capsule.top;
      navHeight = capsule.height;
    }
  } catch (error) {}
  this.setData({ navTop, navHeight });
}
```

按页面用途选择顶部形态：

- 一级 Tab 页面：标题与胶囊同高，副标题放在下方。参考 `tingyun2026/pages/menu/menu`、`tingyun2026/pages/booking/booking`。
- 二级列表页面：顶部增加返回按钮；标题区和筛选栏整体吸顶。参考 `tingyun2026/pages/orders/orders`。
- 带封面的二级表单页面：顶部增加返回按钮；封面头部随滚动收缩，收缩后保留胶囊安全区。参考 `tingyun2026/pages/booking-dining/booking-dining`、`tingyun2026/pages/booking-accommodation/booking-accommodation`。

通用约束：

- 标题区域右侧预留约 `188rpx`，避免文字进入胶囊按钮区域。
- 二级页面返回失败时，回退到对应一级 Tab 页面。
- 需要筛选的列表页将标题区与筛选栏放入 `position: sticky; top: 0;` 容器。
- 后续用户说“顶部按统一规范改”时，直接按以上规则修改，不再保留系统标题栏。

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

## Deployment Ownership

- Cloud functions are deployed manually by the project owner. Do not deploy cloud functions from the coding agent.
- The coding agent may modify cloud-function code and run local checks, then report the functions that require manual deployment.
