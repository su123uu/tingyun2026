const auth = require('../../services/auth');
Page({
  data:{ user:{}, isMember:false, isStaff:false, binding:false },
  applyUser(user) {
    this.setData({ user, isMember:user.customer_type==='member', isStaff:user.is_staff===true||user.role==='staff' });
  },
  async onShow() {
    if(this.getTabBar()) this.getTabBar().setData({selected:4});
    this.applyUser(await auth.getCurrentUser());
  },
  async bindMember(event) {
    const detail = event && event.detail ? event.detail : {};
    if (!detail.code) {
      wx.showToast({ title:'未完成手机号授权', icon:'none' });
      return;
    }
    if (this.data.binding) return;
    this.setData({ binding:true });
    wx.showLoading({ title:'匹配会员中', mask:true });
    try {
      const user = await auth.bindMobile({ phoneCode:detail.code });
      this.applyUser(user);
      wx.hideLoading();
      wx.showToast({
        title:user.customer_type==='member' ? '会员匹配成功' : '未匹配到会员',
        icon:user.customer_type==='member' ? 'success' : 'none',
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title:error.message || '手机号授权失败', icon:'none' });
    } finally {
      this.setData({ binding:false });
    }
  },
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
