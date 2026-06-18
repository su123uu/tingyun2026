const meal = require('../../services/meal-order');
const reservations = require('../../services/reservation');
const activitySignups = require('../../services/activity-signup');
const catalog = require('../../services/catalog');
const assets = require('../../config/assets').assets;

const mealStatus = { pending_payment:'未支付', pending_notice:'订单已提交', kitchen_notified:'订单已提交', preparing:'制作中', completed:'已完成' };
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
  return order.type === 'activity' && !order.amount ? '免费' : `¥${order.amount}`;
}

function mealItems(order, menuItems) {
  return asArray(order.all_items || order.items).map((item) => {
    const menuItem = asArray(menuItems).find((entry) => entry.item_id === item.item_id) || {};
    return {
      id: item.item_id,
      image: item.image || menuItem.image,
      name: item.name || menuItem.name || '商品',
      meta: `¥${item.price} × ${item.quantity}`,
    };
  });
}

function reservationItems(order, rooms, standards) {
  const orderNo = order.order_no || order.order_id;
  const roomIds = asArray(order.room_ids);
  const selectedRooms = asArray(rooms).filter((room) => roomIds.includes(room.room_id));
  if (order.reservation_type === 'dining') {
    const standard = asArray(standards).find((item) => item.meal_standard_id === order.meal_standard_id);
    return [{
      id: orderNo,
      image: selectedRooms[0] && (selectedRooms[0].image || selectedRooms[0].image_url) || standard && (standard.image || standard.image_url) || DINING_IMAGE,
      name: selectedRooms.map((room) => room.name).join('、') || '用餐预订',
      meta: standard ? `${standard.name}餐标 · ${order.people_count} 位` : `${order.people_count} 位用餐`,
    }];
  }
  const items = selectedRooms.map((room) => ({
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
  return order.customer_type !== 'member'
    && order.settlement_status === 'pending_wechat_pay'
    && order.payment_status !== 'settled';
}

function isReservationPayable(order) {
  return order.customer_type !== 'member'
    && order.reservation_status === 'pending_payment'
    && order.settlement_status === 'pending_wechat_pay';
}

function isActivityPayable(signup) {
  return signup.customer_type !== 'member' && signup.settlement_status === 'pending_wechat_pay';
}

function mealOrderStatus(order) {
  const status = order.order_status || order.kitchen_status || '';
  if (
    ['pending_notice', 'kitchen_notified'].includes(status)
    && ['settled', 'pending_offline'].includes(order.payment_status)
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
    const [rawMealOrders,rawBookOrders,rawSignupOrders,rawDiningRooms,rawAccommodationRooms,rawStandards,rawMenuItems]=await Promise.all([
      meal.listMealOrders(),
      reservations.listReservations(),
      activitySignups.listSignups(),
      catalog.listDiningRooms(),
      catalog.listAccommodationRooms(),
      catalog.listDiningStandards(),
      catalog.listMealItems(),
    ]);
    const mealOrders=asArray(rawMealOrders);
    const bookOrders=asArray(rawBookOrders);
    const signupOrders=asArray(rawSignupOrders);
    const diningRooms=asArray(rawDiningRooms);
    const accommodationRooms=asArray(rawAccommodationRooms);
    const standards=asArray(rawStandards);
    const menuItems=asArray(rawMenuItems);
    const rooms=diningRooms.concat(accommodationRooms);
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
        display_items:mealItems(order,menuItems),
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
        display_items:reservationItems(order,rooms,standards),
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
        display_items:[{id:signup.activity_id,image:signup.image_url,name:signup.title,meta:`${signup.time} · ${signup.location}`}],
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
      if(type==='meal')await this.payMeal(id);
      if(type==='reservation')await this.payReservation(id);
      if(type==='activity')await this.payActivity(id);
      await this.onShow();
      wx.showToast({title:'支付完成'});
    }catch(error){
      wx.showToast({title:error.message||'支付未完成',icon:'none'});
    }
  },
  async payMeal(orderNo){
    const paymentResult=await meal.createMealPayment({order_no:orderNo});
    const payment=paymentResult.payment||paymentResult.raw_payment||paymentResult;
    const paymentNo=paymentResult.payment_no||'';
    const batchNo=paymentResult.batch_no||0;
    try{
      await this.requestPayment(payment);
    }catch(error){
      const isCancel=error&&error.message&&error.message.includes('取消');
      if(isCancel){
        try{await meal.cancelMealOrder({order_no:orderNo,payment_no:paymentNo,batch_no:batchNo,reason:'payment_cancelled'});}catch(e){console.warn('cancelMealOrder failed',e);}
      }
      throw error;
    }
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
