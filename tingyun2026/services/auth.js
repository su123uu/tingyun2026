const storage = require('../utils/storage');
const validators = require('../utils/validators');
const users = require('../mock/users');
const memberService = require('./member');
const assertMobile = validators.assertMobile;
const guestUser = users.guestUser;

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
  assertMobile(mobile);
  const profile = await memberService.getMemberProfile({ mobile });
  const user = memberService.buildMemberUser(profile, guestUser)
    || Object.assign({}, guestUser, { mobile });
  return storage.set(KEY, user);
}

async function useGuestMode() {
  return storage.set(KEY, guestUser);
}

module.exports = { getCurrentUser, bindMobile, useGuestMode };
