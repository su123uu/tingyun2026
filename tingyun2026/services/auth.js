const storage = require('../utils/storage');
const validators = require('../utils/validators');
const memberService = require('./member');
const assertMobile = validators.assertMobile;

const guestUser = {
  user_id: 'user_guest',
  mobile: '',
  nickname: '微信用户',
  member_id: '',
  customer_type: 'guest',
  is_staff: false,
};

const KEY = 'current_user';

async function getCurrentUser() {
  const user = storage.get(KEY, guestUser);
  if (!user.member_id && !user.mobile) return user;
  const profile = await memberService.getMemberProfile({
    member_id: user.member_id,
    mobile: user.mobile,
  });
  const memberUser = memberService.buildMemberUser(profile, user);
  if (!memberUser) return user;
  return storage.set(KEY, memberUser);
}

async function bindMobile(input) {
  const mobile = input.mobile;
  const phoneCode = input.phoneCode || input.phone_code;
  if (!phoneCode) assertMobile(mobile);
  const profile = await memberService.getMemberProfile(phoneCode ? { phoneCode } : { mobile });
  const resolvedMobile = profile.mobile || mobile || '';
  if (resolvedMobile) assertMobile(resolvedMobile);
  const user = memberService.buildMemberUser(profile, guestUser)
    || Object.assign({}, guestUser, { mobile: resolvedMobile });
  return storage.set(KEY, user);
}

async function useGuestMode() {
  return storage.set(KEY, guestUser);
}

module.exports = { getCurrentUser, bindMobile, useGuestMode };
