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

async function findMember(event) {
  const memberId = cleanText(event.member_id, 120);
  const mobile = cleanText(event.mobile, 20);
  if (!memberId && !mobile) return null;

  const where = memberId ? { member_id: memberId } : { mobile };
  const rows = await list('members', where, [['updated_at', 'desc']]);
  return rows.find((row) => row.member_status !== 'disabled') || null;
}

exports.main = async (event = {}) => {
  try {
    const member = await findMember(event);
    if (!member) return ok({ member: null, level: null, level_benefits: [], benefit_accounts: [] });

    const [levels, levelBenefits, benefitAccounts] = await Promise.all([
      list('member_levels', { level_id: member.level_id }, [['sort_order', 'asc']]),
      list('member_level_benefits', { level_id: member.level_id }, [['sort_order', 'asc']]),
      list('member_benefit_accounts', { member_id: member.member_id, account_status: _.neq('disabled') }, [['updated_at', 'desc']]),
    ]);

    return ok({
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
