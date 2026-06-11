const users = require('../mock/users');

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
    return { member: null, level: null, level_benefits: [], benefit_accounts: [] };
  }
  const levelBenefits = asArray(profile.level_benefits)
    .filter((item) => item && item.is_enabled !== false)
    .sort(sortByOrder);
  const benefitAccounts = asArray(profile.benefit_accounts)
    .filter((item) => item && item.account_status !== 'disabled')
    .sort(sortByOrder);
  return {
    member,
    level: profile.level || null,
    level_benefits: levelBenefits,
    benefit_accounts: benefitAccounts,
  };
}

function getMockProfile(input = {}) {
  const mobile = String(input.mobile || '').trim();
  const memberId = String(input.member_id || '').trim();
  const member = users.members.find((item) => {
    if (item.member_status !== 'active') return false;
    return (memberId && item.member_id === memberId) || (mobile && item.mobile === mobile);
  });
  if (!member) return normalizeProfile(null);
  return normalizeProfile({
    member,
    level: users.memberLevels.find((item) => item.level_id === member.level_id) || null,
    level_benefits: users.memberLevelBenefits.filter((item) => item.level_id === member.level_id),
    benefit_accounts: users.memberBenefitAccounts.filter((item) => item.member_id === member.member_id),
  });
}

async function getMemberProfile(input = {}) {
  if (canUseCloud()) {
    try {
      const profile = await callCloud('memberProfileGet', input);
      const normalized = normalizeProfile(profile);
      if (normalized.member) return normalized;
    } catch (error) {
      console.warn('memberProfileGet fallback to mock', error);
    }
  }
  return getMockProfile(input);
}

function buildMemberUser(profile, baseUser = users.guestUser) {
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
