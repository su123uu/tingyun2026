const cloudConfig = require('./config/cloud');

require('./services/auth');
require('./services/member');
require('./services/home');
require('./services/catalog');
require('./services/table-session');
require('./services/cart');
require('./services/meal-order');
require('./services/reservation');
require('./services/activity-signup');

let cloudInited = false;

App({
  onLaunch() {
    if (cloudInited || typeof wx === 'undefined' || !wx.cloud) return;
    wx.cloud.init({
      env: cloudConfig.envId,
      traceUser: true,
    });
    cloudInited = true;
  },
});
