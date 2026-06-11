const guestUser = {
  user_id: 'user_mock_current',
  mobile: '',
  nickname: '微信用户',
  member_id: '',
  customer_type: 'guest',
  is_staff: false,
};

const members = [
  { member_id: 'member_001', mobile: '13800136688', member_name: '山里人', level_id: 'level_2', member_level: '辰升会员', member_status: 'active', benefit_start_at: '2026-01-01T00:00:00+08:00', benefit_end_at: '2027-05-01T00:00:00+08:00', points_balance: 25000 },
];

const memberLevels = [
  { level_id: 'level_1', level_no: 1, level_name: '将星', stored_amount: 10000, points_granted: 12000, valid_months: 12 },
  { level_id: 'level_2', level_no: 2, level_name: '辰升', stored_amount: 20000, points_granted: 25000, valid_months: 16 },
  { level_id: 'level_3', level_no: 3, level_name: '海尊', stored_amount: 30000, points_granted: 37000, valid_months: 18 },
  { level_id: 'level_4', level_no: 4, level_name: '山王', stored_amount: 50000, points_granted: 62000, valid_months: 24 },
  { level_id: 'level_5', level_no: 5, level_name: '云境', stored_amount: 100000, points_granted: 125000, valid_months: 36 },
];

const memberLevelBenefits = [
  { level_benefit_id: 'level_2_member_service', level_id: 'level_2', benefit_key: 'member_service', benefit_name: '会员活动与山居管家服务', benefit_type: 'service', description: '会员有效期内可参加会员专属活动，并享受山居管家咨询服务。', show_on_card: true, is_enabled: true, sort_order: 10 },
  { level_benefit_id: 'level_2_storage_service', level_id: 'level_2', benefit_key: 'storage_service', benefit_name: '定制储藏服务', benefit_type: 'service', description: '支持线下联系店长确认储藏规则与使用方式。', show_on_card: true, is_enabled: true, sort_order: 20 },
  { level_benefit_id: 'level_2_free_accommodation', level_id: 'level_2', benefit_key: 'free_accommodation', benefit_name: '免费住宿', benefit_type: 'quota', total_quota: 10, quota_unit: '次', description: '不限房型，仍需按入住日期确认房间可用性。', show_on_card: false, is_enabled: true, sort_order: 30 },
  { level_benefit_id: 'level_2_nature_picking', level_id: 'level_2', benefit_key: 'nature_picking', benefit_name: '自然采摘', benefit_type: 'quota', total_quota: 20, quota_unit: '人次', description: '按实际参与人数核销。', show_on_card: false, is_enabled: true, sort_order: 40 },
];

const memberBenefitAccounts = [
  {
    benefit_account_id: 'MBA_FREE_STAY_001',
    member_id: 'member_001',
    level_id: 'level_2',
    benefit_key: 'free_accommodation',
    benefit_name: '免费住宿',
    benefit_type: 'quota',
    total_quota: 10,
    used_quota: 2,
    locked_quota: 0,
    remaining_quota: 8,
    quota_unit: '次',
    rule_snapshot: {
      room_scope: 'all',
      note: '不限房型，仍需按日期确认房间可用性',
    },
    valid_start_at: '2026-01-01T00:00:00+08:00',
    valid_end_at: '2027-05-01T00:00:00+08:00',
    account_status: 'active',
  },
  {
    benefit_account_id: 'MBA_PICKING_001',
    member_id: 'member_001',
    level_id: 'level_2',
    benefit_key: 'nature_picking',
    benefit_name: '自然采摘',
    benefit_type: 'quota',
    total_quota: 20,
    used_quota: 6,
    locked_quota: 0,
    remaining_quota: 14,
    quota_unit: '人次',
    rule_snapshot: {},
    valid_start_at: '2026-01-01T00:00:00+08:00',
    valid_end_at: '2027-05-01T00:00:00+08:00',
    account_status: 'active',
  },
];

module.exports = { guestUser, members, memberLevels, memberLevelBenefits, memberBenefitAccounts };
