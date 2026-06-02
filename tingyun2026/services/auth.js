const storage = require('../utils/storage');
const validators = require('../utils/validators');
const users = require('../mock/users');
const assertMobile = validators.assertMobile;
const guestUser = users.guestUser;
const members = users.members;

const KEY = 'current_user';

async function getCurrentUser() {
  const user = storage.get(KEY, guestUser);
  const member = members.find((item) => item.member_id === user.member_id && item.member_status === 'active');
  if (!member) return user;
  return storage.set(KEY, Object.assign({}, user, {
    mobile: member.mobile,
    nickname: member.member_name,
    member_level: member.member_level,
    points_balance: member.points_balance,
    customer_type: 'member',
  }));
}

async function bindMobile(input) {
  const mobile = input.mobile;
  assertMobile(mobile);
  const member = members.find((item) => item.mobile === mobile && item.member_status === 'active');
  const user = member
    ? Object.assign({}, guestUser, { mobile, nickname: member.member_name, member_id: member.member_id, member_level: member.member_level, points_balance: member.points_balance, customer_type: 'member' })
    : Object.assign({}, guestUser, { mobile });
  return storage.set(KEY, user);
}

async function useGuestMode() {
  return storage.set(KEY, guestUser);
}

module.exports = { getCurrentUser, bindMobile, useGuestMode };
