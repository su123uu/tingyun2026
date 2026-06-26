const crypto = require('crypto');
const https = require('https');

const XPYUN_PRINT_URL = 'https://open.xpyun.net/api/openapi/xprinter/print';

function cleanText(value, maxLength = 500) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  return toNumber(value, 0).toFixed(2);
}

function formatTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  const local = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

function formatDateOnly(value) {
  const text = cleanText(value, 40);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (match) return match[1];
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return text;
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function diningSlotLabel(value) {
  const text = cleanText(value, 40);
  if (text === 'lunch') return '午餐';
  if (text === 'dinner') return '晚餐';
  return text;
}

function xpyunConfig() {
  return {
    user: cleanText(process.env.XPYUN_USER, 120),
    userKey: cleanText(process.env.XPYUN_USER_KEY, 120),
    printerSn: cleanText(process.env.XPYUN_PRINTER_SN, 120),
  };
}

function hasPrinterConfig() {
  const config = xpyunConfig();
  return Boolean(config.user && config.userKey && config.printerSn);
}

function sha1(text) {
  return crypto.createHash('sha1').update(text).digest('hex');
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        let data = raw;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (error) {}
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(data);
          return;
        }
        const error = new Error(`XPYUN HTTP ${response.statusCode}`);
        error.response = data;
        reject(error);
      });
    });
    request.on('timeout', () => request.destroy(new Error('XPYUN request timeout')));
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function line(text) {
  return `<L>${cleanText(text, 500)}<BR></L>`;
}

function center(text) {
  return `<C>${cleanText(text, 500)}<BR></C>`;
}

function separator() {
  return '--------------------------------<BR>';
}

function buildMealTicket(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const quickRemarks = Array.isArray(order.quick_remarks) ? order.quick_remarks : [];
  const remarks = [order.remark].concat(quickRemarks).map((item) => cleanText(item, 80)).filter(Boolean);
  const batchTitle = order.is_append_batch ? '追加菜单' : '厨房单';
  const itemLines = items.map((item) => {
    const quantity = toNumber(item.quantity, 0);
    const price = toNumber(item.price, 0);
    return line(`${item.name || item.item_id} x${quantity}  ${money(price * quantity)}`);
  }).join('');

  return [
    center('<BOLD>停云山居</BOLD>'),
    center(`<B>${batchTitle}</B>`),
    separator(),
    line(`订单号：${order.order_no || order.order_id || ''}`),
    line(`桌台：${order.table_name || order.table_id || ''}  人数：${order.people_count || 1}`),
    line(`时间：${formatTime(order.paid_at || order.created_at)}`),
    separator(),
    itemLines || line('无菜品明细'),
    separator(),
    line(`合计：${money(order.total_amount)}`),
    remarks.length ? line(`备注：${remarks.join(' / ')}`) : '',
    '<CUT>',
  ].join('');
}

function reservationTypeName(businessType) {
  return businessType === 'accommodation_reservation' ? '住宿预订通知' : '用餐预订通知';
}

function reservationStatusText(order = {}) {
  if (order.reservation_status === 'refunding') return '已支付，需退款处理';
  if (order.payment_status === 'settled') return '已支付，待确认';
  if (order.payment_status === 'offline_pending') return '待线下核对，待确认';
  return '待处理';
}

function buildReservationTicket(order = {}, businessType = 'dining_reservation') {
  const isAccommodation = businessType === 'accommodation_reservation';
  const remarks = [order.remark, order.admin_remark].map((item) => cleanText(item, 80)).filter(Boolean);
  const lines = [
    center('<BOLD>停云山居</BOLD>'),
    center(`<B>${reservationTypeName(businessType)}</B>`),
    separator(),
    line(`订单号：${order.order_no || order.reservation_id || ''}`),
    line(`联系人：${order.contact_name || order.customer_name || ''}`),
    line(`电话：${order.mobile || order.customer_mobile || ''}`),
    line(`人数：${order.people_count || order.guest_count || 0}`),
    line(`${isAccommodation ? '房间' : '包间'}：${order.room_name || order.room_id || ''}`),
  ];

  if (isAccommodation) {
    lines.push(line(`入住：${formatDateOnly(order.check_in_date || order.checkin_date || '')}`));
    lines.push(line(`离店：${formatDateOnly(order.check_out_date || order.checkout_date || '')}`));
    lines.push(line(`晚数：${order.nights || ''}`));
  } else {
    lines.push(line(`日期：${formatDateOnly(order.date || order.reservation_date || '')}`));
    lines.push(line(`时段：${diningSlotLabel(order.time_slot || order.reservation_time || '')}`));
    lines.push(line(`餐标：${order.meal_standard_name || order.meal_standard_id || ''}`));
  }

  lines.push(separator());
  lines.push(line(`金额：${money(order.amount || 0)}`));
  lines.push(line(`状态：${reservationStatusText(order)}`));
  lines.push(line(`创建时间：${formatTime(order.paid_at || order.created_at)}`));
  if (remarks.length) lines.push(line(`备注：${remarks.join(' / ')}`));
  lines.push('<CUT>');
  return lines.join('');
}

function responseOk(response) {
  if (!response || typeof response !== 'object') return false;
  const code = response.code !== undefined ? response.code : response.errorCode;
  if (code === undefined || code === null || code === '') return true;
  return Number(code) === 0;
}

function extractPrintOrderId(response = {}) {
  const data = response.data || {};
  return cleanText(data.orderId || data.order_id || data.id || response.orderId || response.id, 120);
}

async function submitPrintContent(content) {
  const config = xpyunConfig();
  if (!config.user || !config.userKey || !config.printerSn) {
    const error = new Error('Missing XPYUN_USER, XPYUN_USER_KEY or XPYUN_PRINTER_SN');
    error.code = 'XPYUN_CONFIG_MISSING';
    throw error;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const payload = {
    user: config.user,
    userKey: config.userKey,
    timestamp,
    sign: sha1(`${config.user}${config.userKey}${timestamp}`),
    debug: process.env.XPYUN_DEBUG === 'true',
    sn: config.printerSn,
    content,
    copies: toNumber(process.env.XPYUN_PRINT_COPIES, 1),
    voice: toNumber(process.env.XPYUN_PRINT_VOICE, 2),
    mode: toNumber(process.env.XPYUN_PRINT_MODE, 0),
  };
  const response = await postJson(XPYUN_PRINT_URL, payload);
  if (!responseOk(response)) {
    const error = new Error(response.msg || response.message || 'XPYUN print failed');
    error.response = response;
    throw error;
  }
  return {
    response,
    print_order_id: extractPrintOrderId(response),
  };
}

async function printMealOrder(order = {}) {
  return submitPrintContent(buildMealTicket(order));
}

async function printReservationOrder(order = {}, businessType) {
  return submitPrintContent(buildReservationTicket(order, businessType));
}

module.exports = {
  buildMealTicket,
  buildReservationTicket,
  hasPrinterConfig,
  printMealOrder,
  printReservationOrder,
};
