const meal = require('../../services/meal-order');
const reservations = require('../../services/reservation');
const activitySignups = require('../../services/activity-signup');
const assets = require('../../config/assets').assets;
const auth = require('../../services/auth');

const mealStatus = { preparing:'制作中', completed:'已完成' };
const reservationStatus = { pending_payment:'待支付', paid_pending_confirmation:'已支付，待确认', pending_confirmation:'待确认', confirmed:'已确认', completed:'已完成' };
const activityStatus = { pending_confirmation:'待确认', confirmed:'已确认', completed:'已完成', cancelled:'已取消' };
reservationStatus.refunding = '退款处理中';
reservationStatus.refunded = '已退款';
const ACCOMMODATION_IMAGE = assets.rooms.accommodation;
const DINING_IMAGE = assets.rooms.dining;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function amountText(order) {
  const amount = order.type === 'meal'
    ? (order.checkout_amount || order.regular_total_amount || order.total_amount)
    : order.amount;
  return order.type === 'activity' && !amount ? '免费' : `¥${amount}`;
}

function mealItems(order) {
  return asArray(order.all_items || order.items).map((item) => {
    return {
      id: item.item_id,
      image: item.image || item.image_url || '',
      name: item.name || '商品',
      meta: `¥${item.price} × ${item.quantity}`,
    };
  });
}

function reservationItems(order) {
  const orderNo = order.order_no || order.order_id;
  const displayItems = asArray(order.display_items);
  if (displayItems.length) return displayItems.map((item) => ({
    id: item.id || item.room_id || orderNo,
    image: item.image || item.image_url || (order.reservation_type === 'dining' ? DINING_IMAGE : ACCOMMODATION_IMAGE),
    name: item.name || item.title || (order.reservation_type === 'dining' ? '用餐预订' : '住宿预订'),
    meta: item.meta || item.category || '',
  }));
  const roomSnapshots = asArray(order.room_snapshots);
  if (order.reservation_type === 'dining') {
    const standard = order.meal_standard_snapshot || {};
    const firstRoom = roomSnapshots[0] || {};
    return [{
      id: orderNo,
      image: firstRoom.image || firstRoom.image_url || standard.image || standard.image_url || DINING_IMAGE,
      name: asArray(roomSnapshots).map((room) => room.name).filter(Boolean).join('、') || order.room_name || '用餐预订',
      meta: standard.name ? `${standard.name}餐标 · ${order.people_count} 位` : `${order.people_count} 位用餐`,
    }];
  }
  const items = roomSnapshots.map((room) => ({
    id: room.room_id,
    image: room.image || room.image_url || ACCOMMODATION_IMAGE,
    name: room.name,
    meta: room.category,
  }));
  return items.length ? items : [{ id:orderNo, image:ACCOMMODATION_IMAGE, name:'住宿预订', meta:`${order.people_count} 位入住` }];
}

function addPreview(card, count, unit) {
  card.preview_item=card.display_items[0]||null;
  card.preview_name=card.preview_item
    ? `${card.preview_item.name}${count>1?` 等 ${count} ${unit}`:''}`
    : '';
  card.can_delete=true;
  return card;
}

function isMealPayable(order) {
  return order.payment_status === 'unpaid';
}

function isReservationPayable(order) {
  return order.customer_type !== 'member'
    && order.reservation_status === 'pending_payment'
    && order.payment_status === 'pending_wechat_pay';
}

function isActivityPayable(signup) {
  return signup.customer_type !== 'member' && signup.payment_status === 'pending_wechat_pay';
}

function mealOrderStatus(order) {
  const status = order.order_status || order.kitchen_status || '';
  if (
    ['pending_notice', 'kitchen_notified'].includes(status)
    && ['settled', 'offline_pending'].includes(order.payment_status)
  ) {
    return 'preparing';
  }
  return status;
}

Page({
  data:{tab:'all',orders:[],shown:[],navTop:28,navHeight:32},
  onLoad(){this.setNavigationMetrics();},
  setNavigationMetrics(){
    const windowInfo=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();
    let navTop=(windowInfo.statusBarHeight||20)+6;
    let navHeight=32;
    try{
      const capsule=wx.getMenuButtonBoundingClientRect();
      if(capsule&&capsule.top&&capsule.height){
        navTop=capsule.top;
        navHeight=capsule.height;
      }
    }catch(error){}
    this.setData({navTop,navHeight});
  },
  async onShow(){
    const [rawMealOrders,rawBookOrders,rawSignupOrders]=await Promise.all([
      meal.listMealOrders(),
      reservations.listReservations(),
      activitySignups.listSignups(),
    ]);
    const mealOrders=asArray(rawMealOrders);
    const bookOrders=asArray(rawBookOrders);
    const signupOrders=asArray(rawSignupOrders);
    const meals=mealOrders.map((order)=>{
      const orderNo=order.order_no||order.order_id;
      const card=Object.assign({},order,{
        order_no:orderNo,
        type:'meal',
        detail_id:orderNo,
        label:'点餐订单',
        action_text:'查看详情',
        can_pay:isMealPayable(order),
        status_text:mealStatus[mealOrderStatus(order)]||mealOrderStatus(order),
        summary:`桌号 ${order.table_id} · ${order.people_count} 位用餐`,
        display_items:mealItems(order),
      });
      card.amount_text=amountText(card);
      return addPreview(card,asArray(order.all_items || order.items).reduce((sum,item)=>sum+item.quantity,0),'件商品');
    });
    const books=bookOrders.map((order)=>{
      const orderNo=order.order_no||order.order_id;
      const card=Object.assign({},order,{
        order_no:orderNo,
        type:'reservation',
        detail_id:orderNo,
        label:order.reservation_type==='dining'?'用餐预订':'住宿预订',
        action_text:'查看详情',
        can_pay:isReservationPayable(order),
        status_text:reservationStatus[order.reservation_status]||order.reservation_status,
        summary:order.reservation_type==='dining'?`${order.date} · ${order.people_count} 位用餐`:`${order.check_in_date} 至 ${order.check_out_date} · ${order.nights} 晚`,
        display_items:reservationItems(order),
      });
      card.amount_text=amountText(card);
      return addPreview(card,card.display_items.length,'个房间');
    });
    const activities=signupOrders.map((signup)=>{
      const orderNo=signup.order_no||signup.signup_id;
      const card=Object.assign({},signup,{
        type:'activity',
        order_no:orderNo,
        detail_id:signup.activity_id,
        label:'活动报名',
        action_text:'查看活动',
        can_pay:isActivityPayable(signup),
        status_text:activityStatus[signup.signup_status]||signup.signup_status,
        summary:`${signup.date} · ${signup.people_count} 人报名`,
        display_items:asArray(signup.display_items).length
          ? signup.display_items
          : [{id:signup.activity_id,image:signup.image || signup.image_url,name:signup.title,meta:`${signup.time} · ${signup.location}`}],
      });
      card.amount_text=amountText(card);
      return addPreview(card,1,'个活动');
    });
    const orders=meals.concat(books,activities).sort((a,b)=>String(b.created_at || '').localeCompare(String(a.created_at || '')));
    this.setData({orders});
    this.filter();
  },
  tab(e){this.setData({tab:e.currentTarget.dataset.tab});this.filter();},
  filter(){const tab=this.data.tab;this.setData({shown:this.data.orders.filter(o=>tab==='all'||o.type===tab)});},
  detail(e){
    const id=e.currentTarget.dataset.id;
    const type=e.currentTarget.dataset.type;
    if(type==='activity')return wx.navigateTo({url:`/pages/activity/activity?id=${id}`});
    wx.navigateTo({url:type==='meal'?`/pages/order-detail/order-detail?id=${id}`:`/pages/reservation-detail/reservation-detail?id=${id}`});
  },
  async pay(e){
    const id=e.currentTarget.dataset.id;
    const type=e.currentTarget.dataset.type;
    try{
      let payResult = null;
      if(type==='meal')payResult=await this.payMeal(id);
      if(type==='reservation')await this.payReservation(id);
      if(type==='activity')await this.payActivity(id);
      await this.onShow();
      if(payResult&&payResult.memberPendingVerify){
        wx.showToast({title:'已提交抵扣，待店员核销'});
        return;
      }
      wx.showToast({title:'支付完成'});
    }catch(error){
      wx.showToast({title:error.message||'支付未完成',icon:'none'});
    }
  },
  async payMeal(orderNo){
    const user=await auth.getCurrentUser();
    const isMember=user.customer_type==='member'||Boolean(user.member_id);
    const order=this.data.orders.find((item)=>item.type==='meal'&&item.order_no===orderNo)||{};
    const pointsAmount=Number(order.member_total_amount||order.checkout_amount||order.regular_total_amount||order.total_amount||0)||0;
    if(isMember){
      const confirmed=await new Promise((resolve)=>{
        wx.showModal({
          title:'确认积分抵扣',
          content:`确认使用会员积分抵扣本次消费 ¥${pointsAmount}？`,
          confirmText:'确认抵扣',
          cancelText:'暂不结账',
          confirmColor:'#8B3A2F',
          success:(result)=>resolve(Boolean(result.confirm)),
          fail:()=>resolve(false),
        });
      });
      if(!confirmed)throw new Error('已取消结账');
    }
    const paymentResult=await meal.checkoutMealOrder({
      order_no:orderNo,
      use_points:isMember,
      points_deduct_amount:isMember?pointsAmount:0,
      member_checkout_confirmed:isMember,
    });
    const payment=paymentResult.payment||paymentResult.raw_payment||paymentResult;
    if(!payment||!payment.timeStamp)return {memberPendingVerify:isMember};
    try{
      await this.requestPayment(payment);
    }catch(error){
      const isCancel=error&&error.message&&error.message.includes('取消');
      if(isCancel){
        try{await meal.cancelMealOrder({order_no:orderNo,reason:'payment_cancelled'});}catch(e){console.warn('cancelMealOrder failed',e);}
      }
      throw error;
    }
    return {paid:true};
  },
  async payReservation(orderNo){
    const paymentResult=await reservations.createReservationPayment({order_no:orderNo});
    const payment=paymentResult.payment||paymentResult.raw_payment||paymentResult;
    await this.requestPayment(payment);
  },
  async payActivity(orderNo){
    const paymentResult=await activitySignups.createActivityPayment({order_no:orderNo});
    const payment=paymentResult.payment||paymentResult.raw_payment||paymentResult;
    await this.requestPayment(payment);
  },
  requestPayment(payment){
    return new Promise((resolve,reject)=>{
      wx.requestPayment(Object.assign({},payment,{
        success:resolve,
        fail:(error)=>{
          const message=error&&error.errMsg&&error.errMsg.includes('cancel')?'支付已取消':((error&&error.errMsg)||'微信支付失败');
          reject(new Error(message));
        },
      }));
    });
  },
  async remove(e){
    const id=e.currentTarget.dataset.id;
    const type=e.currentTarget.dataset.type;
    const ok=await new Promise(resolve=>wx.showModal({title:'删除订单',content:'是否删除，删除后无法恢复',confirmText:'删除',confirmColor:'#8B3A2F',success:(result)=>resolve(result.confirm)}));
    if(!ok)return;
    try{
      if(type==='meal')await meal.deleteMealOrder({order_no:id});
      if(type==='reservation')await reservations.deleteReservation({order_no:id});
      if(type==='activity')await activitySignups.deleteSignup({order_no:id});
      await this.onShow();
      wx.showToast({title:'已删除'});
    }catch(error){
      wx.showToast({title:error.message||'删除失败',icon:'none'});
    }
  },
  goBack(){wx.navigateBack({delta:1,fail:()=>wx.switchTab({url:'/pages/profile/profile'})});},
});
