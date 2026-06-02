const guestUser = {
  user_id: 'user_mock_current',
  mobile: '',
  nickname: '微信用户',
  member_id: '',
  customer_type: 'guest',
  is_staff: false,
};

const members = [
  { member_id: 'member_001', mobile: '13800136688', member_name: '山里人', member_level: '辰升会员', member_status: 'active', points_balance: 25000 },
];

module.exports = { guestUser, members };
