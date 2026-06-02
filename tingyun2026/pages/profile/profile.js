const auth = require('../../services/auth');
Page({
  data:{ user:{}, isMember:false, isStaff:false },
  applyUser(user) {
    this.setData({ user, isMember:user.customer_type==='member', isStaff:user.is_staff===true||user.role==='staff' });
  },
  async onShow() {
    if(this.getTabBar()) this.getTabBar().setData({selected:4});
    this.applyUser(await auth.getCurrentUser());
  },
  bindMember() { wx.showModal({ title:'模拟手机号授权', content:'使用测试手机号 13800136688 绑定会员档案。', confirmText:'授权绑定', success:async(result)=>{ if(result.confirm) this.applyUser(await auth.bindMobile({mobile:'13800136688'})); } }); },
  member() { wx.navigateTo({url:this.data.isMember?'/pages/member-center/member-center':'/pages/member/member'}); },
  rights() { wx.navigateTo({url:'/pages/member-center/member-center'}); },
  orders() { wx.navigateTo({url:'/pages/orders/orders'}); },
  coupons() { wx.navigateTo({url:'/pages/coupons/coupons'}); },
  about() { wx.switchTab({url:'/pages/intro/intro'}); },
  settings() {
    if(!this.data.isStaff) return;
    wx.navigateTo({url:'/pages/staff-settings/staff-settings'});
  },
  contact() { wx.makePhoneCall({phoneNumber:'15192670475'}); },
});
