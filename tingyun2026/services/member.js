const guestUser = {
  user_id: 'user_guest',
  mobile: '',
  nickname: '微信用户',
  member_id: '',
  customer_type: 'guest',
  is_staff: false,
};

function canUseCloud() {
  return typeof wx !== 'undefined' && wx.cloud && wx.cloud.callFunction;
}

async function callCloud(name, data = {}) {
  const response = await wx.cloud.callFunction({ name, data });
  const body = response && response.result ? response.result : response;
  if (!body || body.ok !== true) throw new Error((body && body.message) || '云函数调用失败。');
  return body.data || {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sortByOrder(left, right) {
  const leftOrder = Number(left.sort_order) || 9999;
  const rightOrder = Number(right.sort_order) || 9999;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return String(left.benefit_name || '').localeCompare(String(right.benefit_name || ''), 'zh-Hans-CN');
}

function normalizeProfile(profile) {
  const member = profile && profile.member ? profile.member : null;
  if (!member) {
    return {
      mobile: profile && profile.mobile ? profile.mobile : '',
      member: null,
      level: null,
      level_benefits: [],
      benefit_accounts: [],
    };
  }
  const levelBenefits = asArray(profile.level_benefits)
    .filter((item) => item && item.is_enabled !== false)
    .sort(sortByOrder);
  const benefitAccounts = asArray(profile.benefit_accounts)
    .filter((item) => item && item.account_status !== 'disabled')
    .sort(sortByOrder);
  return {
    mobile: profile.mobile || member.mobile || '',
    member,
    level: profile.level || null,
    level_benefits: levelBenefits,
    benefit_accounts: benefitAccounts,
  };
}

async function getMemberProfile(input = {}) {
  if (!canUseCloud()) {
    throw new Error('云服务不可用，无法获取会员信息');
  }
  const profile = await callCloud('memberProfileGet', input);
  return normalizeProfile(profile);
}

function buildMemberUser(profile, baseUser = guestUser) {
  const member = profile && profile.member;
  if (!member) return null;
  return Object.assign({}, baseUser, {
    mobile: member.mobile,
    nickname: member.member_name,
    member_id: member.member_id,
    level_id: member.level_id,
    member_level: (profile.level && profile.level.level_name) || member.member_level || '',
    benefit_start_at: member.benefit_start_at,
    benefit_end_at: member.benefit_end_at,
    points_balance: member.points_balance,
    customer_type: 'member',
  });
}

module.exports = {
  getMemberProfile,
  buildMemberUser,
};
