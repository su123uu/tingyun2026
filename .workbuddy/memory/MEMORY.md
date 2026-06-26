# 停云山居小程序 — 项目约定

## 订单快照规范
- 住宿预定、用餐预定、活动报名三类订单创建时，必须写入 `display_items` 数组快照
- 住宿/用餐额外写入 `room_snapshots`（每个房间含 room_id, name, image, image_url, category）
- 用餐额外写入 `meal_standard_snapshot`（含 meal_standard_id, name, price_per_person, image）
- 订单列表 `orders.js` 的 `reservationItems()` 优先读 `display_items`，其次 `room_snapshots`，最后兜底
- 详情页不从资源表重新查询，直接使用订单快照

## 创建链路（每个业务都是云函数优先 + 本地兜底）
- 住宿: `cloudfunctions/reservationManage` → `services/reservation.js`
- 用餐: `cloudfunctions/reservationManage` → `services/reservation.js`
- 活动: `cloudfunctions/activitySignupManage` → `services/activity-signup.js`

## 云函数返回公共体
- `reservationPublicShape(order, type)` 必须包含快照字段
- `signupPublicShape(signup, activity?)` activity 参数可选（快照已包含必要数据）
