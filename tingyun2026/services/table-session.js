const storage = require('../utils/storage');
const createId = require('../utils/id').createId;
const assert = require('../utils/validators').assert;

const KEY = 'table_session';

function parseTableCode(input) {
  const code = input.code;
  const match = /^TY_TABLE:([A-Z0-9_-]+)$/i.exec(String(code || '').trim());
  assert(match, 'INVALID_TABLE_CODE', '桌码无效，请扫描桌上的二维码');
  return { table_id: match[1].toUpperCase() };
}

async function startTableSession(input) {
  const code = input.code;
  const people_count = input.people_count;
  const table_id = parseTableCode({ code: code }).table_id;
  assert(Number.isInteger(people_count) && people_count > 0, 'INVALID_PEOPLE_COUNT', '请输入正确的用餐人数');
  return storage.set(KEY, {
    session_id: createId('TABLE'),
    table_id,
    people_count,
    created_at: new Date().toISOString(),
  });
}

async function getCurrentTableSession() {
  return storage.get(KEY, null);
}

module.exports = { parseTableCode, startTableSession, getCurrentTableSession };
