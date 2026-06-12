const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function cleanText(value, maxLength = 120) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function ok(data) {
  return { ok: true, data };
}

function fail(message, code = 'BAD_REQUEST') {
  return { ok: false, code, message };
}

async function list(collectionName, where, orderFields = []) {
  let query = db.collection(collectionName).where(Object.assign({ is_deleted: _.neq(true) }, where));
  orderFields.forEach(([field, direction]) => {
    query = query.orderBy(field, direction);
  });
  const result = await query.get();
  return Array.isArray(result.data) ? result.data : [];
}

async function getMobileFromPhoneCode(event) {
  const phoneCode = cleanText(event.phoneCode || event.phone_code || event.code, 256);
  if (!phoneCode) return '';
  const response = await cloud.openapi.phonenumber.getPhoneNumber({ code: phoneCode });
  const phoneInfo = response && response.phoneInfo ? response.phoneInfo : {};
  return cleanText(phoneInfo.purePhoneNumber || phoneInfo.phoneNumber, 20);
}

async function findMember(event, mobileFromCode) {
  const memberId = cleanText(event.member_id, 120);
  const mobile = mobileFromCode || cleanText(event.mobile, 20);
  if (!memberId && !mobile) return null;

  const where = memberId ? { member_id: memberId } : { mobile };
  const rows = await list('members', where, [['updated_at', 'desc']]);
  return rows.find((row) => row.member_status === 'active') || null;
}

function userUpdateData(existing = {}, profile = {}) {
  const timestamp = new Date();
  const data = {
    last_login_at: timestamp,
    updated_at: timestamp,
    is_deleted: false,
  };
  const mobile = cleanText(profile.mobile, 20);
  const nickname = cleanText(profile.nickname || profile.member_name, 80);
  const avatarUrl = cleanText(profile.avatar_url, 300);
  const memberId = cleanText(profile.member_id, 120);
  const customerType = cleanText(profile.customer_type, 20);

  if (mobile) data.mobile = mobile;
  if (nickname) data.nickname = nickname;
  if (avatarUrl) data.avatar_url = avatarUrl;
  if (customerType === 'member') {
    data.customer_type = 'member';
    data.member_id = memberId;
  } else if (customerType === 'guest') {
    data.customer_type = existing.customer_type === 'member' && !mobile ? existing.customer_type : 'guest';
    if (mobile || profile.clear_member === true) data.member_id = '';
  }

  return data;
}

async function ensureUser(wxContext = {}, profile = {}) {
  const openid = cleanText(wxContext.OPENID || profile.openid, 120);
  if (!openid) return null;

  const result = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get();
  const existing = result.data && result.data[0];
  const data = userUpdateData(existing || {}, profile);

  if (existing && existing._id) {
    await db.collection('users').doc(existing._id).update({ data });
    return Object.assign({}, existing, data);
  }

  const created = Object.assign({
    user_id: openid,
    openid,
    mobile: '',
    nickname: '',
    avatar_url: '',
    member_id: '',
    customer_type: 'guest',
    created_at: new Date(),
  }, data);
  await db.collection('users').add({ data: created });
  return created;
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  try {
    const mobile = await getMobileFromPhoneCode(event) || cleanText(event.mobile, 20);
    const member = await findMember(event, mobile);
    if (!member) {
      await ensureUser(wxContext, {
        customer_type: 'guest',
        mobile,
        clear_member: Boolean(mobile),
      });
      return ok({ mobile, member: null, level: null, level_benefits: [], benefit_accounts: [] });
    }
    await ensureUser(wxContext, {
      customer_type: 'member',
      member_id: member.member_id,
      member_name: member.member_name,
      mobile: member.mobile || mobile,
    });

    const [levels, levelBenefits, benefitAccounts] = await Promise.all([
      list('member_levels', { level_id: member.level_id }, [['sort_order', 'asc']]),
      list('member_level_benefits', { level_id: member.level_id }, [['sort_order', 'asc']]),
      list('member_benefit_accounts', { member_id: member.member_id, account_status: _.neq('disabled') }, [['updated_at', 'desc']]),
    ]);

    return ok({
      mobile: member.mobile || mobile,
      member,
      level: levels.find((item) => item.is_enabled !== false) || null,
      level_benefits: levelBenefits.filter((item) => item.is_enabled !== false),
      benefit_accounts: benefitAccounts,
    });
  } catch (error) {
    console.error('memberProfileGet failed', error);
    return fail(error.message || '会员资料读取失败。', 'SERVER_ERROR');
  }
};
