<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { groupedModules, mealCategories, modules } from './config/modules';
import { callAdmin, clearToken, fileToBase64, getApp, loginAdmin, readSavedToken } from './services/bannerAdmin';

const OVERVIEW_KEY = 'overview';
const RESERVATION_CALENDAR_KEY = 'reservation_calendar';
const RECENT_ACTIVITIES_KEY = 'recent_activities';
const RESERVATIONS_KEY = 'reservations';
const overviewModule = {
  key: OVERVIEW_KEY,
  name: '点餐信息',
  group: '总览',
  titleField: 'name',
  fields: [],
  columns: [],
};
const reservationCalendarModule = {
  key: RESERVATION_CALENDAR_KEY,
  name: '预定日历',
  group: '总览',
  titleField: 'name',
  fields: [],
  columns: [],
};
const recentActivitiesModule = {
  key: RECENT_ACTIVITIES_KEY,
  name: '近期活动',
  group: '总览',
  titleField: 'title',
  fields: [],
  columns: [],
};
const reservationsModule = {
  key: RESERVATIONS_KEY,
  name: '预定管理',
  group: '订单预约',
  titleField: 'order_no',
  idField: 'reservation_id',
  columns: ['__type', 'order_no', 'customer_name', 'customer_mobile', '__date', 'room_name', 'reservation_status'],
  fields: [
    { key: '__collection', label: '集合', hidden: true },
    { key: '__type', label: '类型', hidden: true },
    { key: 'reservation_id', label: '预约 ID', hidden: true },
    { key: 'order_no', label: '订单号' },
    { key: 'customer_name', label: '联系人' },
    { key: 'customer_mobile', label: '手机号' },
    { key: 'reservation_date', label: '用餐日期', reservationType: 'dining' },
    { key: 'reservation_time', label: '用餐时间', reservationType: 'dining' },
    { key: 'checkin_date', label: '入住日期', reservationType: 'accommodation' },
    { key: 'checkout_date', label: '离店日期', reservationType: 'accommodation' },
    { key: 'guest_count', label: '人数', type: 'number' },
    { key: 'room_id', label: '房间/包间 ID' },
    { key: 'room_name', label: '房间/包间名称' },
    { key: 'meal_standard_id', label: '餐标 ID', reservationType: 'dining' },
    { key: 'meal_standard_name', label: '餐标名称', reservationType: 'dining' },
    { key: 'reservation_status', label: '状态', type: 'reservationStatus' },
    { key: 'remark', label: '备注', type: 'textarea' },
    { key: 'admin_remark', label: '后台备注', type: 'textarea' },
  ],
};
const toggleColumns = ['is_available', 'is_enabled', 'table_status', 'show_on_card'];
const reservationStatuses = [
  { value: 'paid_pending_confirmation', label: '已支付待确认', tone: 'pending' },
  { value: 'pending_confirmation', label: '待确认', tone: 'pending' },
  { value: 'pending_payment', label: '待支付', tone: 'payment' },
  { value: 'confirmed', label: '已确认', tone: 'confirmed' },
  { value: 'completed', label: '已完成', tone: 'done' },
  { value: 'rejected', label: '已拒绝', tone: 'closed' },
  { value: 'cancelled', label: '已取消', tone: 'closed' },
  { value: 'refunding', label: '退款处理中', tone: 'closed' },
  { value: 'refunded', label: '已退款', tone: 'closed' },
];
const contentBlockTypes = [
  { value: 'lead', label: '引导段' },
  { value: 'section_title', label: '小标题' },
  { value: 'paragraph', label: '正文' },
  { value: 'quote', label: '强调语' },
  { value: 'image', label: '图片' },
  { value: 'feature_grid', label: '卖点卡片' },
  { value: 'space_list', label: '空间列表' },
  { value: 'list', label: '普通列表' },
  { value: 'contact', label: '联系卡片' },
];

const state = reactive({
  username: 'admin',
  password: '',
  loggedIn: Boolean(readSavedToken()),
  loginLoading: false,
  activeKey: OVERVIEW_KEY,
  rows: [],
  overview: {
    tables: [],
    mealOrders: [],
    tableSessions: [],
    selectedTableId: '',
    moveTargetTableId: '',
  },
  calendar: {
    diningReservations: [],
    accommodationReservations: [],
    month: formatMonth(new Date()),
    filter: 'all',
    statusFilter: 'pending',
    selectedEvent: null,
  },
  activityOverview: {
    activities: [],
    signups: [],
    scopeFilter: 'all',
    statusFilter: 'pending',
    selectedActivityId: '',
    focusPanel: false,
  },
  reservations: {
    rows: [],
    filter: 'all',
  },
  memberManage: {
    levels: [],
    levelBenefits: [],
    benefitAccounts: [],
  },
  loading: false,
  saving: false,
  uploadingField: '',
  previewingField: '',
  generatingQrId: '',
  activatingContentId: '',
  duplicatingContentId: '',
  draggingIndex: -1,
  draggingBannerId: '',
  draggingMealId: '',
  draggingDiningRoomId: '',
  mealCategoryKey: 'all',
  collapsedNavGroups: {},
  drawerOpen: false,
  editingId: '',
  editingCollection: '',
  statusText: '未连接',
  statusTone: 'muted',
  nowTick: Date.now(),
  toastText: '',
  toastType: '',
  cloudPicker: {
    visible: false,
    fieldKey: '',
    folder: '',
    files: [],
    loading: false,
    selectedFileID: '',
  },
});

const form = reactive({});
const fileInputs = ref({});
const multiFileInputs = ref({});
const bannerFileInputs = ref({});
const contentBlockFileInputs = ref({});
const videoFileInputs = ref({});

const isOverview = computed(() => state.activeKey === OVERVIEW_KEY);
const isReservationCalendar = computed(() => state.activeKey === RESERVATION_CALENDAR_KEY);
const isRecentActivities = computed(() => state.activeKey === RECENT_ACTIVITIES_KEY);
const isReservationsModule = computed(() => state.activeKey === RESERVATIONS_KEY);
const isVirtualModule = computed(() => isOverview.value || isReservationCalendar.value || isRecentActivities.value || isReservationsModule.value);
const activeModule = computed(() => {
  if (isOverview.value) return overviewModule;
  if (isReservationCalendar.value) return reservationCalendarModule;
  if (isRecentActivities.value) return recentActivitiesModule;
  if (isReservationsModule.value) return reservationsModule;
  return modules.find((item) => item.key === state.activeKey) || modules[0];
});
const activityItemsModule = computed(() => modules.find((item) => item.key === 'activity_items'));
const editorModule = computed(() => {
  if (state.editingCollection === 'activity_items' && activityItemsModule.value) return activityItemsModule.value;
  return activeModule.value;
});
const activeGroup = computed(() => {
  if (isReservationsModule.value) return { name: '订单预约' };
  return groupedModules.find((group) => group.items.some((item) => item.key === state.activeKey));
});
const navGroups = computed(() => {
  return groupedModules.map((group) => {
    if (group.name !== '订单预约') return group;
    const items = [
      { key: RESERVATIONS_KEY, name: '预定管理' },
      ...group.items.filter((item) => !['dining_reservations', 'accommodation_reservations'].includes(item.key)),
    ];
    return { ...group, items };
  });
});
const isNavGroupCollapsed = (name) => state.collapsedNavGroups[name] === true;
const navGroupItems = (group) => (isNavGroupCollapsed(group.name) ? [] : group.items);
const titleField = computed(() => activeModule.value.titleField || activeModule.value.fields[0]?.key || '_id');
const tableColumns = computed(() => activeModule.value.columns || activeModule.value.fields.slice(0, 5).map((field) => field.key));
const isBannerModule = computed(() => activeModule.value.key === 'home_banners');
const isMealItemsModule = computed(() => activeModule.value.key === 'meal_items');
const isMealTablesModule = computed(() => activeModule.value.key === 'meal_tables');
const isDiningRoomsModule = computed(() => activeModule.value.key === 'dining_rooms');
const isAccommodationRoomsModule = computed(() => activeModule.value.key === 'accommodation_rooms');
const isContentPagesModule = computed(() => activeModule.value.key === 'content_pages');
const isMembersModule = computed(() => activeModule.value.key === 'members');
const isMemberLevelsModule = computed(() => activeModule.value.key === 'member_levels');
const isActivitySignupsModule = computed(() => activeModule.value.key === 'activity_signups');
const isRoomCatalogModule = computed(() => isDiningRoomsModule.value || isAccommodationRoomsModule.value);
const isSortableTableModule = computed(() => isBannerModule.value || isMealItemsModule.value || isRoomCatalogModule.value);
const memberLevelOptions = computed(() => state.memberManage.levels
  .slice()
  .sort(compareSortOrder)
  .map((level) => ({ value: level.level_id, label: level.level_name || level.level_id })));
const visibleFields = computed(() => {
  return editorModule.value.fields.filter((field) => {
    if (field.hidden) return false;
    if (isContentPagesModule.value && field.key === 'is_active') return false;
    if (isMealItemsModule.value && field.key === 'details' && form.category_key !== 'package') return false;
    if (isReservationsModule.value && field.reservationType && field.reservationType !== form.__type) return false;
    return true;
  });
});
const activeMealCategory = computed(() => getMealCategory(state.mealCategoryKey));
const concreteMealCategories = computed(() => mealCategories.filter((category) => category.key !== 'all'));
const tableRows = computed(() => {
  if (isReservationsModule.value) return filteredReservationRows.value;
  if (isBannerModule.value) return state.rows.slice().sort(compareSortOrder);
  if (isRoomCatalogModule.value) return state.rows.slice().sort(compareSortOrder);
  if (activeModule.value.key === 'dining_standards') {
    return state.rows.slice().sort((left, right) => {
      const leftPrice = Number(left.price_per_person) || 0;
      const rightPrice = Number(right.price_per_person) || 0;
      if (leftPrice !== rightPrice) return leftPrice - rightPrice;
      return String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hans-CN');
    });
  }
  if (!isMealItemsModule.value) return state.rows;
  return state.rows
    .filter((row) => state.mealCategoryKey === 'all' || row.category_key === state.mealCategoryKey)
    .slice()
    .sort(compareMealItems);
});
const createButtonLabel = computed(() => {
  if (isBannerModule.value) return '新建轮播';
  if (isContentPagesModule.value) return '新建内容';
  if (isMealTablesModule.value) return '新建桌台';
  if (!isMealItemsModule.value) return '新建';
  return state.mealCategoryKey === 'all' ? '新建菜品' : `新建${activeMealCategory.value.name}`;
});
const dashboardStats = computed(() => {
  const enabled = state.overview.tables.filter((row) => (row.table_status || 'enabled') === 'enabled').length;
  const disabled = state.overview.tables.length - enabled;
  const qrCount = state.overview.tables.filter((row) => row.qr_image_file_id).length;
  const occupied = state.overview.tables.filter((row) => tableStatusMeta(row).key === 'occupied').length;
  const browsing = state.overview.tables.filter((row) => tableStatusMeta(row).key === 'browsing').length;
  const idle = enabled - occupied - browsing;
  return { enabled, disabled, qrCount, occupied, browsing, idle };
});
const dashboardEvents = computed(() => {
  const dining = state.calendar.diningReservations.map((row) => ({
    id: row._id || row.reservation_id,
    type: 'dining',
    collection: 'dining_reservations',
    date: normalizeCalendarDate(row.reservation_date),
    customer: row.customer_name || row.contact_name || '用餐预约',
    place: row.room_name || row.table_name || '未选包间',
    status: row.reservation_status || '-',
    row,
  }));
  const accommodation = state.calendar.accommodationReservations.map((row) => ({
    id: row._id || row.reservation_id,
    type: 'accommodation',
    collection: 'accommodation_reservations',
    date: normalizeCalendarDate(row.checkin_date),
    customer: row.customer_name || row.contact_name || '住宿预约',
    place: row.room_name || '未选客房',
    status: row.reservation_status || '-',
    row,
  }));
  return dining.concat(accommodation)
    .filter((event) => event.date)
    .filter((event) => state.calendar.filter === 'all' || event.type === state.calendar.filter);
});
const calendarDays = computed(() => buildCalendarDays(state.calendar.month, dashboardEvents.value));
const calendarStatusStats = computed(() => {
  const pending = dashboardEvents.value.filter((event) => isPendingReservation(event.row)).length;
  const memberPendingSettle = dashboardEvents.value.filter((event) => canSettleMemberReservation(event.row)).length;
  return { pending, memberPendingSettle, total: dashboardEvents.value.length };
});
const statusPanelReservationEvents = computed(() => {
  return dashboardEvents.value
    .filter((event) => {
      if (state.calendar.statusFilter === 'pending') return isPendingReservation(event.row);
      if (state.calendar.statusFilter === 'memberPendingSettle') return canSettleMemberReservation(event.row);
      return true;
    })
    .slice()
    .sort((left, right) => {
      const leftDate = Date.parse(left.date) || 0;
      const rightDate = Date.parse(right.date) || 0;
      if (leftDate !== rightDate) return leftDate - rightDate;
      return String(left.customer || '').localeCompare(String(right.customer || ''), 'zh-Hans-CN');
    });
});
const sortedMealOrders = computed(() => state.overview.mealOrders.slice().sort(compareRecentRecords));
const recentMealOrders = computed(() => sortedMealOrders.value.slice(0, 8));
const activeMealOrders = computed(() => sortedMealOrders.value.filter(isActiveMealOrder));
const selectedTable = computed(() => {
  return state.overview.tables.find((table) => getTableId(table) === state.overview.selectedTableId) || null;
});
const selectedTableOrders = computed(() => {
  if (!selectedTable.value) return [];
  return activeMealOrders.value.filter((order) => isOrderForTable(order, selectedTable.value));
});
const selectedTableItems = computed(() => {
  return selectedTableOrders.value.flatMap((order) => normalizeOrderItems(order).map((item) => ({
    ...item,
    order_no: order.order_no || order.order_id || '',
    customer_type: order.customer_type || 'guest',
  })));
});
const availableMoveTables = computed(() => {
  return state.overview.tables.filter((table) => {
    if (!selectedTable.value || getTableId(table) === getTableId(selectedTable.value)) return false;
    return tableStatusMeta(table).key === 'idle';
  });
});
const reservationRows = computed(() => state.reservations.rows.slice().sort(compareReservations));
const filteredReservationRows = computed(() => {
  if (state.reservations.filter === 'all') return reservationRows.value;
  return reservationRows.value.filter((row) => row.__type === state.reservations.filter);
});
const recentActivityRows = computed(() => {
  return state.activityOverview.activities
    .filter(isUpcomingActivity)
    .filter((activity) => state.activityOverview.scopeFilter === 'all' || activity.signup_scope === state.activityOverview.scopeFilter)
    .slice()
    .sort(compareActivities);
});
const selectedActivity = computed(() => (
  recentActivityRows.value.find((activity) => activity.activity_id === state.activityOverview.selectedActivityId)
  || recentActivityRows.value[0]
  || null
));
const selectedActivitySignups = computed(() => {
  const activityId = selectedActivity.value?.activity_id || '';
  return state.activityOverview.signups
    .filter((signup) => !activityId || signup.activity_id === activityId)
    .slice()
    .sort(compareActivitySignups);
});
const activityPanelSignups = computed(() => {
  return selectedActivitySignups.value.filter((signup) => {
    if (state.activityOverview.statusFilter === 'pending') return isPendingActivitySignup(signup);
    if (state.activityOverview.statusFilter === 'memberPendingSettle') return canSettleActivitySignup(signup);
    return true;
  });
});
const activityStatusStats = computed(() => ({
  pending: selectedActivitySignups.value.filter(isPendingActivitySignup).length,
  memberPendingSettle: selectedActivitySignups.value.filter(canSettleActivitySignup).length,
  total: selectedActivitySignups.value.length,
}));

function setStatus(text, tone = 'muted') {
  state.statusText = text;
  state.statusTone = tone;
}

function toast(message, type = '') {
  state.toastText = message;
  state.toastType = type;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    state.toastText = '';
    state.toastType = '';
  }, 2600);
}

function formatMonth(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return formatMonth(new Date());
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeCalendarDate(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildCalendarDays(month, events) {
  const [year, monthNumber] = String(month).split('-').map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  if (Number.isNaN(firstDay.getTime())) return [];
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const leadingDays = firstDay.getDay();
  const days = [];

  for (let index = 0; index < leadingDays; index += 1) {
    days.push({ key: `blank-${index}`, day: '', date: '', events: [] });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days.push({
      key: date,
      day,
      date,
      events: events.filter((event) => event.date === date),
    });
  }
  return days;
}

function shiftDashboardMonth(offset) {
  const [year, monthNumber] = state.calendar.month.split('-').map(Number);
  const next = new Date(year, monthNumber - 1 + offset, 1);
  state.calendar.month = formatMonth(next);
}

function compareRecentRecords(left, right) {
  const leftTime = getRecordTime(left);
  const rightTime = getRecordTime(right);
  if (leftTime !== rightTime) return rightTime - leftTime;
  return String(right.order_no || right.order_id || right._id || '').localeCompare(String(left.order_no || left.order_id || left._id || ''));
}

function getRecordTime(row) {
  const value = row.ordered_at || row.created_at || row.updated_at || row._createTime || row._updateTime || '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '¥0';
  return `¥${number.toFixed(number % 1 === 0 ? 0 : 2)}`;
}

function getTableId(table) {
  return String(table?.table_id || table?._id || '');
}

function isActiveMealOrder(order) {
  const statusValues = [
    order.order_status || order.kitchen_status,
    order.payment_status,
    order.settlement_status,
  ].map((value) => String(value || '').toLowerCase());
  const inactive = ['cancelled', 'canceled', 'completed', 'closed', 'refunded', 'pending_payment', 'pending_wechat_pay', 'paying'];
  return !statusValues.some((value) => inactive.includes(value));
}

function isOrderForTable(order, table) {
  const tableId = getTableId(table);
  const tableName = String(table?.table_name || '');
  return (tableId && String(order.table_id || '') === tableId)
    || (tableName && String(order.table_name || '') === tableName);
}

function getTableSession(table) {
  const sessionId = String(table?.current_session_id || '');
  if (!sessionId) return null;
  return state.overview.tableSessions.find((session) => String(session.session_id || '') === sessionId) || null;
}

function sessionIdleExpiresAt(session) {
  const baseValue = session?.created_at || session?.updated_at || session?.expires_at || '';
  const baseTime = new Date(baseValue).getTime();
  if (!Number.isFinite(baseTime)) return 0;
  return baseTime + 20 * 60 * 1000;
}

function isBrowsingSession(session) {
  if (!session || session.session_status === 'closed' || session.has_order === true) return false;
  return sessionIdleExpiresAt(session) > Date.now();
}

function isTableOccupied(table) {
  return activeMealOrders.value.some((order) => isOrderForTable(order, table));
}

function isTableBrowsing(table) {
  if ((table?.table_status || 'enabled') !== 'enabled' || isTableOccupied(table)) return false;
  return isBrowsingSession(getTableSession(table));
}

function tableActiveStartTime(table) {
  const meta = tableStatusMeta(table);
  if (meta.key === 'disabled' || meta.key === 'idle') return 0;

  const session = getTableSession(table);
  const sessionTime = getRecordTime(session || {});
  const orderTimes = activeMealOrders.value
    .filter((order) => isOrderForTable(order, table))
    .map(getRecordTime)
    .filter(Boolean);
  const firstOrderTime = orderTimes.length ? Math.min(...orderTimes) : 0;
  const candidates = [sessionTime, firstOrderTime].filter(Boolean);
  return candidates.length ? Math.min(...candidates) : 0;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours) return `${hours}小时${minutes}分`;
  return `${minutes}分`;
}

function tableDurationText(table) {
  const startTime = tableActiveStartTime(table);
  if (!startTime) return '';
  return `时间：${formatDuration(state.nowTick - startTime)}`;
}

function tableStatusMeta(table) {
  if ((table?.table_status || 'enabled') !== 'enabled') return { key: 'disabled', label: '停用' };
  if (isTableOccupied(table)) return { key: 'occupied', label: '正在吃饭' };
  if (isTableBrowsing(table)) return { key: 'browsing', label: '浏览中' };
  return { key: 'idle', label: '空闲' };
}

function normalizeOrderItems(order) {
  const source = Array.isArray(order.all_items) ? order.all_items
    : Array.isArray(order.items) ? order.items
      : Array.isArray(order.batches) ? order.batches.flatMap((batch) => batch.items || [])
        : [];
  return source.map((item) => ({
    name: item.name || item.item_name || item.title || '未命名菜品',
    quantity: Number(item.quantity) || 1,
    price: Number(item.price ?? item.member_price ?? 0) || 0,
    amount: (Number(item.price ?? item.member_price ?? 0) || 0) * (Number(item.quantity) || 1),
  }));
}

function orderAmount(order) {
  return Number(order.total_amount ?? order.pay_amount ?? order.amount ?? 0) || 0;
}

function getReservationStatusMeta(value) {
  return reservationStatuses.find((item) => item.value === value) || { value, label: value || '-', tone: 'muted' };
}

function reservationStatusLabel(value) {
  return getReservationStatusMeta(value).label;
}

function reservationStatusTone(value) {
  return getReservationStatusMeta(value).tone;
}

function reservationTypeLabel(type) {
  return type === 'dining' ? '用餐' : type === 'accommodation' ? '住宿' : '-';
}

function reservationDateValue(row) {
  return row.__date || row.reservation_date || row.checkin_date || '';
}

function mealSlotLabel(value) {
  const labels = {
    lunch: '午餐',
    dinner: '晚餐',
  };
  return labels[value] || value || '-';
}

function mealStandardLabel(row) {
  const snapshot = row?.meal_standard_snapshot || {};
  return row?.meal_standard_name || snapshot.name || row?.meal_standard_id || '-';
}

function isPendingReservation(row) {
  return ['paid_pending_confirmation', 'pending_confirmation'].includes(row.reservation_status);
}

function canSettleMemberReservation(row) {
  return row?.customer_type === 'member'
    && row.settlement_status !== 'settled'
    && row.payment_status !== 'settled';
}

function compareReservations(left, right) {
  const leftPending = isPendingReservation(left) ? 0 : 1;
  const rightPending = isPendingReservation(right) ? 0 : 1;
  if (leftPending !== rightPending) return leftPending - rightPending;
  const leftDate = Date.parse(reservationDateValue(left)) || 0;
  const rightDate = Date.parse(reservationDateValue(right)) || 0;
  if (leftDate !== rightDate) return leftDate - rightDate;
  return compareRecentRecords(left, right);
}

function toDateTime(value) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function compareActivities(left, right) {
  const leftPinned = left.is_pinned === true ? 0 : 1;
  const rightPinned = right.is_pinned === true ? 0 : 1;
  if (leftPinned !== rightPinned) return leftPinned - rightPinned;
  const leftStart = toDateTime(left.start_at) || Number.MAX_SAFE_INTEGER;
  const rightStart = toDateTime(right.start_at) || Number.MAX_SAFE_INTEGER;
  if (leftStart !== rightStart) return leftStart - rightStart;
  return String(left.title || '').localeCompare(String(right.title || ''), 'zh-Hans-CN');
}

function compareActivitySignups(left, right) {
  const leftPending = isPendingActivitySignup(left) ? 0 : 1;
  const rightPending = isPendingActivitySignup(right) ? 0 : 1;
  if (leftPending !== rightPending) return leftPending - rightPending;
  return compareRecentRecords(left, right);
}

function isUpcomingActivity(activity) {
  if (!activity || activity.status === 'closed') return false;
  const endTime = toDateTime(activity.end_at || activity.start_at);
  return !endTime || endTime >= Date.now();
}

function activitySignupsFor(activity) {
  return state.activityOverview.signups.filter((signup) => signup.activity_id === activity.activity_id);
}

function activeActivitySignupsFor(activity) {
  return activitySignupsFor(activity).filter((signup) => ['pending_confirmation', 'confirmed', 'completed'].includes(signup.signup_status));
}

function activitySignupPeople(activity) {
  const reserved = Number(activity.reserved_count) || 0;
  const people = activeActivitySignupsFor(activity).reduce((sum, signup) => (
    sum + (Number(signup.participant_count || signup.people_count) || 0)
  ), 0);
  return reserved + people;
}

function activityCapacity(activity) {
  return Number(activity.capacity) || 0;
}

function activityProgress(activity) {
  const capacity = activityCapacity(activity);
  if (!capacity) return 0;
  return Math.min(100, Math.round((activitySignupPeople(activity) / capacity) * 100));
}

function activityRemaining(activity) {
  const capacity = activityCapacity(activity);
  if (!capacity) return 0;
  return Math.max(0, capacity - activitySignupPeople(activity));
}

function activityPendingCount(activity) {
  return activitySignupsFor(activity).filter(isPendingActivitySignup).length;
}

function activityMemberSettleCount(activity) {
  return activitySignupsFor(activity).filter(canSettleActivitySignup).length;
}

function activityTimeText(activity) {
  const start = formatDateTime(activity.start_at);
  const end = formatDateTime(activity.end_at);
  if (start === '-' && end === '-') return activity.date || '-';
  if (end === '-' || start === end) return start;
  return `${start} - ${end.slice(11)}`;
}

function activityScopeLabel(value) {
  if (value === 'members_only') return '会员专属';
  if (value === 'public') return '公开报名';
  return value || '-';
}

function formImageRows(fieldKey) {
  return (form[`__${fieldKey}Rows`] || []).filter((item) => item && (item.preview || item.value));
}

function formImagePreview(item) {
  return item?.preview || (isBrowserImageUrl(item?.value) ? item.value : '');
}

function activityPreviewFeeText() {
  const guest = Number(form.guest_price) || 0;
  const member = Number(form.member_price) || 0;
  if (guest <= 0 && member <= 0) return '免费';
  if (guest === member) return `${formatMoney(guest)} / 人`;
  return `散客 ${formatMoney(guest)} · 会员 ${member > 0 ? formatMoney(member) : '免费'}`;
}

function isPendingActivitySignup(row) {
  return row?.signup_status === 'pending_confirmation';
}

function canSettleActivitySignup(row) {
  return row?.customer_type === 'member'
    && row.signup_status === 'confirmed'
    && row.settlement_status !== 'settled';
}

function signupStatusLabel(value) {
  const labels = {
    pending_confirmation: '待确认',
    confirmed: '已确认',
    completed: '已核销',
    cancelled: '已取消',
  };
  return labels[value] || value || '-';
}

function paymentStatusLabel(value) {
  const labels = {
    unpaid: '未支付',
    paid: '已支付',
    refunded: '已退款',
    offline: '线下',
    settled: '已结算',
  };
  return labels[value] || value || '-';
}

function settlementStatusLabel(value) {
  const labels = {
    pending: '待核销',
    unsettled: '待核销',
    settled: '已核销',
  };
  return labels[value] || value || '-';
}

function normalizeReservationRow(row, type, collection) {
  return {
    ...row,
    __type: type,
    __collection: collection,
    __date: type === 'dining' ? row.reservation_date : row.checkin_date,
  };
}

async function submitLogin() {
  if (!state.username.trim() || !state.password) {
    toast('请输入账号和密码。', 'error');
    return;
  }

  state.loginLoading = true;
  try {
    await loginAdmin(state.username.trim(), state.password);
    state.password = '';
    state.loggedIn = true;
    toast('登录成功。');
    await loadRows();
  } catch (error) {
    clearToken();
    state.loggedIn = false;
    toast(error.message, 'error');
  } finally {
    state.loginLoading = false;
  }
}

function logout() {
  clearToken();
  state.loggedIn = false;
  state.rows = [];
  state.drawerOpen = false;
  setStatus('未连接');
  toast('已退出后台。');
}

function getFieldConfig(key) {
  if (isReservationsModule.value) {
    const labels = {
      __type: '类型',
      __date: '预定日期',
      reservation_status: '状态',
    };
    return activeModule.value.fields.find((field) => field.key === key) || { key, label: labels[key] || key };
  }
  return activeModule.value.fields.find((field) => field.key === key) || { key, label: key };
}

function getMealCategory(key) {
  return mealCategories.find((category) => category.key === key) || mealCategories[1];
}

function compareMealItems(left, right) {
  const leftCategory = getMealCategory(left.category_key);
  const rightCategory = getMealCategory(right.category_key);
  const leftCategorySort = Number(left.category_sort_order) || leftCategory.sort_order || 999;
  const rightCategorySort = Number(right.category_sort_order) || rightCategory.sort_order || 999;
  if (leftCategorySort !== rightCategorySort) return leftCategorySort - rightCategorySort;
  const leftSort = Number(left.sort_order) || 9999;
  const rightSort = Number(right.sort_order) || 9999;
  if (leftSort !== rightSort) return leftSort - rightSort;
  return String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hans-CN');
}

function compareSortOrder(left, right) {
  const leftSort = Number(left.sort_order) || 9999;
  const rightSort = Number(right.sort_order) || 9999;
  if (leftSort !== rightSort) return leftSort - rightSort;
  const leftName = left.name || left.table_name || left.title || '';
  const rightName = right.name || right.table_name || right.title || '';
  return String(leftName).localeCompare(String(rightName), 'zh-Hans-CN');
}

function normalizeMealDetails(value) {
  const list = Array.isArray(value) ? value : [];
  return list.map((item) => ({
    name: item?.name || '',
    quantity: item?.quantity || item?.content || '',
  })).filter((item) => item.name || item.quantity);
}

function normalizeStandardDishes(value) {
  const list = Array.isArray(value) ? value : [];
  return list.map((item) => ({
    name: item?.name || '',
    content: item?.content || item?.quantity || '',
  })).filter((item) => item.name || item.content);
}

function normalizeImageRows(value, previewValue, fallbackValue = '', fallbackPreview = '') {
  const values = Array.isArray(value) ? value : [];
  const previews = Array.isArray(previewValue) ? previewValue : [];
  const rows = values.map((item, index) => ({
    value: String(item || '').trim(),
    preview: previews[index] || (isBrowserImageUrl(item) ? item : ''),
  })).filter((item) => item.value);
  if (!rows.length && fallbackValue) {
    rows.push({
      value: String(fallbackValue).trim(),
      preview: fallbackPreview || (isBrowserImageUrl(fallbackValue) ? fallbackValue : ''),
    });
  }
  return rows;
}

function memberBenefitAccountId(memberId, benefitKey) {
  return `MBA_${memberId}_${benefitKey}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function normalizeBenefitNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeMemberBenefitRow(row = {}, memberId = form.member_id) {
  const benefitKey = row.benefit_key || '';
  const benefitType = row.benefit_type === 'quota' ? 'quota' : 'service';
  const totalQuota = benefitType === 'quota' ? normalizeBenefitNumber(row.total_quota) : 0;
  const usedQuota = benefitType === 'quota' ? normalizeBenefitNumber(row.used_quota) : 0;
  const lockedQuota = benefitType === 'quota' ? normalizeBenefitNumber(row.locked_quota) : 0;
  const remainingQuota = benefitType === 'quota' ? normalizeBenefitNumber(row.remaining_quota) : 0;
  return {
    _id: row._id || '',
    benefit_account_id: row.benefit_account_id || (memberId && benefitKey ? memberBenefitAccountId(memberId, benefitKey) : ''),
    member_id: row.member_id || memberId || '',
    level_id: row.level_id || form.level_id || '',
    benefit_key: benefitKey,
    benefit_name: row.benefit_name || '',
    benefit_type: benefitType,
    total_quota: totalQuota,
    used_quota: usedQuota,
    locked_quota: lockedQuota,
    remaining_quota: remainingQuota,
    quota_unit: benefitType === 'quota' ? row.quota_unit || '次' : '',
    valid_start_at: normalizeDateInput(row.valid_start_at || form.benefit_start_at),
    valid_end_at: normalizeDateInput(row.valid_end_at || form.benefit_end_at),
    account_status: row.account_status || 'active',
  };
}

function slugBenefitName(value, fallback = 'benefit') {
  const ascii = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return ascii || `${fallback}_${Date.now().toString(36)}`;
}

function normalizeLevelBenefitRow(row = {}, levelId = form.level_id) {
  const benefitType = row.benefit_type === 'quota' ? 'quota' : 'service';
  const benefitKey = row.benefit_key || slugBenefitName(row.benefit_name, benefitType);
  const totalQuota = benefitType === 'quota' ? normalizeBenefitNumber(row.total_quota) : 0;
  return {
    _id: row._id || '',
    level_benefit_id: row.level_benefit_id || (levelId && benefitKey ? `${levelId}_${benefitKey}` : ''),
    level_id: row.level_id || levelId || '',
    benefit_key: benefitKey,
    benefit_name: row.benefit_name || '',
    benefit_type: benefitType,
    total_quota: totalQuota,
    quota_unit: row.quota_unit || (benefitType === 'quota' ? '次' : ''),
    description: row.description || '',
    show_on_card: row.show_on_card !== false,
    applies_to: Array.isArray(row.applies_to) ? row.applies_to : [],
    rule: row.rule && typeof row.rule === 'object' ? row.rule : {},
    is_enabled: row.is_enabled !== false,
    sort_order: normalizeBenefitNumber(row.sort_order),
  };
}

function normalizeLevelBenefitRows(row = {}) {
  const levelId = row.level_id || form.level_id || '';
  return state.memberManage.levelBenefits
    .filter((benefit) => benefit.level_id === levelId)
    .sort(compareSortOrder)
    .map((benefit) => normalizeLevelBenefitRow(benefit, levelId));
}

function activeLevelBenefits(type) {
  return (form.__levelBenefitRows || []).filter((row) => row.benefit_type === type && row.is_enabled !== false);
}

function activeMemberBenefits(type) {
  return (form.__memberBenefitRows || []).filter((row) => row.benefit_type === type && row.account_status !== 'disabled');
}

function addLevelBenefitRow(type) {
  const benefitType = type === 'quota' ? 'quota' : 'service';
  form.__levelBenefitRows = form.__levelBenefitRows || [];
  form.__levelBenefitRows.push(normalizeLevelBenefitRow({
    benefit_type: benefitType,
    benefit_name: '',
    total_quota: benefitType === 'quota' ? 1 : 0,
    quota_unit: benefitType === 'quota' ? '次' : '',
    show_on_card: true,
    is_enabled: true,
  }, form.level_id));
}

function removeLevelBenefitRow(row) {
  if (!row) return;
  if (row._id || row.level_benefit_id) {
    row.is_enabled = false;
    return;
  }
  const index = (form.__levelBenefitRows || []).indexOf(row);
  if (index >= 0) form.__levelBenefitRows.splice(index, 1);
}

function levelBenefitToAccountRow(benefit, memberId = form.member_id) {
  const totalQuota = normalizeBenefitNumber(benefit.total_quota);
  return normalizeMemberBenefitRow({
    benefit_account_id: memberId && benefit.benefit_key ? memberBenefitAccountId(memberId, benefit.benefit_key) : '',
    member_id: memberId || '',
    level_id: benefit.level_id || form.level_id || '',
    benefit_key: benefit.benefit_key || '',
    benefit_name: benefit.benefit_name || '',
    benefit_type: benefit.benefit_type || 'service',
    total_quota: totalQuota,
    used_quota: 0,
    locked_quota: 0,
    remaining_quota: totalQuota,
    quota_unit: benefit.quota_unit || '',
    valid_start_at: form.benefit_start_at || '',
    valid_end_at: form.benefit_end_at || '',
    account_status: 'active',
  }, memberId);
}

function normalizeMemberBenefitRows(row = {}) {
  const memberId = row.member_id || form.member_id || '';
  const existing = state.memberManage.benefitAccounts
    .filter((account) => account.member_id === memberId)
    .map((account) => normalizeMemberBenefitRow(account, memberId));
  if (existing.length) return existing;
  return state.memberManage.levelBenefits
    .filter((benefit) => benefit.level_id === (row.level_id || form.level_id) && benefit.is_enabled !== false)
    .map((benefit) => levelBenefitToAccountRow(benefit, memberId));
}

function applyMemberLevelName() {
  const level = state.memberManage.levels.find((item) => item.level_id === form.level_id);
  form.member_level = level ? level.level_name : form.member_level || '';
}

function addLevelBenefitsToMember() {
  const existingKeys = new Set((form.__memberBenefitRows || []).map((row) => row.benefit_key).filter(Boolean));
  const nextRows = state.memberManage.levelBenefits
    .filter((benefit) => benefit.level_id === form.level_id && benefit.is_enabled !== false && !existingKeys.has(benefit.benefit_key))
    .map((benefit) => levelBenefitToAccountRow(benefit, form.member_id));
  form.__memberBenefitRows = (form.__memberBenefitRows || []).concat(nextRows);
}

function removeMemberBenefitRow(rowOrIndex) {
  const row = typeof rowOrIndex === 'number' ? form.__memberBenefitRows[rowOrIndex] : rowOrIndex;
  if (row && row.benefit_account_id) {
    row.account_status = 'disabled';
    return;
  }
  const index = (form.__memberBenefitRows || []).indexOf(row);
  if (index >= 0) form.__memberBenefitRows.splice(index, 1);
}

function recalculateMemberBenefitRemaining(row) {
  if (!row || row.benefit_type !== 'quota') return;
  row.remaining_quota = Math.max(0, normalizeBenefitNumber(row.total_quota) - normalizeBenefitNumber(row.used_quota) - normalizeBenefitNumber(row.locked_quota));
}

function newContentBlock(type = 'paragraph') {
  if (type === 'feature_grid') {
    return {
      type,
      items: [
        { title: '卖点标题', text: '卖点说明' },
        { title: '卖点标题', text: '卖点说明' },
      ],
    };
  }
  if (type === 'space_list') {
    return {
      type,
      items: [
        { title: '空间名称', text: '空间介绍' },
      ],
    };
  }
  if (type === 'list') return { type, items: ['列表内容'] };
  if (type === 'image') return { type, image_url: '' };
  if (type === 'contact') return { type, title: '欢迎咨询', text: '', image_url: '' };
  if (type === 'section_title') return { type, text: '小标题' };
  return { type, text: '' };
}

function normalizeContentBlocks(value, previewMap = {}) {
  const list = Array.isArray(value) ? value : [];
  return list.map((block) => {
    const next = { ...newContentBlock(block?.type || 'paragraph'), ...(block || {}) };
    next.type = next.type || 'paragraph';
    if (next.image_url && previewMap[next.image_url]) next.__preview_image_url = previewMap[next.image_url];
    if (!Array.isArray(next.items)) next.items = [];
    if (next.type === 'feature_grid' || next.type === 'space_list') {
      next.items = next.items.map((item) => ({
        title: item?.title || '',
        text: item?.text || item?.description || '',
      }));
    }
    if (next.type === 'list') {
      next.items = next.items.map((item) => (typeof item === 'string' ? item : item?.text || '')).filter(Boolean);
    }
    return next;
  });
}

function serializeContentBlocks() {
  return normalizeContentBlocks(form.__contentBlocks).map((block) => {
    const next = { type: block.type };
    if (['lead', 'section_title', 'paragraph', 'quote'].includes(block.type)) {
      next.text = String(block.text || '').trim();
    } else if (block.type === 'image') {
      next.image_url = String(block.image_url || '').trim();
    } else if (block.type === 'contact') {
      next.title = String(block.title || '').trim();
      next.text = String(block.text || '').trim();
      next.image_url = String(block.image_url || '').trim();
    } else if (block.type === 'feature_grid' || block.type === 'space_list') {
      next.items = (block.items || [])
        .map((item) => ({
          title: String(item.title || '').trim(),
          text: String(item.text || '').trim(),
        }))
        .filter((item) => item.title || item.text);
    } else if (block.type === 'list') {
      next.items = (block.items || [])
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    }
    return next;
  });
}

function addContentBlock(type = 'paragraph') {
  if (!Array.isArray(form.__contentBlocks)) form.__contentBlocks = [];
  form.__contentBlocks.push(newContentBlock(type));
}

function removeContentBlock(index) {
  if (!Array.isArray(form.__contentBlocks)) return;
  form.__contentBlocks.splice(index, 1);
}

function moveContentBlock(index, offset) {
  if (!Array.isArray(form.__contentBlocks)) return;
  const target = index + offset;
  if (target < 0 || target >= form.__contentBlocks.length) return;
  const [block] = form.__contentBlocks.splice(index, 1);
  form.__contentBlocks.splice(target, 0, block);
}

function addContentBlockItem(block) {
  if (!Array.isArray(block.items)) block.items = [];
  if (block.type === 'list') block.items.push('');
  else block.items.push({ title: '', text: '' });
}

function removeContentBlockItem(block, index) {
  if (!Array.isArray(block.items)) return;
  block.items.splice(index, 1);
}

function getPrimaryIdField(module = activeModule.value) {
  if (!module || module.key === OVERVIEW_KEY || module.key === RESERVATION_CALENDAR_KEY || module.key === RECENT_ACTIVITIES_KEY) return null;
  if (module.idField) return module.fields.find((field) => field.key === module.idField) || { key: module.idField };
  return module.fields.find((field) => field.required && /(^id$|_id$)/.test(field.key))
    || module.fields.find((field) => /(^id$|_id$)/.test(field.key))
    || null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nextRecordId(module = activeModule.value) {
  const idField = getPrimaryIdField(module);
  if (!idField) return '';
  const expression = new RegExp(`^${escapeRegExp(module.key)}(\\d+)$`, 'i');
  const maxNumber = state.rows.reduce((max, row) => {
    const match = expression.exec(String(row[idField.key] || ''));
    return match ? Math.max(max, Number(match[1]) || 0) : max;
  }, 0);
  return `${module.key}${String(maxNumber + 1).padStart(2, '0')}`;
}

function nextReservationId(collection) {
  const expression = new RegExp(`^${escapeRegExp(collection)}(\\d+)$`, 'i');
  const maxNumber = state.reservations.rows.reduce((max, row) => {
    if (row.__collection !== collection) return max;
    const match = expression.exec(String(row.reservation_id || ''));
    return match ? Math.max(max, Number(match[1]) || 0) : max;
  }, 0);
  return `${collection}${String(maxNumber + 1).padStart(2, '0')}`;
}

function applyMealCategory(key) {
  const category = getMealCategory(key === 'all' ? 'package' : key);
  form.category_key = category.key;
  form.category_name = category.name;
  form.category_sort_order = category.sort_order;
  form.item_type = category.key === 'package' ? 'package' : 'single';
  if (category.key !== 'package') form.__detailsRows = [];
}

function setMealCategory(key) {
  state.mealCategoryKey = key;
  state.draggingMealId = '';
}

function setFormMealCategory(key) {
  applyMealCategory(key);
}

function addMealDetail() {
  if (!Array.isArray(form.__detailsRows)) form.__detailsRows = [];
  form.__detailsRows.push({ name: '', quantity: '', content: '' });
}

function removeMealDetail(index) {
  if (!Array.isArray(form.__detailsRows)) return;
  form.__detailsRows.splice(index, 1);
}

function nextMealSortOrder(categoryKey) {
  const values = state.rows
    .filter((row) => row.category_key === categoryKey)
    .map((row) => Number(row.sort_order) || 0);
  return (values.length ? Math.max(...values) : 0) + 10;
}

function nextSortOrder() {
  const values = state.rows.map((row) => Number(row.sort_order) || 0);
  return (values.length ? Math.max(...values) : 0) + 10;
}

function tableQrPreviewUrl(row) {
  return row?._preview_urls?.qr_image_file_id || '';
}

function resetForm() {
  Object.keys(form).forEach((key) => delete form[key]);
  editorModule.value.fields.forEach((field) => {
    if (field.type === 'boolean') form[field.key] = false;
    else if (field.type === 'number') form[field.key] = '';
    else if (field.type === 'json') form[field.key] = '[]';
    else if (field.type === 'itemDetails' || field.type === 'standardDishes') form.__detailsRows = [];
    else if (field.type === 'images') form[`__${field.key}Rows`] = [];
    else if (field.type === 'contentBlocks') {
      form[field.key] = [];
      form.__contentBlocks = [];
    }
    else form[field.key] = '';
  });
  fileInputs.value = {};
  multiFileInputs.value = {};
  videoFileInputs.value = {};
  contentBlockFileInputs.value = {};
}

function normalizeDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatJson(value) {
  if (value === undefined || value === null || value === '') return '[]';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch (error) {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

function openCreate() {
  if (isReservationsModule.value) {
    openCreateReservation('dining_reservations');
    return;
  }
  state.editingCollection = activeModule.value.key;
  resetForm();
  const idField = getPrimaryIdField(editorModule.value);
  if (idField && activeModule.value.key !== 'members') form[idField.key] = nextRecordId();
  ['is_available', 'is_enabled'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(form, key)) form[key] = true;
  });
  if (isMealItemsModule.value) {
    applyMealCategory(state.mealCategoryKey);
    form.sort_order = nextMealSortOrder(form.category_key);
    form.is_available = true;
  }
  if (isMealTablesModule.value) {
    form.table_status = 'enabled';
    form.sort_order = nextSortOrder();
    form.qr_version = 0;
    form.current_session_id = '';
  }
  if (isRoomCatalogModule.value) {
    form.is_available = true;
    form.sort_order = nextSortOrder();
  }
  if (isBannerModule.value) {
    form.is_enabled = true;
    form.link_type = form.link_type || 'none';
    form.sort_order = nextSortOrder();
  }
  if (isContentPagesModule.value) {
    form.page_type = 'intro';
    form.page_status = 'draft';
    form.is_active = false;
    form.__contentBlocks = [];
  }
  if (activeModule.value.key === 'members') {
    form.member_status = 'active';
    form.__memberBenefitRows = [];
  }
  if (activeModule.value.key === 'member_levels') {
    form.is_enabled = true;
    form.sort_order = nextSortOrder();
    form.__levelBenefitRows = [];
  }
  if (activeModule.value.key === 'member_level_benefits') {
    form.benefit_type = 'service';
    form.is_enabled = true;
    form.show_on_card = true;
    form.sort_order = nextSortOrder();
  }
  if (activeModule.value.key === 'member_benefit_accounts') {
    form.benefit_type = 'quota';
    form.total_quota = 0;
    form.used_quota = 0;
    form.locked_quota = 0;
    form.remaining_quota = 0;
    form.account_status = 'active';
  }
  state.editingId = '';
  state.drawerOpen = true;
}

function openEdit(row) {
  state.editingCollection = row.__collection || activeModule.value.key;
  resetForm();
  editorModule.value.fields.forEach((field) => {
    const value = row[field.key];
    if (field.type === 'datetime') form[field.key] = normalizeDateInput(value);
    else if (field.type === 'json') form[field.key] = formatJson(value);
    else if (field.type === 'itemDetails') form.__detailsRows = normalizeMealDetails(value);
    else if (field.type === 'standardDishes') form.__detailsRows = normalizeStandardDishes(value);
    else if (field.type === 'contentBlocks') form.__contentBlocks = normalizeContentBlocks(value, row._content_preview_urls || {});
    else if (field.type === 'memberBenefits') form.__memberBenefitRows = normalizeMemberBenefitRows(row);
    else if (field.type === 'levelBenefits') form.__levelBenefitRows = normalizeLevelBenefitRows(row);
    else if (field.type === 'images') {
      const shouldFallbackToPrimaryImage = field.key === 'image_urls';
      form[`__${field.key}Rows`] = normalizeImageRows(
        value,
        row._preview_urls?.[field.key],
        shouldFallbackToPrimaryImage ? row.image_url || '' : '',
        shouldFallbackToPrimaryImage ? row._preview_urls?.image_url || '' : '',
      );
    }
    else if (field.type === 'boolean') form[field.key] = value === true;
    else form[field.key] = value ?? '';

    if (field.type === 'image' && row._preview_urls?.[field.key]) {
      form[`__preview_${field.key}`] = row._preview_urls[field.key];
    }
  });
  if (isMealItemsModule.value) applyMealCategory(form.category_key || 'package');
  state.editingId = row._id;
  state.drawerOpen = true;
}

function closeDrawer() {
  state.drawerOpen = false;
  state.editingCollection = '';
}

async function loadRows() {
  if (!state.loggedIn) return;
  if (isOverview.value) {
    await loadOverview();
    return;
  }
  if (isReservationCalendar.value) {
    await loadReservationCalendar();
    return;
  }
  if (isRecentActivities.value) {
    await loadRecentActivities();
    return;
  }
  if (isReservationsModule.value) {
    await loadReservations();
    return;
  }

  state.loading = true;
  setStatus('连接中', 'muted');
  try {
    if (isMembersModule.value || isMemberLevelsModule.value) {
      await loadMemberManageData();
    }
    const data = await callAdmin('list', {
      collection: activeModule.value.key,
      page_size: 100,
    });
    state.rows = data.rows || [];
    setStatus('已连接', 'ok');
  } catch (error) {
    state.rows = [];
    setStatus('连接失败', 'muted');
    if (String(error.message || '').includes('登录')) state.loggedIn = false;
    toast(error.message, 'error');
  } finally {
    state.loading = false;
  }
}

async function loadMemberManageData() {
  const [levels, levelBenefits, benefitAccounts] = await Promise.all([
    callAdmin('list', { collection: 'member_levels', page_size: 100 }),
    callAdmin('list', { collection: 'member_level_benefits', page_size: 100 }),
    callAdmin('list', { collection: 'member_benefit_accounts', page_size: 100 }),
  ]);
  state.memberManage.levels = levels.rows || [];
  state.memberManage.levelBenefits = levelBenefits.rows || [];
  state.memberManage.benefitAccounts = benefitAccounts.rows || [];
}

async function loadOverview() {
  state.loading = true;
  setStatus('连接中', 'muted');
  try {
    const [tables, mealOrders, tableSessions] = await Promise.all([
      callAdmin('list', { collection: 'meal_tables', page_size: 100 }),
      callAdmin('list', { collection: 'meal_orders', page_size: 100 }),
      callAdmin('list', { collection: 'meal_table_sessions', page_size: 100 }),
    ]);
    state.overview.tables = tables.rows || [];
    state.overview.mealOrders = mealOrders.rows || [];
    state.overview.tableSessions = tableSessions.rows || [];
    if (!state.overview.selectedTableId && state.overview.tables.length) {
      state.overview.selectedTableId = getTableId(state.overview.tables[0]);
    }
    state.rows = [];
    setStatus('已连接', 'ok');
  } catch (error) {
    state.overview.tables = [];
    state.overview.mealOrders = [];
    state.overview.tableSessions = [];
    setStatus('连接失败', 'muted');
    if (String(error.message || '').includes('登录')) state.loggedIn = false;
    toast(error.message, 'error');
  } finally {
    state.loading = false;
  }
}

async function loadReservationCalendar() {
  state.loading = true;
  setStatus('连接中', 'muted');
  try {
    const [diningReservations, accommodationReservations] = await Promise.all([
      callAdmin('list', { collection: 'dining_reservations', page_size: 100 }),
      callAdmin('list', { collection: 'accommodation_reservations', page_size: 100 }),
    ]);
    state.calendar.diningReservations = diningReservations.rows || [];
    state.calendar.accommodationReservations = accommodationReservations.rows || [];
    state.rows = [];
    setStatus('已连接', 'ok');
  } catch (error) {
    state.calendar.diningReservations = [];
    state.calendar.accommodationReservations = [];
    setStatus('连接失败', 'muted');
    if (String(error.message || '').includes('登录')) state.loggedIn = false;
    toast(error.message, 'error');
  } finally {
    state.loading = false;
  }
}

async function loadRecentActivities() {
  state.loading = true;
  setStatus('连接中', 'muted');
  try {
    const [activities, signups] = await Promise.all([
      callAdmin('list', { collection: 'activity_items', page_size: 100 }),
      callAdmin('list', { collection: 'activity_signups', page_size: 100 }),
    ]);
    state.activityOverview.activities = activities.rows || [];
    state.activityOverview.signups = signups.rows || [];
    const exists = state.activityOverview.activities.some((activity) => activity.activity_id === state.activityOverview.selectedActivityId);
    if (!exists) {
      const next = state.activityOverview.activities.filter(isUpcomingActivity).sort(compareActivities)[0];
      state.activityOverview.selectedActivityId = next?.activity_id || '';
    }
    state.rows = [];
    setStatus('已连接', 'ok');
  } catch (error) {
    state.activityOverview.activities = [];
    state.activityOverview.signups = [];
    state.rows = [];
    setStatus('连接失败', 'muted');
    if (String(error.message || '').includes('登录')) state.loggedIn = false;
    toast(error.message, 'error');
  } finally {
    state.loading = false;
  }
}

async function loadReservations() {
  state.loading = true;
  setStatus('连接中', 'muted');
  try {
    const [diningReservations, accommodationReservations] = await Promise.all([
      callAdmin('list', { collection: 'dining_reservations', page_size: 100 }),
      callAdmin('list', { collection: 'accommodation_reservations', page_size: 100 }),
    ]);
    state.reservations.rows = [
      ...(diningReservations.rows || []).map((row) => normalizeReservationRow(row, 'dining', 'dining_reservations')),
      ...(accommodationReservations.rows || []).map((row) => normalizeReservationRow(row, 'accommodation', 'accommodation_reservations')),
    ];
    state.rows = state.reservations.rows;
    setStatus('已连接', 'ok');
  } catch (error) {
    state.reservations.rows = [];
    state.rows = [];
    setStatus('连接失败', 'muted');
    if (String(error.message || '').includes('登录')) state.loggedIn = false;
    toast(error.message, 'error');
  } finally {
    state.loading = false;
  }
}

async function switchModule(key) {
  state.activeKey = key;
  state.drawerOpen = false;
  state.editingCollection = '';
  state.calendar.selectedEvent = null;
  state.draggingIndex = -1;
  state.draggingBannerId = '';
  state.draggingMealId = '';
  state.draggingDiningRoomId = '';
  if (key !== RECENT_ACTIVITIES_KEY) state.activityOverview.statusFilter = 'pending';
  if (key !== 'meal_items') state.mealCategoryKey = 'all';
  await loadRows();
}

function toggleNavGroup(name) {
  state.collapsedNavGroups[name] = !state.collapsedNavGroups[name];
}

async function openDashboardEvent(event) {
  state.calendar.selectedEvent = event || null;
}

function closeReservationDetail() {
  state.calendar.selectedEvent = null;
}

async function confirmReservationEvent(event) {
  if (!event?.collection || !event?.row?._id) return;
  state.saving = true;
  try {
    await callAdmin('reservationStatusUpdate', {
      collection: event.collection,
      _id: event.row._id,
      reservation_status: 'confirmed',
      admin_remark: event.row.admin_remark || '',
    });
    await loadReservationCalendar();
    const nextEvent = dashboardEvents.value.find((item) => item.collection === event.collection && item.row._id === event.row._id);
    state.calendar.selectedEvent = nextEvent || null;
    toast('预约已确认。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

async function confirmActivitySignup(row) {
  if (!row?._id) return;
  state.saving = true;
  try {
    await callAdmin('activitySignupStatusUpdate', {
      _id: row._id,
      signup_status: 'confirmed',
      admin_remark: row.admin_remark || row.success_notice_remark || '',
    });
    await loadRows();
    toast('活动报名已确认，通知已发送。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

async function cancelActivitySignup(row) {
  if (!row?._id) return;
  if (!window.confirm(`确认取消“${row.contact_name || row.order_no || '该报名'}”？`)) return;
  state.saving = true;
  try {
    await callAdmin('activitySignupStatusUpdate', {
      _id: row._id,
      signup_status: 'cancelled',
      admin_remark: row.admin_remark || '后台取消报名',
    });
    await loadRows();
    toast('活动报名已取消。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

async function settleActivitySignup(row) {
  if (!row?._id) return;
  state.saving = true;
  try {
    await callAdmin('activitySignupStatusUpdate', {
      _id: row._id,
      signup_status: 'completed',
      settle: true,
      admin_remark: row.admin_remark || row.success_notice_remark || '',
    });
    await loadRows();
    toast('活动报名已核销。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

async function settleMemberReservationEvent(event) {
  if (!event?.collection || !event?.row?._id) return;
  state.saving = true;
  try {
    await callAdmin('reservationStatusUpdate', {
      collection: event.collection,
      _id: event.row._id,
      settle: true,
      admin_remark: event.row.admin_remark || '会员线下核对完成',
    });
    await loadReservationCalendar();
    const nextEvent = dashboardEvents.value.find((item) => item.collection === event.collection && item.row._id === event.row._id);
    state.calendar.selectedEvent = nextEvent || null;
    toast('会员核销已完成。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

async function editReservationEvent(event) {
  if (!event?.collection || !event?.row) return;
  state.activeKey = RESERVATIONS_KEY;
  state.drawerOpen = false;
  state.calendar.selectedEvent = null;
  await loadRows();
  const found = state.reservations.rows.find((row) => row.__collection === event.collection && row._id === event.row._id);
  openEdit(found || normalizeReservationRow(event.row, event.type, event.collection));
}

async function openCreateReservation(collection) {
  if (!isReservationsModule.value) {
    state.activeKey = RESERVATIONS_KEY;
    await loadRows();
  }
  resetForm();
  const type = collection === 'dining_reservations' ? 'dining' : 'accommodation';
  form.__collection = collection;
  form.__type = type;
  form.reservation_id = nextReservationId(collection);
  form.reservation_status = 'pending_confirmation';
  state.editingId = '';
  state.editingCollection = collection;
  state.drawerOpen = true;
}

function selectOverviewTable(table) {
  state.overview.selectedTableId = getTableId(table);
  state.overview.moveTargetTableId = '';
}

function closeOverviewTablePanel() {
  state.overview.selectedTableId = '';
  state.overview.moveTargetTableId = '';
}

async function moveSelectedTableOrder() {
  const fromTable = selectedTable.value;
  const targetTable = state.overview.tables.find((table) => getTableId(table) === state.overview.moveTargetTableId);
  if (!fromTable || !targetTable) {
    toast('请选择要移到的新桌台。', 'error');
    return;
  }
  if (!selectedTableOrders.value.length) {
    toast('当前桌台没有可移动的点餐订单。', 'error');
    return;
  }

  state.saving = true;
  try {
    const session = getTableSession(fromTable);
    for (const order of selectedTableOrders.value) {
      await callAdmin('update', {
        collection: 'meal_orders',
        _id: order._id,
        data: {
          table_id: targetTable.table_id || '',
          table_name: targetTable.table_name || '',
        },
      });
    }
    if (session?._id) {
      await callAdmin('update', {
        collection: 'meal_table_sessions',
        _id: session._id,
        data: {
          table_id: targetTable.table_id || '',
          table_name: targetTable.table_name || '',
          table_area: targetTable.table_area || '',
        },
      });
    }
    if (fromTable._id && fromTable.current_session_id) {
      await callAdmin('update', {
        collection: 'meal_tables',
        _id: fromTable._id,
        data: { current_session_id: '' },
      });
    }
    if (targetTable._id && fromTable.current_session_id) {
      await callAdmin('update', {
        collection: 'meal_tables',
        _id: targetTable._id,
        data: { current_session_id: fromTable.current_session_id },
      });
    }
    state.overview.selectedTableId = getTableId(targetTable);
    state.overview.moveTargetTableId = '';
    await loadOverview();
    toast('已完成移桌。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

async function clearSelectedTable() {
  const table = selectedTable.value;
  if (!table) return;
  if (!window.confirm(`确认清台“${table.table_name || table.table_id}”？`)) return;

  state.saving = true;
  try {
    const session = getTableSession(table);
    if (session?._id) {
      await callAdmin('update', {
        collection: 'meal_table_sessions',
        _id: session._id,
        data: {
          session_status: 'closed',
          closed_reason: 'cleared_by_admin',
          closed_at: new Date().toISOString(),
        },
      });
    }
    if (table._id) {
      await callAdmin('update', {
        collection: 'meal_tables',
        _id: table._id,
        data: { current_session_id: '' },
      });
    }
    for (const order of selectedTableOrders.value) {
      await callAdmin('update', {
        collection: 'meal_orders',
        _id: order._id,
        data: {
          order_status: 'completed',
          payment_status: order.payment_status || 'settled',
        },
      });
    }
    await loadOverview();
    toast('已清台。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

async function completeAndClearSelectedTable() {
  const table = selectedTable.value;
  const orders = selectedTableOrders.value.slice();
  if (!table) return;
  if (!orders.length) {
    toast('当前桌台没有点餐订单。', 'error');
    return;
  }
  if (!window.confirm(`确认完成并清台“${table.table_name || table.table_id}”？`)) return;

  state.saving = true;
  try {
    const session = getTableSession(table);
    for (const order of orders) {
      await callAdmin('mealOrderStatusUpdate', {
        _id: order._id,
        order_status: 'completed',
        settle: true,
        admin_remark: '后台桌台总览完成并清台',
      });
    }
    if (session?._id) {
      await callAdmin('update', {
        collection: 'meal_table_sessions',
        _id: session._id,
        data: {
          session_status: 'closed',
          closed_reason: 'completed_and_cleared_by_admin',
          closed_at: new Date().toISOString(),
        },
      });
    }
    if (table._id) {
      await callAdmin('update', {
        collection: 'meal_tables',
        _id: table._id,
        data: { current_session_id: '' },
      });
    }
    state.overview.moveTargetTableId = '';
    await loadOverview();
    toast('已完成并清台。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

async function updateSelectedTableMealOrders(action) {
  const orders = selectedTableOrders.value;
  if (!orders.length) {
    toast('当前桌台没有点餐订单。', 'error');
    return;
  }
  const actionLabels = {
    preparing: '制作中',
    completed: '已完成',
    settled: '已结算',
  };
  const label = actionLabels[action] || action;
  if (!window.confirm(`确认将当前桌台订单更新为“${label}”？`)) return;

  state.saving = true;
  try {
    for (const order of orders) {
      await callAdmin('mealOrderStatusUpdate', {
        _id: order._id,
        order_status: action === 'settled' ? '' : action,
        settle: action === 'settled',
        admin_remark: `后台桌台总览更新为${label}`,
      });
    }
    await loadOverview();
    toast(`已更新为${label}。`);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

function getBannerKey(row, index) {
  return row._id || row.__temp_id || `banner-row-${index}`;
}

function addBanner() {
  const nextNumber = state.rows.length + 1;
  const bannerId = nextRecordId(modules.find((item) => item.key === 'home_banners'));
  state.rows.push({
    __isNew: true,
    __temp_id: bannerId || `banner_${Date.now()}`,
    banner_id: bannerId,
    image_url: '',
    kicker: '',
    title: '',
    description: '',
    link_type: 'none',
    link_target: '',
    sort_order: nextNumber * 10,
    is_enabled: true,
    _preview_urls: {},
  });
  normalizeBannerSorts();
}

function bannerPreviewUrl(row) {
  return row.__preview_image_url || row._preview_urls?.image_url || '';
}

function normalizeBannerSorts() {
  state.rows.forEach((row, index) => {
    row.sort_order = (index + 1) * 10;
  });
}

function onBannerDragStart(index) {
  state.draggingIndex = index;
}

function onBannerDrop(index) {
  const from = state.draggingIndex;
  state.draggingIndex = -1;
  if (from < 0 || from === index) return;

  const [row] = state.rows.splice(from, 1);
  state.rows.splice(index, 0, row);
  normalizeBannerSorts();
}

function onBannerDragEnd() {
  state.draggingIndex = -1;
}

async function uploadBannerImage(row, index) {
  const key = getBannerKey(row, index);
  const input = bannerFileInputs.value[key];
  const file = input?.files?.[0];
  if (!file) {
    toast('请先选择图片。', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast('图片不能超过 5MB。', 'error');
    return;
  }

  state.uploadingField = key;
  try {
    const base64 = await fileToBase64(file);
    const data = await callAdmin('uploadImage', {
      collection: 'home_banners',
      field: 'image_url',
      file_name: file.name,
      content_type: file.type,
      base64,
    });
    row.image_url = data.fileID;
    row.__preview_image_url = URL.createObjectURL(file);
    if (!row._preview_urls) row._preview_urls = {};
    row._preview_urls.image_url = row.__preview_image_url;
    toast('轮播图片已上传到 home/banners。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.uploadingField = '';
  }
}

function buildBannerPayload(row) {
  return {
    banner_id: String(row.banner_id || '').trim(),
    image_url: String(row.image_url || '').trim(),
    kicker: String(row.kicker || '').trim(),
    title: String(row.title || '').trim(),
    description: String(row.description || '').trim(),
    link_type: row.link_type || 'none',
    link_target: String(row.link_target || '').trim(),
    sort_order: Number(row.sort_order) || 0,
    is_enabled: row.is_enabled === true,
    start_at: row.start_at || '',
    end_at: row.end_at || '',
  };
}

async function saveBanners() {
  const missing = state.rows.find((row) => !String(row.banner_id || '').trim() || !String(row.title || '').trim());
  if (missing) {
    toast('请填写每条轮播的主标题。', 'error');
    return;
  }

  normalizeBannerSorts();
  state.saving = true;
  try {
    for (const row of state.rows) {
      const data = buildBannerPayload(row);
      if (row.__isNew) {
        await callAdmin('create', { collection: 'home_banners', data });
      } else {
        await callAdmin('update', { collection: 'home_banners', _id: row._id, data });
      }
    }
    await loadRows();
    toast('轮播已保存。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

async function deleteBanner(row, index) {
  const title = row.title || row.banner_id || '这条轮播';
  if (!window.confirm(`确认删除“${title}”？`)) return;

  if (row.__isNew) {
    state.rows.splice(index, 1);
    normalizeBannerSorts();
    return;
  }

  try {
    await callAdmin('delete', { collection: 'home_banners', _id: row._id });
    await loadRows();
    toast('轮播已删除。');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function previewUrl(row, fieldKey) {
  const value = row._preview_urls?.[fieldKey] || row[fieldKey] || '';
  return isBrowserImageUrl(value) ? value : '';
}

function formPreviewUrl(fieldKey) {
  const value = form[`__preview_${fieldKey}`] || form[fieldKey] || '';
  return isBrowserImageUrl(value) ? value : '';
}

function imageStyle(fieldKey) {
  return { aspectRatio: editorModule.value.imageRatios?.[fieldKey] || '16 / 9' };
}

function uploadContextPayload() {
  return {
    record_title: form.title || form.name || '',
    activity_title: form.title || '',
    activity_id: form.activity_id || '',
  };
}

function isBrowserImageUrl(value) {
  return /^(https?:\/\/|blob:|data:image\/)/i.test(String(value || '').trim());
}

function isCloudFile(value) {
  return String(value || '').trim().startsWith('cloud://');
}

async function resolveFormPreview(field) {
  const value = String(form[field.key] || '').trim();
  if (!value || isBrowserImageUrl(value)) {
    form[`__preview_${field.key}`] = isBrowserImageUrl(value) ? value : '';
    return;
  }
  if (!isCloudFile(value)) {
    form[`__preview_${field.key}`] = '';
    return;
  }

  state.previewingField = field.key;
  try {
    const data = await callAdmin('previewImage', {
      collection: editorModule.value.key,
      field: field.key,
      value,
    });
    form[`__preview_${field.key}`] = data.tempFileURL;
  } catch (error) {
    form[`__preview_${field.key}`] = '';
    toast(error.message, 'error');
  } finally {
    state.previewingField = '';
  }
}

function clearFieldPreview(fieldKey) {
  form[`__preview_${fieldKey}`] = '';
}

function displayValue(row, fieldKey) {
  const value = row[fieldKey];
  if (value === true) return '是';
  if (value === false) return '否';
  if (value === undefined || value === null || value === '') return '-';
  if (Array.isArray(value)) return `${value.length} 项`;
  if (typeof value === 'object') return 'JSON';
  return String(value);
}

function isToggleColumn(column) {
  return toggleColumns.includes(column);
}

function isToggleActive(row, column) {
  if (column === 'table_status') return (row.table_status || 'enabled') === 'enabled';
  return row[column] === true;
}

function toggleLabel(row, column) {
  const active = isToggleActive(row, column);
  if (column === 'table_status') return active ? '启用' : '停用';
  if (column === 'is_enabled') return active ? '启用' : '停用';
  if (column === 'show_on_card') return active ? '显示' : '隐藏';
  if (activeModule.value.key === 'meal_items') return active ? '可售' : '停售';
  return active ? '可用' : '停用';
}

async function toggleStatusField(row, column) {
  if (!isToggleColumn(column) || !row?._id || state.saving || isVirtualModule.value) return;
  const previousValue = row[column];
  const nextValue = column === 'table_status'
    ? ((row.table_status || 'enabled') === 'enabled' ? 'disabled' : 'enabled')
    : row[column] !== true;
  row[column] = nextValue;

  state.saving = true;
  try {
    await callAdmin('update', {
      collection: activeModule.value.key,
      _id: row._id,
      data: { [column]: nextValue },
    });
    toast(`${getFieldConfig(column).label}已更新为${toggleLabel(row, column)}。`);
  } catch (error) {
    row[column] = previousValue;
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

function buildPayload() {
  const payload = {};
  editorModule.value.fields.forEach((field) => {
    if (field.type === 'memberBenefits') return;
    if (field.type === 'levelBenefits') return;
    let value = form[field.key];
    if (field.type === 'number') {
      value = value === '' || value === null ? null : Number(value);
    } else if (field.type === 'boolean') {
      value = value === true;
    } else if (field.type === 'datetime') {
      value = value ? new Date(value).toISOString() : '';
    } else if (field.type === 'json') {
      try {
        value = value ? JSON.parse(value) : [];
      } catch (error) {
        throw new Error(`${field.label} 不是合法 JSON。`);
      }
    } else if (field.type === 'itemDetails') {
      value = normalizeMealDetails(form.__detailsRows);
    } else if (field.type === 'standardDishes') {
      value = normalizeStandardDishes(form.__detailsRows);
    } else if (field.type === 'images') {
      value = (form[`__${field.key}Rows`] || [])
        .map((item) => String(item.value || '').trim())
        .filter(Boolean);
    } else if (field.type === 'contentBlocks') {
      value = serializeContentBlocks();
    } else {
      value = typeof value === 'string' ? value.trim() : value;
    }
    payload[field.key] = value;
  });
  const idField = getPrimaryIdField();
  if (isMembersModule.value && !payload.member_id) {
    throw new Error('请填写线下会员ID/卡号。');
  }
  if (idField && !state.editingId && !isMembersModule.value) payload[idField.key] = payload[idField.key] || nextRecordId(editorModule.value);
  if (isMealItemsModule.value) {
    const category = getMealCategory(payload.category_key || state.mealCategoryKey);
    payload.category_key = category.key;
    payload.category_name = category.name;
    payload.category_sort_order = category.sort_order;
    payload.item_type = category.key === 'package' ? 'package' : 'single';
    payload.sort_order = Number(payload.sort_order) || nextMealSortOrder(category.key);
    if (category.key !== 'package') payload.details = [];
  }
  if (isMealTablesModule.value) {
    payload.table_status = payload.table_status || 'enabled';
    payload.sort_order = Number(payload.sort_order) || nextSortOrder();
    payload.qr_version = Number(payload.qr_version) || 0;
    payload.current_session_id = payload.current_session_id || '';
  }
  if (isAccommodationRoomsModule.value) {
    payload.image_urls = Array.isArray(payload.image_urls) ? payload.image_urls : [];
    payload.image_url = payload.image_urls[0] || payload.image_url || '';
  }
  if (isRoomCatalogModule.value) {
    payload.is_available = payload.is_available === true;
    payload.sort_order = Number(payload.sort_order) || nextSortOrder();
  }
  if (isContentPagesModule.value) {
    payload.page_type = payload.page_type || 'intro';
    payload.page_status = payload.page_status || 'draft';
    payload.is_active = payload.is_active === true;
    if (!payload.published_at && payload.page_status === 'published') {
      payload.published_at = new Date().toISOString();
    }
  }
  if (isMembersModule.value) {
    applyMemberLevelName();
    payload.member_level = form.member_level || payload.member_level || '';
  }
  return payload;
}

function serializeLevelBenefitRows(levelPayload) {
  const levelId = levelPayload.level_id || form.level_id;
  return (form.__levelBenefitRows || []).map((row, index) => {
    const normalized = normalizeLevelBenefitRow(row, levelId);
    const sortOrder = normalized.sort_order || (index + 1) * 10;
    const benefitKey = normalized.benefit_key || slugBenefitName(normalized.benefit_name, normalized.benefit_type);
    return {
      _id: normalized._id,
      level_benefit_id: normalized.level_benefit_id || `${levelId}_${benefitKey}`,
      level_id: levelId,
      benefit_key: benefitKey,
      benefit_name: String(normalized.benefit_name || '').trim(),
      benefit_type: normalized.benefit_type,
      total_quota: normalized.benefit_type === 'quota' ? normalizeBenefitNumber(normalized.total_quota) : 0,
      quota_unit: normalized.benefit_type === 'quota' ? String(normalized.quota_unit || '次').trim() : '',
      description: String(normalized.description || '').trim(),
      show_on_card: normalized.show_on_card === true,
      applies_to: normalized.applies_to,
      rule: normalized.rule,
      is_enabled: normalized.is_enabled !== false,
      sort_order: sortOrder,
    };
  }).filter((row) => row.benefit_name || row.is_enabled === false);
}

async function syncLevelBenefitRows(levelPayload) {
  const levelId = levelPayload.level_id || form.level_id;
  if (!levelId) throw new Error('请先填写等级 ID。');

  const rows = serializeLevelBenefitRows(levelPayload);
  const activeMissing = rows.find((row) => row.is_enabled !== false && !row.benefit_name);
  if (activeMissing) throw new Error('请填写每条等级权益的名称。');

  for (const row of rows) {
    const data = { ...row };
    const id = data._id;
    delete data._id;
    if (id) {
      await callAdmin('update', { collection: 'member_level_benefits', _id: id, data });
    } else {
      await callAdmin('create', { collection: 'member_level_benefits', data });
    }
  }
}

async function syncMemberBenefitRows(memberPayload) {
  const rows = (form.__memberBenefitRows || []).map((row) => {
    const normalized = normalizeMemberBenefitRow(row, memberPayload.member_id || form.member_id);
    return {
      benefit_account_id: normalized.benefit_account_id,
      member_id: memberPayload.member_id || form.member_id,
      level_id: normalized.level_id || memberPayload.level_id || form.level_id,
      benefit_key: normalized.benefit_key,
      benefit_name: normalized.benefit_name,
      benefit_type: normalized.benefit_type,
      total_quota: normalized.total_quota,
      used_quota: normalized.used_quota,
      locked_quota: normalized.locked_quota,
      remaining_quota: normalized.remaining_quota,
      quota_unit: normalized.quota_unit,
      valid_start_at: normalized.valid_start_at ? new Date(normalized.valid_start_at).toISOString() : '',
      valid_end_at: normalized.valid_end_at ? new Date(normalized.valid_end_at).toISOString() : '',
      account_status: normalized.account_status,
    };
  });

  await callAdmin('updateMemberBenefits', {
    member_id: memberPayload.member_id || form.member_id,
    level_id: memberPayload.level_id || form.level_id,
    benefit_start_at: memberPayload.benefit_start_at || form.benefit_start_at,
    benefit_end_at: memberPayload.benefit_end_at || form.benefit_end_at,
    benefits: rows,
  });
}

async function saveRecord() {
  let payload;
  try {
    payload = buildPayload();
  } catch (error) {
    toast(error.message, 'error');
    return;
  }

  const missing = editorModule.value.fields.find((field) => field.required && !payload[field.key]);
  if (missing) {
    toast(`请填写 ${missing.label}。`, 'error');
    return;
  }

  state.saving = true;
  try {
    const collection = state.editingCollection || activeModule.value.key;
    if (state.editingId) {
      await callAdmin('update', { collection, _id: state.editingId, data: payload });
    } else {
      await callAdmin('create', { collection, data: payload });
    }
    if (isMembersModule.value) {
      await syncMemberBenefitRows(payload);
    }
    if (isMemberLevelsModule.value) {
      await syncLevelBenefitRows(payload);
    }
    closeDrawer();
    await loadRows();
    toast('记录已保存。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

async function duplicateContentPage(row) {
  if (!row?._id) return;
  state.duplicatingContentId = row._id;
  try {
    await callAdmin('duplicateContentPage', { _id: row._id });
    await loadRows();
    toast('内容已复制为草稿。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.duplicatingContentId = '';
  }
}

async function activateContentPage(row) {
  if (!row?._id) return;
  if (row.page_type !== 'intro') {
    toast('只有介绍类型内容可以设为当前介绍。', 'error');
    return;
  }
  state.activatingContentId = row._id;
  try {
    await callAdmin('activateContentPage', { _id: row._id });
    await loadRows();
    toast('已设为当前介绍页。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.activatingContentId = '';
  }
}

async function deleteRecord(row) {
  const title = row[titleField.value] || row._id;
  if (!window.confirm(`确认删除“${title}”？`)) return;
  try {
    await callAdmin('delete', { collection: row.__collection || activeModule.value.key, _id: row._id });
    await loadRows();
    toast('记录已删除。');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function onMealDragStart(row) {
  state.draggingMealId = row._id;
}

function onMealDragEnd() {
  state.draggingMealId = '';
}

async function onMealDrop(targetRow) {
  const draggedId = state.draggingMealId;
  state.draggingMealId = '';
  if (!draggedId || draggedId === targetRow._id) return;

  const draggedRow = state.rows.find((row) => row._id === draggedId);
  if (!draggedRow) return;
  if (draggedRow.category_key !== targetRow.category_key) {
    toast('请先切到同一分类里排序。', 'error');
    return;
  }

  const categoryRows = state.rows
    .filter((row) => row.category_key === targetRow.category_key)
    .slice()
    .sort(compareMealItems);
  const from = categoryRows.findIndex((row) => row._id === draggedId);
  const to = categoryRows.findIndex((row) => row._id === targetRow._id);
  if (from < 0 || to < 0 || from === to) return;

  const [row] = categoryRows.splice(from, 1);
  categoryRows.splice(to, 0, row);
  categoryRows.forEach((item, index) => {
    item.sort_order = (index + 1) * 10;
  });

  state.saving = true;
  try {
    for (const item of categoryRows) {
      await callAdmin('update', {
        collection: 'meal_items',
        _id: item._id,
        data: { sort_order: item.sort_order },
      });
    }
    await loadRows();
    toast('菜品排序已保存。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

function onBannerTableDragStart(row) {
  state.draggingBannerId = row._id;
}

function onBannerTableDragEnd() {
  state.draggingBannerId = '';
}

async function onBannerTableDrop(targetRow) {
  const draggedId = state.draggingBannerId;
  state.draggingBannerId = '';
  if (!draggedId || draggedId === targetRow._id) return;

  const sortedRows = state.rows.slice().sort(compareSortOrder);
  const from = sortedRows.findIndex((row) => row._id === draggedId);
  const to = sortedRows.findIndex((row) => row._id === targetRow._id);
  if (from < 0 || to < 0 || from === to) return;

  const [row] = sortedRows.splice(from, 1);
  sortedRows.splice(to, 0, row);
  sortedRows.forEach((item, index) => {
    item.sort_order = (index + 1) * 10;
  });

  state.saving = true;
  try {
    for (const item of sortedRows) {
      await callAdmin('update', {
        collection: 'home_banners',
        _id: item._id,
        data: { sort_order: item.sort_order },
      });
    }
    await loadRows();
    toast('轮播排序已保存。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

function onDiningRoomDragStart(row) {
  state.draggingDiningRoomId = row._id;
}

function onDiningRoomDragEnd() {
  state.draggingDiningRoomId = '';
}

async function onDiningRoomDrop(targetRow) {
  const draggedId = state.draggingDiningRoomId;
  state.draggingDiningRoomId = '';
  if (!draggedId || draggedId === targetRow._id) return;

  const sortedRows = state.rows.slice().sort(compareSortOrder);
  const from = sortedRows.findIndex((row) => row._id === draggedId);
  const to = sortedRows.findIndex((row) => row._id === targetRow._id);
  if (from < 0 || to < 0 || from === to) return;

  const [row] = sortedRows.splice(from, 1);
  sortedRows.splice(to, 0, row);
  sortedRows.forEach((item, index) => {
    item.sort_order = (index + 1) * 10;
  });

  state.saving = true;
  try {
    for (const item of sortedRows) {
      await callAdmin('update', {
        collection: activeModule.value.key,
        _id: item._id,
        data: { sort_order: item.sort_order },
      });
    }
    await loadRows();
    toast('房间排序已保存。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

function onSortableDragStart(row) {
  if (isBannerModule.value) onBannerTableDragStart(row);
  else if (isMealItemsModule.value) onMealDragStart(row);
  else if (isRoomCatalogModule.value) onDiningRoomDragStart(row);
}

function onSortableDragEnd() {
  if (isBannerModule.value) onBannerTableDragEnd();
  else if (isMealItemsModule.value) onMealDragEnd();
  else if (isRoomCatalogModule.value) onDiningRoomDragEnd();
}

async function onSortableDrop(row) {
  if (isBannerModule.value) await onBannerTableDrop(row);
  else if (isMealItemsModule.value) await onMealDrop(row);
  else if (isRoomCatalogModule.value) await onDiningRoomDrop(row);
}

async function generateTableQrCode() {
  if (!state.editingId) {
    toast('请先保存桌台，再生成小程序码。', 'error');
    return;
  }

  state.generatingQrId = state.editingId;
  try {
    const data = await callAdmin('generateTableQrCode', { _id: state.editingId });
    form.qr_image_file_id = data.fileID || '';
    form.qr_scene = data.qr_scene || '';
    form.qr_version = data.qr_version || form.qr_version;
    form.__preview_qr_image_file_id = data.tempFileURL || '';
    await loadRows();
    toast('小程序码已生成。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.generatingQrId = '';
  }
}

async function downloadTableQrCode(row) {
  if (!row?.qr_image_file_id) {
    toast('请先生成该桌台的小程序码。', 'error');
    return;
  }

  let url = tableQrPreviewUrl(row);
  if (!url) {
    try {
      const data = await callAdmin('previewImage', {
        collection: 'meal_tables',
        field: 'qr_image_file_id',
        value: row.qr_image_file_id,
      });
      url = data.tempFileURL || '';
    } catch (error) {
      toast(error.message, 'error');
      return;
    }
  }
  if (!url) {
    toast('二维码下载地址生成失败。', 'error');
    return;
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = `${row.table_name || row.table_id || '桌台二维码'}.png`;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function activityQrPreviewUrl(row) {
  return row?._preview_urls?.qr_image_file_id || '';
}

function selectRecentActivity(activity) {
  state.activityOverview.selectedActivityId = activity?.activity_id || '';
}

function openActivitySignups(activity) {
  selectRecentActivity(activity);
  state.activityOverview.statusFilter = 'all';
  state.activityOverview.focusPanel = true;
  window.setTimeout(() => {
    state.activityOverview.focusPanel = false;
  }, 900);
}

function openRecentActivityEditor(row) {
  state.editingCollection = 'activity_items';
  resetForm();
  editorModule.value.fields.forEach((field) => {
    const value = row[field.key];
    if (field.type === 'datetime') form[field.key] = normalizeDateInput(value);
    else if (field.type === 'json') form[field.key] = formatJson(value);
    else if (field.type === 'images') {
      form[`__${field.key}Rows`] = normalizeImageRows(
        value,
        row._preview_urls?.[field.key],
        '',
        '',
      );
    }
    else if (field.type === 'boolean') form[field.key] = value === true;
    else form[field.key] = value ?? '';

    if (field.type === 'image' && row._preview_urls?.[field.key]) {
      form[`__preview_${field.key}`] = row._preview_urls[field.key];
    }
  });
  state.editingId = row._id;
  state.drawerOpen = true;
}

async function generateActivityQrCode(row) {
  if (!row?._id) return;
  state.generatingQrId = row._id;
  try {
    const data = await callAdmin('generateActivityQrCode', { _id: row._id });
    row.qr_image_file_id = data.fileID || '';
    row.qr_scene = data.qr_scene || '';
    row.qr_version = data.qr_version || row.qr_version;
    row._preview_urls = Object.assign({}, row._preview_urls, { qr_image_file_id: data.tempFileURL || '' });
    await loadRecentActivities();
    toast('活动二维码已生成。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.generatingQrId = '';
  }
}

async function downloadActivityQrCode(row) {
  if (!row?.qr_image_file_id) {
    toast('请先生成该活动的二维码。', 'error');
    return;
  }

  let url = activityQrPreviewUrl(row);
  if (!url) {
    try {
      const data = await callAdmin('previewImage', {
        collection: 'activity_items',
        field: 'qr_image_file_id',
        value: row.qr_image_file_id,
      });
      url = data.tempFileURL || '';
    } catch (error) {
      toast(error.message, 'error');
      return;
    }
  }
  if (!url) {
    toast('二维码下载地址生成失败。', 'error');
    return;
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = `${row.title || row.activity_id || '活动二维码'}.png`;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function imageFieldRows(fieldKey) {
  if (!Array.isArray(form[`__${fieldKey}Rows`])) form[`__${fieldKey}Rows`] = [];
  return form[`__${fieldKey}Rows`];
}

function syncPrimaryImageFromGallery(fieldKey) {
  if (fieldKey !== 'image_urls') return;
  const first = imageFieldRows(fieldKey)[0] || {};
  form.image_url = first.value || '';
  form.__preview_image_url = first.preview || '';
}

function moveImageRow(fieldKey, index, offset) {
  const rows = imageFieldRows(fieldKey);
  const target = index + offset;
  if (target < 0 || target >= rows.length) return;
  const [row] = rows.splice(index, 1);
  rows.splice(target, 0, row);
  syncPrimaryImageFromGallery(fieldKey);
}

function removeImageRow(fieldKey, index) {
  const rows = imageFieldRows(fieldKey);
  rows.splice(index, 1);
  syncPrimaryImageFromGallery(fieldKey);
}

// ── 云存储选择器 ──
async function openCloudStoragePicker(field) {
  const folder = editorModule.value.imageFields?.[field.key]
    || editorModule.value.videoFields?.[field.key]
    || '';
  state.cloudPicker = {
    visible: true,
    fieldKey: field.key,
    folder,
    files: [],
    loading: true,
    selectedFileID: '',
  };
  await fetchCloudFiles(folder);
}

async function fetchCloudFiles(folder) {
  state.cloudPicker.loading = true;
  try {
    const data = await callAdmin('listCloudFiles', { folder, limit: 80 });
    let files = data.files || [];

    // 获取临时下载链接用于预览
    if (files.length > 0) {
      try {
        const app = await getApp();
        const result = await app.getTempFileURL({
          fileList: files.map(f => f.fileID),
        });
        const urlMap = {};
        (result.fileList || []).forEach((item, i) => {
          if (item.tempFileURL) {
            urlMap[files[i].fileID] = item.tempFileURL;
          }
        });
        files = files.map(f => ({ ...f, previewUrl: urlMap[f.fileID] || '' }));
      } catch (e) {
        // 获取预览链接失败不影响文件列表展示
        console.warn('获取云存储预览链接失败:', e);
      }
    }

    state.cloudPicker.files = files;
  } catch (error) {
    toast(error.message, 'error');
    state.cloudPicker.files = [];
  } finally {
    state.cloudPicker.loading = false;
  }
}

function closeCloudStoragePicker() {
  state.cloudPicker.visible = false;
  state.cloudPicker.files = [];
  state.cloudPicker.selectedFileID = '';
}

function toggleFileSelect(fileID) {
  state.cloudPicker.selectedFileID =
    state.cloudPicker.selectedFileID === fileID ? '' : fileID;
}

function selectCloudFile() {
  const file = state.cloudPicker.files.find((f) => f.fileID === state.cloudPicker.selectedFileID);
  if (!file) {
    toast('请先选择一个文件。', 'error');
    return;
  }
  const fieldKey = state.cloudPicker.fieldKey;
  const field = visibleFields.value.find((f) => f && f.key === fieldKey);
  if (!field) return;

  if (field.type === 'images') {
    const rows = imageFieldRows(fieldKey);
    rows.push({
      value: file.fileID,
      preview: file.previewUrl || '',
    });
    syncPrimaryImageFromGallery(fieldKey);
  } else {
    form[fieldKey] = file.fileID;
    form[`__preview_${fieldKey}`] = file.previewUrl || '';
  }
  closeCloudStoragePicker();
  toast('已选择云存储文件。');
}

function isImageFile(file) {
  return /\.(jpe?g|png|webp|gif)$/i.test(file.cloudPath || file.fileName || '');
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadImages(field) {
  const input = multiFileInputs.value[field.key];
  const files = Array.from(input?.files || []);
  if (!files.length) {
    toast('请先选择图片。', 'error');
    return;
  }
  const tooLarge = files.find((file) => file.size > 5 * 1024 * 1024);
  if (tooLarge) {
    toast(`${tooLarge.name} 超过 5MB。`, 'error');
    return;
  }

  state.uploadingField = field.key;
  try {
    const rows = imageFieldRows(field.key);
    for (const file of files) {
      const base64 = await fileToBase64(file);
      const data = await callAdmin('uploadImage', {
        collection: editorModule.value.key,
        field: field.key,
        file_name: file.name,
        content_type: file.type,
        base64,
        ...uploadContextPayload(),
      });
      rows.push({
        value: data.fileID,
        preview: URL.createObjectURL(file),
      });
    }
    syncPrimaryImageFromGallery(field.key);
    input.value = '';
    toast(`已上传 ${files.length} 张图片。`);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.uploadingField = '';
  }
}

async function uploadImage(field) {
  const input = fileInputs.value[field.key];
  const file = input?.files?.[0];
  if (!file) {
    toast('请先选择图片。', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast('图片不能超过 5MB。', 'error');
    return;
  }

  state.uploadingField = field.key;
  try {
    const base64 = await fileToBase64(file);
    const data = await callAdmin('uploadImage', {
      collection: editorModule.value.key,
      field: field.key,
      file_name: file.name,
      content_type: file.type,
      base64,
      ...uploadContextPayload(),
    });
    form[field.key] = data.fileID;
    form[`__preview_${field.key}`] = URL.createObjectURL(file);
    toast(`图片已上传到 ${editorModule.value.imageFields[field.key]}。`);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.uploadingField = '';
  }
}

async function uploadVideo(field) {
  const input = videoFileInputs.value[field.key];
  const file = input?.files?.[0];
  if (!file) {
    toast('请先选择视频。', 'error');
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    toast('视频不能超过 50MB。', 'error');
    return;
  }

  state.uploadingField = field.key;
  try {
    const base64 = await fileToBase64(file);
    const data = await callAdmin('uploadMedia', {
      collection: editorModule.value.key,
      field: field.key,
      file_name: file.name,
      content_type: file.type,
      base64,
      ...uploadContextPayload(),
    });
    form[field.key] = data.fileID;
    input.value = '';
    toast(`视频已上传到 ${data.cloudPath || editorModule.value.videoFields?.[field.key] || '云存储'}。`);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.uploadingField = '';
  }
}

async function uploadContentBlockImage(block, index) {
  const key = `block-${index}`;
  const input = contentBlockFileInputs.value[key];
  const file = input?.files?.[0];
  if (!file) {
    toast('请先选择图片。', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast('图片不能超过 5MB。', 'error');
    return;
  }

  state.uploadingField = key;
  try {
    const base64 = await fileToBase64(file);
    const data = await callAdmin('uploadImage', {
      collection: 'content_pages',
      field: 'content_image_url',
      file_name: file.name,
      content_type: file.type,
      base64,
    });
    block.image_url = data.fileID;
    block.__preview_image_url = URL.createObjectURL(file);
    input.value = '';
    toast('图片已上传到 intro 目录。');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.uploadingField = '';
  }
}

let clockTimer = null;

onMounted(() => {
  if (state.loggedIn) loadRows();
  clockTimer = window.setInterval(() => {
    state.nowTick = Date.now();
  }, 60000);
});

onUnmounted(() => {
  if (clockTimer) window.clearInterval(clockTimer);
});
</script>

<template>
  <form v-if="!state.loggedIn" class="login-page" @submit.prevent="submitLogin">
    <section class="login-panel">
      <div class="brand login-brand">
        <span class="brand-mark">TY</span>
        <div>
          <strong>停云后台</strong>
          <span>Database Admin</span>
        </div>
      </div>
      <div class="login-copy">
        <h1>后台登录</h1>
        <p>请输入管理员账号和密码后进入管理界面。</p>
      </div>
      <label class="field">
        <span>账号</span>
        <input v-model="state.username" type="text" autocomplete="username" />
      </label>
      <label class="field">
        <span>密码</span>
        <input v-model="state.password" type="password" autocomplete="current-password" />
      </label>
      <button class="btn primary login-submit" type="submit" :disabled="state.loginLoading">
        {{ state.loginLoading ? '登录中' : '登录后台' }}
      </button>
    </section>

    <div v-if="state.toastText" class="toast" :class="state.toastType" role="status">
      {{ state.toastText }}
    </div>
  </form>

  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">TY</span>
        <div>
          <strong>停云后台</strong>
          <span>Database Admin</span>
        </div>
      </div>

      <nav class="nav">
        <section class="nav-group">
          <button class="nav-group-title" type="button" @click="toggleNavGroup('总览')">
            <span>总览</span>
            <em>{{ isNavGroupCollapsed('总览') ? '+' : '−' }}</em>
          </button>
          <div v-if="!isNavGroupCollapsed('总览')" class="nav-group-items">
            <button
              class="nav-item"
              :class="{ active: isOverview }"
              type="button"
              @click="switchModule(OVERVIEW_KEY)"
            >
              点餐信息
            </button>
            <button
              class="nav-item"
              :class="{ active: isReservationCalendar }"
              type="button"
              @click="switchModule(RESERVATION_CALENDAR_KEY)"
            >
              预定日历
            </button>
            <button
              class="nav-item"
              :class="{ active: isRecentActivities }"
              type="button"
              @click="switchModule(RECENT_ACTIVITIES_KEY)"
            >
              近期活动
            </button>
          </div>
        </section>
        <section v-for="group in navGroups" :key="group.name" class="nav-group">
          <button class="nav-group-title" type="button" @click="toggleNavGroup(group.name)">
            <span>{{ group.name }}</span>
            <em>{{ isNavGroupCollapsed(group.name) ? '+' : '−' }}</em>
          </button>
          <div v-if="!isNavGroupCollapsed(group.name)" class="nav-group-items">
            <button
              v-for="item in navGroupItems(group)"
              :key="item.key"
              class="nav-item"
              :class="{ active: item.key === state.activeKey }"
              type="button"
              @click="switchModule(item.key)"
            >
              {{ item.name }}
            </button>
          </div>
        </section>
      </nav>
    </aside>

    <main class="main">
      <header class="topbar">
        <div>
          <h1>{{ activeModule.name }}</h1>
          <p>{{ isVirtualModule ? `总览 / ${activeModule.key}` : `${activeGroup?.name || ''} / ${activeModule.key}` }}</p>
        </div>
        <div class="topbar-actions">
          <button class="btn secondary" type="button" :disabled="state.loading" @click="loadRows">
            {{ state.loading ? '刷新中' : '刷新' }}
          </button>
          <button v-if="isReservationsModule" class="btn secondary" type="button" @click="openCreateReservation('dining_reservations')">新增用餐</button>
          <button v-if="isReservationsModule" class="btn primary" type="button" @click="openCreateReservation('accommodation_reservations')">新增住宿</button>
          <button v-else-if="!isVirtualModule" class="btn primary" type="button" @click="openCreate">{{ createButtonLabel }}</button>
          <button class="btn secondary" type="button" @click="logout">退出</button>
        </div>
      </header>

      <section class="notice">
        <div>
          <strong>管理范围</strong>
          <span>当前后台通过 adminManage 云函数读写数据库；图片会上传到当前模块绑定的云存储目录。</span>
        </div>
        <span class="status-badge" :class="state.statusTone">{{ state.statusText }}</span>
      </section>

      <section v-if="isOverview" class="overview-page">
        <section class="overview-tables-panel">
          <div class="section-head">
            <div>
              <h2>查看用餐 · 桌台管理</h2>
              <p>红色为正在用餐桌台，点击桌台查看点单、移桌和清台。</p>
            </div>
            <div class="overview-stats">
              <span>吃饭 {{ dashboardStats.occupied }}</span>
              <span>浏览 {{ dashboardStats.browsing }}</span>
              <span>空闲 {{ dashboardStats.idle }}</span>
              <span>码 {{ dashboardStats.qrCount }}</span>
            </div>
          </div>

          <div class="table-board">
            <button
              v-for="table in state.overview.tables"
              :key="table._id || table.table_id"
              class="table-card"
              :class="{
                occupied: tableStatusMeta(table).key === 'occupied',
                browsing: tableStatusMeta(table).key === 'browsing',
                disabled: (table.table_status || 'enabled') !== 'enabled',
                selected: selectedTable && getTableId(selectedTable) === getTableId(table),
              }"
              type="button"
              @click="selectOverviewTable(table)"
            >
              <em v-if="getTableSession(table)?.customer_type" class="card-customer-tag" :class="getTableSession(table)?.customer_type">
                {{ getTableSession(table)?.customer_type === 'member' ? '会员' : '散客' }}
              </em>
              <strong>{{ table.table_name || table.table_id }}</strong>
              <span>{{ table.table_area || '未分区' }} · {{ table.capacity || '-' }} 人</span>
              <span v-if="tableDurationText(table)" class="table-duration">{{ tableDurationText(table) }}</span>
              <em>{{ tableStatusMeta(table).label }}</em>
            </button>
          </div>

          <div v-if="selectedTable" class="table-detail-panel">
            <div class="table-detail-head">
              <div>
                <h2>{{ selectedTable.table_name || selectedTable.table_id }}<em v-if="getTableSession(selectedTable)?.customer_type === 'member'" class="tag-member">会员</em></h2>
                <p>{{ selectedTable.table_area || '未分区' }} · {{ selectedTable.capacity || '-' }} 人 · {{ tableStatusMeta(selectedTable).label }}{{ tableDurationText(selectedTable) ? ` · ${tableDurationText(selectedTable)}` : '' }}</p>
              </div>
              <button class="icon-btn" type="button" title="关闭" @click="closeOverviewTablePanel">×</button>
            </div>

            <div class="table-detail-grid">
              <section>
                <h3>已点菜品</h3>
                <div v-if="!selectedTableItems.length" class="mini-empty">暂无点餐记录</div>
                <div v-else class="dish-list">
                  <div v-for="(item, index) in selectedTableItems" :key="`${item.order_no}-${item.name}-${index}`" class="dish-row">
                    <span>{{ item.name }}<em v-if="item.customer_type === 'member'" class="tag-member">会员</em></span>
                    <small>x{{ item.quantity }}</small>
                    <strong>{{ formatMoney(item.amount) }}</strong>
                  </div>
                </div>
              </section>

              <section>
                <h3>桌台操作</h3>
                <label class="field">
                  <span>移到空闲桌台</span>
                  <select v-model="state.overview.moveTargetTableId">
                    <option value="">选择桌台</option>
                    <option v-for="table in availableMoveTables" :key="table._id || table.table_id" :value="getTableId(table)">
                      {{ table.table_name || table.table_id }}
                    </option>
                  </select>
                </label>
                <div class="table-actions">
                  <button class="btn secondary" type="button" :disabled="state.saving || !state.overview.moveTargetTableId" @click="moveSelectedTableOrder">移桌</button>
                  <button class="btn danger" type="button" :disabled="state.saving || !selectedTableOrders.length" @click="completeAndClearSelectedTable">完成并清台</button>
                </div>
              </section>
            </div>
          </div>
        </section>

        <aside class="recent-orders-panel">
          <div>
            <h2>最近订单</h2>
            <p>最近的点餐订单</p>
          </div>
          <div v-if="!recentMealOrders.length" class="mini-empty">暂无订单</div>
          <button
            v-for="order in recentMealOrders"
            :key="order._id || order.order_id || order.order_no"
            class="recent-order-card"
            type="button"
            @click="switchModule('meal_orders')"
          >
            <strong>{{ order.order_no || order.order_id || '未编号订单' }}<em v-if="order.customer_type === 'member'" class="tag-member">会员</em></strong>
            <span>{{ order.table_name || order.table_id || '未关联桌台' }}</span>
            <small>{{ formatDateTime(order.created_at || order.updated_at || order._createTime) }}</small>
            <em>{{ formatMoney(orderAmount(order)) }}</em>
          </button>
        </aside>
      </section>

      <section v-else-if="isRecentActivities" class="activity-overview-page">
        <section class="activity-overview-panel">
          <div class="section-head">
            <div>
              <h2>近期活动</h2>
              <p>查看未结束活动的报名进度，快速生成二维码、修改活动和处理报名。</p>
            </div>
            <div class="meal-filter-tabs compact">
              <button class="filter-tab" :class="{ active: state.activityOverview.scopeFilter === 'all' }" type="button" @click="state.activityOverview.scopeFilter = 'all'">全部</button>
              <button class="filter-tab" :class="{ active: state.activityOverview.scopeFilter === 'public' }" type="button" @click="state.activityOverview.scopeFilter = 'public'">公开报名</button>
              <button class="filter-tab" :class="{ active: state.activityOverview.scopeFilter === 'members_only' }" type="button" @click="state.activityOverview.scopeFilter = 'members_only'">会员专属</button>
            </div>
          </div>

          <div v-if="!recentActivityRows.length" class="mini-empty">暂无近期活动</div>
          <div v-else class="activity-overview-grid">
            <article
              v-for="activity in recentActivityRows"
              :key="activity._id || activity.activity_id"
              class="activity-overview-card"
              :class="{ selected: selectedActivity && selectedActivity.activity_id === activity.activity_id }"
            >
              <button class="activity-overview-main" type="button" @click="selectRecentActivity(activity)">
                <img v-if="previewUrl(activity, 'image_url')" :src="previewUrl(activity, 'image_url')" alt="活动封面" />
                <div v-else class="activity-cover-empty">活动</div>
                <div class="activity-card-body">
                  <div class="activity-card-title">
                    <strong>{{ activity.title || '未命名活动' }}</strong>
                    <em v-if="activity.is_pinned">置顶</em>
                    <span>{{ activityScopeLabel(activity.signup_scope) }}</span>
                  </div>
                  <p>{{ activity.subtitle || activityTimeText(activity) }}</p>
                  <small>{{ activityTimeText(activity) }} · {{ activity.location || '未填写地点' }}</small>
                  <div class="activity-progress-meta">
                    <span>报名 {{ activitySignupPeople(activity) }} / {{ activityCapacity(activity) || '不限' }}</span>
                    <span>剩余 {{ activityCapacity(activity) ? activityRemaining(activity) : '不限' }}</span>
                  </div>
                  <div class="activity-progress-bar">
                    <i :style="{ width: `${activityProgress(activity)}%` }"></i>
                  </div>
                  <div class="activity-card-stats">
                    <span>待确认 {{ activityPendingCount(activity) }}</span>
                    <span>会员待核销 {{ activityMemberSettleCount(activity) }}</span>
                  </div>
                </div>
              </button>
              <div class="activity-card-actions">
                <button class="btn secondary compact-btn" type="button" :disabled="state.generatingQrId === activity._id" @click="generateActivityQrCode(activity)">
                  {{ state.generatingQrId === activity._id ? '生成中' : '生成二维码' }}
                </button>
                <button class="btn secondary compact-btn" type="button" :disabled="!activity.qr_image_file_id" @click="downloadActivityQrCode(activity)">下载二维码</button>
                <button class="btn secondary compact-btn" type="button" @click="openRecentActivityEditor(activity)">修改活动</button>
                <button class="btn primary compact-btn" type="button" @click="openActivitySignups(activity)">查看报名</button>
              </div>
            </article>
          </div>
        </section>

        <aside class="activity-signup-panel" :class="{ focused: state.activityOverview.focusPanel }">
          <div>
            <h2>报名情况</h2>
            <p>{{ selectedActivity ? selectedActivity.title : '请选择活动' }}</p>
          </div>
          <div class="reservation-status-summary">
            <button
              type="button"
              :class="{ active: state.activityOverview.statusFilter === 'pending' }"
              @click="state.activityOverview.statusFilter = 'pending'"
            >
              待确认 {{ activityStatusStats.pending }}
            </button>
            <button
              type="button"
              :class="{ active: state.activityOverview.statusFilter === 'memberPendingSettle' }"
              @click="state.activityOverview.statusFilter = 'memberPendingSettle'"
            >
              会员待核销 {{ activityStatusStats.memberPendingSettle }}
            </button>
            <button
              type="button"
              :class="{ active: state.activityOverview.statusFilter === 'all' }"
              @click="state.activityOverview.statusFilter = 'all'"
            >
              总数 {{ activityStatusStats.total }}
            </button>
          </div>
          <div v-if="!activityPanelSignups.length" class="mini-empty">暂无匹配报名</div>
          <article
            v-for="signup in activityPanelSignups"
            :key="signup._id || signup.signup_id || signup.order_no"
            class="activity-signup-card"
          >
            <div>
              <strong>{{ signup.contact_name || '未填写联系人' }}<em v-if="signup.customer_type === 'member'" class="tag-member">会员</em></strong>
              <span>{{ signup.contact_mobile || '-' }} · {{ signup.participant_count || signup.people_count || 1 }} 人</span>
              <small>{{ formatMoney(signup.amount) }} · {{ signupStatusLabel(signup.signup_status) }} · {{ paymentStatusLabel(signup.payment_status) }} / {{ settlementStatusLabel(signup.settlement_status) }}</small>
              <p v-if="signup.remark || signup.admin_remark">{{ signup.remark || signup.admin_remark }}</p>
            </div>
            <div class="activity-signup-actions">
              <button
                v-if="isPendingActivitySignup(signup)"
                class="btn primary compact-btn"
                type="button"
                :disabled="state.saving"
                @click="confirmActivitySignup(signup)"
              >
                确认
              </button>
              <button
                v-if="isPendingActivitySignup(signup)"
                class="btn danger compact-btn"
                type="button"
                :disabled="state.saving"
                @click="cancelActivitySignup(signup)"
              >
                取消
              </button>
              <button
                v-if="canSettleActivitySignup(signup)"
                class="btn primary compact-btn"
                type="button"
                :disabled="state.saving"
                @click="settleActivitySignup(signup)"
              >
                核销
              </button>
            </div>
          </article>
        </aside>
      </section>

      <section v-else-if="isReservationCalendar" class="dashboard-page">
        <section class="calendar-panel">
          <div class="calendar-toolbar">
            <div>
              <h2>预定日历</h2>
              <p>按全部、用餐或住宿筛选预约；点击事件查看详情。</p>
            </div>
            <div class="calendar-actions">
              <button class="btn secondary" type="button" @click="openCreateReservation('dining_reservations')">新增用餐</button>
              <button class="btn secondary" type="button" @click="openCreateReservation('accommodation_reservations')">新增住宿</button>
              <button class="btn secondary" type="button" @click="shiftDashboardMonth(-1)">上月</button>
              <strong>{{ state.calendar.month }}</strong>
              <button class="btn secondary" type="button" @click="shiftDashboardMonth(1)">下月</button>
            </div>
          </div>

          <div class="calendar-filter-tabs">
            <button class="filter-tab" :class="{ active: state.calendar.filter === 'all' }" type="button" @click="state.calendar.filter = 'all'">全部</button>
            <button class="filter-tab dining" :class="{ active: state.calendar.filter === 'dining' }" type="button" @click="state.calendar.filter = 'dining'">用餐</button>
            <button class="filter-tab accommodation" :class="{ active: state.calendar.filter === 'accommodation' }" type="button" @click="state.calendar.filter = 'accommodation'">住宿</button>
          </div>

          <div class="calendar-weekdays">
            <span>日</span>
            <span>一</span>
            <span>二</span>
            <span>三</span>
            <span>四</span>
            <span>五</span>
            <span>六</span>
          </div>
          <div class="calendar-grid">
            <div
              v-for="day in calendarDays"
              :key="day.key"
              class="calendar-day"
              :class="{ blank: !day.date }"
            >
              <span class="day-number">{{ day.day }}</span>
              <button
                v-for="event in day.events"
                :key="event.id || `${event.type}-${event.date}-${event.customer}`"
                class="calendar-event"
                :class="[event.type, { pending: isPendingReservation(event.row), confirmed: event.status === 'confirmed' }]"
                type="button"
                @click="openDashboardEvent(event)"
              >
                <strong>{{ event.customer }}</strong>
                <span>{{ event.place }} · {{ reservationStatusLabel(event.status) }}</span>
              </button>
            </div>
          </div>
        </section>
        <aside class="reservation-status-panel">
          <div>
            <h2>预定状态</h2>
            <p>待确认预约先以灰色显示，确认后同步到日历视图。</p>
          </div>
          <div class="reservation-status-summary">
            <button
              type="button"
              :class="{ active: state.calendar.statusFilter === 'pending' }"
              @click="state.calendar.statusFilter = 'pending'"
            >
              待确认 {{ calendarStatusStats.pending }}
            </button>
            <button
              type="button"
              :class="{ active: state.calendar.statusFilter === 'memberPendingSettle' }"
              @click="state.calendar.statusFilter = 'memberPendingSettle'"
            >
              会员待核销 {{ calendarStatusStats.memberPendingSettle }}
            </button>
            <button
              type="button"
              :class="{ active: state.calendar.statusFilter === 'all' }"
              @click="state.calendar.statusFilter = 'all'"
            >
              总数 {{ calendarStatusStats.total }}
            </button>
          </div>
          <div v-if="!statusPanelReservationEvents.length" class="mini-empty">暂无匹配预约</div>
          <article
            v-for="event in statusPanelReservationEvents"
            :key="event.id || `${event.type}-${event.date}-${event.customer}`"
            class="reservation-status-card"
          >
            <button class="reservation-status-main" type="button" @click="openDashboardEvent(event)">
              <strong>{{ event.customer }}</strong>
              <span>{{ event.date }} · {{ reservationTypeLabel(event.type) }} · {{ event.place }}</span>
              <small>{{ reservationStatusLabel(event.status) }}</small>
            </button>
            <button
              class="btn primary compact-btn"
              type="button"
              :disabled="state.saving"
              @click="isPendingReservation(event.row) ? confirmReservationEvent(event) : openDashboardEvent(event)"
            >
              {{ isPendingReservation(event.row) ? '确认' : '查看' }}
            </button>
          </article>
        </aside>
      </section>

      <section v-else class="content-band">
        <div class="section-head">
          <div>
            <h2>记录列表</h2>
            <p>
              {{ state.loading ? '正在读取数据。' : `共 ${tableRows.length} 条记录。` }}
            </p>
          </div>
        </div>

        <div v-if="isMealItemsModule" class="meal-filter-tabs">
          <button
            v-for="category in mealCategories"
            :key="category.key"
            class="filter-tab"
            :class="{ active: state.mealCategoryKey === category.key }"
            type="button"
            @click="setMealCategory(category.key)"
          >
            {{ category.name }}
          </button>
        </div>
        <div v-if="isReservationsModule" class="calendar-filter-tabs">
          <button class="filter-tab" :class="{ active: state.reservations.filter === 'all' }" type="button" @click="state.reservations.filter = 'all'">全部</button>
          <button class="filter-tab dining" :class="{ active: state.reservations.filter === 'dining' }" type="button" @click="state.reservations.filter = 'dining'">用餐</button>
          <button class="filter-tab accommodation" :class="{ active: state.reservations.filter === 'accommodation' }" type="button" @click="state.reservations.filter = 'accommodation'">住宿</button>
        </div>

        <div v-if="!tableRows.length" class="empty">
          {{ state.loading ? '正在加载...' : '暂无记录，点击右上角“新建”添加。' }}
        </div>
        <div v-else class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th v-if="isSortableTableModule">排序</th>
                <th v-for="column in tableColumns" :key="column">{{ getFieldConfig(column).label }}</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in tableRows"
                :key="row._id"
                :class="{ dragging: (isBannerModule && state.draggingBannerId === row._id) || (isMealItemsModule && state.draggingMealId === row._id) || (isRoomCatalogModule && state.draggingDiningRoomId === row._id) }"
                :draggable="isSortableTableModule"
                @dragstart="isSortableTableModule && onSortableDragStart(row)"
                @dragover.prevent
                @drop="isSortableTableModule && onSortableDrop(row)"
                @dragend="isSortableTableModule && onSortableDragEnd()"
              >
                <td v-if="isSortableTableModule">
                  <button class="drag-handle table-drag-handle" type="button" title="拖动排序">↕</button>
                </td>
                <td v-for="column in tableColumns" :key="column">
                  <span
                    v-if="isReservationsModule && column === '__type'"
                    class="reservation-type-badge"
                    :class="row.__type"
                  >
                    {{ reservationTypeLabel(row.__type) }}
                  </span>
                  <span v-else-if="isReservationsModule && column === '__date'">{{ reservationDateValue(row) || '-' }}</span>
                  <span
                    v-else-if="column === 'customer_type'"
                    class="customer-type-badge"
                    :class="row.customer_type"
                  >
                    {{ row.customer_type === 'member' ? '会员' : '散客' }}
                  </span>
                  <span
                    v-else-if="column === 'reservation_status'"
                    class="reservation-status-badge"
                    :class="reservationStatusTone(row.reservation_status)"
                  >
                    {{ reservationStatusLabel(row.reservation_status) }}
                  </span>
                  <span
                    v-else-if="isContentPagesModule && column === 'is_active'"
                    class="content-active-badge"
                    :class="{ active: row.is_active === true }"
                  >
                    {{ row.is_active === true ? '当前使用' : '备用' }}
                  </span>
                  <button
                    v-else-if="isToggleColumn(column)"
                    class="availability-toggle"
                    :class="{ active: isToggleActive(row, column) }"
                    type="button"
                    :disabled="state.saving"
                    @click.stop="toggleStatusField(row, column)"
                  >
                    <span class="toggle-track"><span class="toggle-knob"></span></span>
                    <span>{{ toggleLabel(row, column) }}</span>
                  </button>
                  <div v-else-if="isMealTablesModule && column === 'qr_image_file_id'" class="qr-cell">
                    <img
                      v-if="previewUrl(row, column)"
                      class="thumb qr-thumb"
                      :src="previewUrl(row, column)"
                      :alt="displayValue(row, titleField)"
                      :style="imageStyle(column)"
                    />
                    <span v-else>未生成</span>
                    <button
                      class="btn secondary compact-btn"
                      type="button"
                      :disabled="!row.qr_image_file_id"
                      @click="downloadTableQrCode(row)"
                    >
                      下载
                    </button>
                  </div>
                  <img
                    v-else-if="getFieldConfig(column).type === 'image' && previewUrl(row, column)"
                    class="thumb"
                    :src="previewUrl(row, column)"
                    :alt="displayValue(row, titleField)"
                    :style="imageStyle(column)"
                  />
                  <span v-else>{{ displayValue(row, column) }}</span>
                </td>
                <td class="row-actions">
                  <button class="btn secondary" type="button" @click="openEdit(row)">编辑</button>
                  <button
                    v-if="isActivitySignupsModule && row.signup_status === 'pending_confirmation'"
                    class="btn primary"
                    type="button"
                    :disabled="state.saving"
                    @click="confirmActivitySignup(row)"
                  >
                    确认报名
                  </button>
                  <button
                    v-if="isActivitySignupsModule && row.customer_type === 'member' && row.signup_status === 'confirmed' && row.settlement_status !== 'settled'"
                    class="btn primary"
                    type="button"
                    :disabled="state.saving"
                    @click="settleActivitySignup(row)"
                  >
                    会员核销
                  </button>
                  <button
                    v-if="isContentPagesModule"
                    class="btn secondary"
                    type="button"
                    :disabled="state.duplicatingContentId === row._id"
                    @click="duplicateContentPage(row)"
                  >
                    {{ state.duplicatingContentId === row._id ? '复制中' : '复制' }}
                  </button>
                  <button
                    v-if="isContentPagesModule && row.page_type === 'intro'"
                    class="btn primary"
                    type="button"
                    :disabled="row.is_active === true || state.activatingContentId === row._id"
                    @click="activateContentPage(row)"
                  >
                    {{ row.is_active === true ? '当前使用' : (state.activatingContentId === row._id ? '启用中' : '设为当前介绍') }}
                  </button>
                  <button class="btn danger" type="button" @click="deleteRecord(row)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>

    <div v-if="state.calendar.selectedEvent" class="detail-modal" aria-modal="true">
      <button class="drawer-mask" type="button" aria-label="关闭" @click="closeReservationDetail"></button>
      <section class="detail-card">
        <div class="drawer-head">
          <div>
            <h2>{{ state.calendar.selectedEvent.type === 'dining' ? '用餐预约' : '住宿预约' }}</h2>
            <p>{{ state.calendar.selectedEvent.date }} · {{ reservationStatusLabel(state.calendar.selectedEvent.status) }}</p>
          </div>
          <button class="icon-btn" type="button" title="关闭" @click="closeReservationDetail">×</button>
        </div>
        <div class="detail-list">
          <div>
            <span>联系人</span>
            <strong>{{ state.calendar.selectedEvent.row.customer_name || '-' }}</strong>
          </div>
          <div>
            <span>手机号</span>
            <strong>{{ state.calendar.selectedEvent.row.customer_mobile || '-' }}</strong>
          </div>
          <div>
            <span>{{ state.calendar.selectedEvent.type === 'dining' ? '包间' : '客房' }}</span>
            <strong>{{ state.calendar.selectedEvent.place }}</strong>
          </div>
          <div>
            <span>人数</span>
            <strong>{{ state.calendar.selectedEvent.row.guest_count || '-' }}</strong>
          </div>
          <div v-if="state.calendar.selectedEvent.type === 'dining'">
            <span>用餐时间</span>
            <strong>{{ mealSlotLabel(state.calendar.selectedEvent.row.reservation_time) }}</strong>
          </div>
          <div v-if="state.calendar.selectedEvent.type === 'dining'">
            <span>餐标</span>
            <strong>{{ mealStandardLabel(state.calendar.selectedEvent.row) }}</strong>
          </div>
          <div v-if="state.calendar.selectedEvent.type === 'accommodation'">
            <span>入住日期</span>
            <strong>{{ state.calendar.selectedEvent.row.checkin_date || '-' }}</strong>
          </div>
          <div v-if="state.calendar.selectedEvent.type === 'accommodation'">
            <span>离店日期</span>
            <strong>{{ state.calendar.selectedEvent.row.checkout_date || '-' }}</strong>
          </div>
          <div class="wide">
            <span>备注</span>
            <strong>{{ state.calendar.selectedEvent.row.remark || state.calendar.selectedEvent.row.admin_remark || '-' }}</strong>
          </div>
        </div>
        <div class="drawer-actions">
          <button class="btn secondary" type="button" @click="closeReservationDetail">关闭</button>
          <button
            v-if="isPendingReservation(state.calendar.selectedEvent.row)"
            class="btn primary"
            type="button"
            :disabled="state.saving"
            @click="confirmReservationEvent(state.calendar.selectedEvent)"
          >
            {{ state.saving ? '确认中' : '确认预约' }}
          </button>
          <button
            v-if="canSettleMemberReservation(state.calendar.selectedEvent.row)"
            class="btn primary"
            type="button"
            :disabled="state.saving"
            @click="settleMemberReservationEvent(state.calendar.selectedEvent)"
          >
            {{ state.saving ? '处理中' : '会员核销完成' }}
          </button>
          <button class="btn primary" type="button" @click="editReservationEvent(state.calendar.selectedEvent)">编辑预约</button>
        </div>
      </section>
    </div>

    <div v-if="state.drawerOpen" class="editor-modal" aria-modal="true">
      <button class="modal-mask" type="button" aria-label="关闭" @click="closeDrawer"></button>
      <form class="editor-dialog" :class="{ 'activity-editor-dialog': state.editingCollection === 'activity_items' }" @submit.prevent="saveRecord">
        <div class="drawer-head">
          <div>
            <h2>{{ state.editingId ? '编辑记录' : '新建记录' }}</h2>
            <p>{{ editorModule.name }} / {{ editorModule.key }}</p>
          </div>
          <button class="icon-btn" type="button" title="关闭" @click="closeDrawer">×</button>
        </div>

        <div v-if="isMealItemsModule" class="meal-category-editor">
          <span>分类</span>
          <div class="meal-filter-tabs compact">
            <button
              v-for="category in concreteMealCategories"
              :key="category.key"
              class="filter-tab"
              :class="{ active: form.category_key === category.key }"
              type="button"
              @click="setFormMealCategory(category.key)"
            >
              {{ category.name }}
            </button>
          </div>
        </div>

        <div class="form-grid">
          <label v-for="field in visibleFields" :key="field.key" class="field" :class="{ wide: field.type === 'textarea' || field.type === 'json' || field.type === 'image' || field.type === 'images' || field.type === 'video' || field.type === 'itemDetails' || field.type === 'standardDishes' || field.type === 'contentBlocks' || field.type === 'memberBenefits' || field.type === 'levelBenefits' }">
            <span>{{ field.label }}{{ field.required ? ' *' : '' }}</span>

            <template v-if="field.type === 'image'">
              <div class="upload-row">
                <input :ref="(el) => { if (el) fileInputs[field.key] = el; }" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
                <button class="btn secondary" type="button" :disabled="state.uploadingField === field.key" @click="uploadImage(field)">
                  {{ state.uploadingField === field.key ? '上传中' : '上传图片' }}
                </button>
                <button class="btn secondary" type="button" @click="openCloudStoragePicker(field)">从云存储选择</button>
              </div>
              <input
                v-model="form[field.key]"
                type="text"
                placeholder="上传后自动生成云存储 fileID"
                @input="clearFieldPreview(field.key)"
                @blur="resolveFormPreview(field)"
                @change="resolveFormPreview(field)"
              />
              <small>上传目录：{{ editorModule.imageFields[field.key] }}。上传成功后会自动填入，通常不用手动输入。</small>
              <img
                v-if="formPreviewUrl(field.key)"
                class="image-preview"
                :src="formPreviewUrl(field.key)"
                :style="imageStyle(field.key)"
                alt="预览"
              />
            </template>

            <template v-else-if="field.type === 'video'">
              <div class="upload-row">
                <input :ref="(el) => { if (el) videoFileInputs[field.key] = el; }" type="file" accept="video/mp4,video/quicktime,video/webm" />
                <button class="btn secondary" type="button" :disabled="state.uploadingField === field.key" @click="uploadVideo(field)">
                  {{ state.uploadingField === field.key ? '上传中' : '上传视频' }}
                </button>
                <button class="btn secondary" type="button" @click="openCloudStoragePicker(field)">从云存储选择</button>
              </div>
              <input v-model="form[field.key]" type="text" placeholder="上传后自动生成云存储 fileID，也可填写 https:// 视频地址" />
              <small>上传目录：activities/{{ form.title || form.activity_id || '活动标题' }}。上传成功后会自动填入。</small>
            </template>

            <template v-else-if="field.type === 'images'">
              <div class="upload-row">
                <input :ref="(el) => { if (el) multiFileInputs[field.key] = el; }" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple />
                <button class="btn secondary" type="button" :disabled="state.uploadingField === field.key" @click="uploadImages(field)">
                  {{ state.uploadingField === field.key ? '上传中' : '上传多图' }}
                </button>
                <button class="btn secondary" type="button" @click="openCloudStoragePicker(field)">从云存储选择</button>
              </div>
              <small>支持一次选择多张；活动图片会上传到 activities/{{ form.title || form.activity_id || '活动标题' }}。</small>
              <div class="multi-image-editor">
                <div
                  v-for="(image, index) in form[`__${field.key}Rows`]"
                  :key="`${image.value}-${index}`"
                  class="multi-image-row"
                >
                  <img
                    v-if="image.preview || isBrowserImageUrl(image.value)"
                    class="multi-image-thumb"
                    :src="image.preview || image.value"
                    alt="客房图片"
                  />
                  <span v-else class="multi-image-thumb empty">无预览</span>
                  <div class="multi-image-main">
                    <strong>第 {{ index + 1 }} 张</strong>
                    <input v-model="image.value" type="text" placeholder="cloud:// fileID" @input="image.preview = ''" />
                  </div>
                  <div class="multi-image-actions">
                    <button class="btn secondary compact-btn" type="button" :disabled="index === 0" @click="moveImageRow(field.key, index, -1)">上移</button>
                    <button class="btn secondary compact-btn" type="button" :disabled="index === form[`__${field.key}Rows`].length - 1" @click="moveImageRow(field.key, index, 1)">下移</button>
                    <button class="btn danger compact-btn" type="button" @click="removeImageRow(field.key, index)">删除</button>
                  </div>
                </div>
                <div v-if="!form[`__${field.key}Rows`].length" class="multi-image-empty">暂无多图，上传后会显示在这里。</div>
              </div>
            </template>

            <textarea v-else-if="field.type === 'textarea'" v-model="form[field.key]" rows="3"></textarea>
            <select v-else-if="field.type === 'memberLevelSelect'" v-model="form[field.key]" @change="applyMemberLevelName">
              <option value="">请选择会员等级</option>
              <option v-for="item in memberLevelOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
            <div v-else-if="field.type === 'itemDetails'" class="details-editor">
              <div
                v-for="(detail, index) in form.__detailsRows"
                :key="index"
                class="detail-row-editor"
              >
                <input v-model="detail.name" type="text" placeholder="名称，如崂山绿茶" />
                <input v-model="detail.quantity" type="text" placeholder="数量，如 1 壶" />
                <button class="btn secondary" type="button" @click="removeMealDetail(index)">删除</button>
              </div>
              <button class="btn secondary add-detail-btn" type="button" @click="addMealDetail">添加明细</button>
            </div>
            <div v-else-if="field.type === 'standardDishes'" class="details-editor">
              <div
                v-for="(detail, index) in form.__detailsRows"
                :key="index"
                class="detail-row-editor"
              >
                <input v-model="detail.name" type="text" placeholder="名称，如热菜" />
                <input v-model="detail.content" type="text" placeholder="内容，如 黑椒牛仔骨 / 清蒸鱼" />
                <button class="btn secondary" type="button" @click="removeMealDetail(index)">删除</button>
              </div>
              <button class="btn secondary add-detail-btn" type="button" @click="addMealDetail">添加菜品</button>
            </div>
            <div v-else-if="field.type === 'reservationStatus'" class="status-choice-grid">
              <button
                v-for="status in reservationStatuses"
                :key="status.value"
                class="status-choice"
                :class="[status.tone, { active: form[field.key] === status.value }]"
                type="button"
                @click="form[field.key] = status.value"
              >
                {{ status.label }}
              </button>
            </div>
            <div v-else-if="field.type === 'contentBlocks'" class="content-block-editor">
              <div class="content-block-toolbar">
                <button
                  v-for="type in contentBlockTypes"
                  :key="type.value"
                  class="btn secondary compact-btn"
                  type="button"
                  @click="addContentBlock(type.value)"
                >
                  添加{{ type.label }}
                </button>
              </div>
              <div v-if="!form.__contentBlocks.length" class="multi-image-empty">暂无内容块，请从上方选择添加。</div>
              <article
                v-for="(block, blockIndex) in form.__contentBlocks"
                :key="`${block.type}-${blockIndex}`"
                class="content-block-card"
              >
                <div class="content-block-head">
                  <select v-model="block.type" @change="Object.assign(block, newContentBlock(block.type), { type: block.type })">
                    <option v-for="type in contentBlockTypes" :key="type.value" :value="type.value">{{ type.label }}</option>
                  </select>
                  <div class="content-block-actions">
                    <button class="btn secondary compact-btn" type="button" :disabled="blockIndex === 0" @click="moveContentBlock(blockIndex, -1)">上移</button>
                    <button class="btn secondary compact-btn" type="button" :disabled="blockIndex === form.__contentBlocks.length - 1" @click="moveContentBlock(blockIndex, 1)">下移</button>
                    <button class="btn danger compact-btn" type="button" @click="removeContentBlock(blockIndex)">删除</button>
                  </div>
                </div>

                <textarea
                  v-if="['lead', 'paragraph', 'quote'].includes(block.type)"
                  v-model="block.text"
                  rows="4"
                  placeholder="填写正文内容"
                ></textarea>
                <input
                  v-else-if="block.type === 'section_title'"
                  v-model="block.text"
                  type="text"
                  placeholder="填写小标题"
                />

                <template v-else-if="block.type === 'image' || block.type === 'contact'">
                  <input
                    v-if="block.type === 'contact'"
                    v-model="block.title"
                    type="text"
                    placeholder="联系卡标题"
                  />
                  <textarea
                    v-if="block.type === 'contact'"
                    v-model="block.text"
                    rows="3"
                    placeholder="联系卡内容"
                  ></textarea>
                  <div class="upload-row">
                    <input
                      :ref="(el) => { if (el) contentBlockFileInputs[`block-${blockIndex}`] = el; }"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                    />
                    <button
                      class="btn secondary"
                      type="button"
                      :disabled="state.uploadingField === `block-${blockIndex}`"
                      @click="uploadContentBlockImage(block, blockIndex)"
                    >
                      {{ state.uploadingField === `block-${blockIndex}` ? '上传中' : '上传到 intro' }}
                    </button>
                  </div>
                  <input v-model="block.image_url" type="text" placeholder="cloud:// 云存储 fileID" />
                  <img
                    v-if="block.__preview_image_url || isBrowserImageUrl(block.image_url)"
                    class="image-preview"
                    :src="block.__preview_image_url || block.image_url"
                    alt="内容图片预览"
                  />
                </template>

                <div v-else-if="block.type === 'feature_grid' || block.type === 'space_list'" class="content-items-editor">
                  <div
                    v-for="(item, itemIndex) in block.items"
                    :key="itemIndex"
                    class="content-item-row"
                  >
                    <input v-model="item.title" type="text" placeholder="标题" />
                    <textarea v-model="item.text" rows="2" placeholder="说明"></textarea>
                    <button class="btn danger compact-btn" type="button" @click="removeContentBlockItem(block, itemIndex)">删除</button>
                  </div>
                  <button class="btn secondary compact-btn" type="button" @click="addContentBlockItem(block)">添加一项</button>
                </div>

                <div v-else-if="block.type === 'list'" class="content-items-editor">
                  <div
                    v-for="(item, itemIndex) in block.items"
                    :key="itemIndex"
                    class="content-item-row list-row"
                  >
                    <input v-model="block.items[itemIndex]" type="text" placeholder="列表内容" />
                    <button class="btn danger compact-btn" type="button" @click="removeContentBlockItem(block, itemIndex)">删除</button>
                  </div>
                  <button class="btn secondary compact-btn" type="button" @click="addContentBlockItem(block)">添加一项</button>
                </div>
              </article>
            </div>
            <div v-else-if="field.type === 'memberBenefits'" class="member-benefit-editor">
              <div class="member-benefit-toolbar">
                <small>只维护会员身份、服务权益和次数权益；线下账户余额以办卡软件为准。</small>
                <button class="btn secondary compact-btn" type="button" @click="addLevelBenefitsToMember">同步当前等级权益</button>
              </div>
              <div v-if="!form.__memberBenefitRows.length" class="multi-image-empty">暂无个人权益。选择会员等级后，可点击“同步当前等级权益”。</div>
              <section v-if="form.__memberBenefitRows.length" class="member-benefit-section">
                <div class="member-benefit-section-head">
                  <div>
                    <strong>服务权益</strong>
                    <span>只维护服务内容、状态和有效期，不编辑次数。</span>
                  </div>
                </div>
                <div v-if="!activeMemberBenefits('service').length" class="multi-image-empty">暂无服务权益。</div>
                <article
                  v-for="benefit in activeMemberBenefits('service')"
                  :key="benefit.benefit_account_id || benefit.benefit_key"
                  class="member-benefit-card service"
                >
                  <div class="member-benefit-head">
                    <div>
                      <strong>{{ benefit.benefit_name || '未命名权益' }}</strong>
                      <span>服务权益</span>
                    </div>
                    <button class="btn danger compact-btn" type="button" @click="removeMemberBenefitRow(benefit)">停用/移除</button>
                  </div>
                  <div class="member-benefit-grid service">
                    <div class="member-benefit-field">
                      <span>权益名称</span>
                      <input v-model="benefit.benefit_name" type="text" />
                    </div>
                    <div class="member-benefit-field">
                      <span>状态</span>
                      <select v-model="benefit.account_status">
                        <option value="active">生效中</option>
                        <option value="expired">已到期</option>
                        <option value="disabled">已停用</option>
                      </select>
                    </div>
                    <div class="member-benefit-field">
                      <span>有效开始</span>
                      <input v-model="benefit.valid_start_at" type="datetime-local" />
                    </div>
                    <div class="member-benefit-field">
                      <span>有效结束</span>
                      <input v-model="benefit.valid_end_at" type="datetime-local" />
                    </div>
                  </div>
                </article>
              </section>

              <section v-if="form.__memberBenefitRows.length" class="member-benefit-section">
                <div class="member-benefit-section-head">
                  <div>
                    <strong>次数权益</strong>
                    <span>维护可核销的次数、已用、锁定和剩余。</span>
                  </div>
                </div>
                <div v-if="!activeMemberBenefits('quota').length" class="multi-image-empty">暂无次数权益。</div>
                <article
                  v-for="benefit in activeMemberBenefits('quota')"
                  :key="benefit.benefit_account_id || benefit.benefit_key"
                  class="member-benefit-card quota"
                >
                  <div class="member-benefit-head">
                    <div>
                      <strong>{{ benefit.benefit_name || '未命名权益' }}</strong>
                      <span>次数权益</span>
                    </div>
                    <button class="btn danger compact-btn" type="button" @click="removeMemberBenefitRow(benefit)">停用/移除</button>
                  </div>
                  <div class="member-benefit-grid quota">
                    <div class="member-benefit-field">
                      <span>权益名称</span>
                      <input v-model="benefit.benefit_name" type="text" />
                    </div>
                    <div class="member-benefit-field">
                      <span>总次数</span>
                      <input v-model.number="benefit.total_quota" type="number" min="0" step="1" @input="recalculateMemberBenefitRemaining(benefit)" />
                    </div>
                    <div class="member-benefit-field">
                      <span>已用</span>
                      <input v-model.number="benefit.used_quota" type="number" min="0" step="1" @input="recalculateMemberBenefitRemaining(benefit)" />
                    </div>
                    <div class="member-benefit-field">
                      <span>锁定</span>
                      <input v-model.number="benefit.locked_quota" type="number" min="0" step="1" @input="recalculateMemberBenefitRemaining(benefit)" />
                    </div>
                    <div class="member-benefit-field">
                      <span>剩余</span>
                      <input v-model.number="benefit.remaining_quota" type="number" min="0" step="1" />
                    </div>
                    <div class="member-benefit-field">
                      <span>单位</span>
                      <input v-model="benefit.quota_unit" type="text" placeholder="次 / 人次" />
                    </div>
                    <div class="member-benefit-field">
                      <span>状态</span>
                      <select v-model="benefit.account_status">
                        <option value="active">生效中</option>
                        <option value="expired">已到期</option>
                        <option value="disabled">已停用</option>
                      </select>
                    </div>
                    <div class="member-benefit-field">
                      <span>有效开始</span>
                      <input v-model="benefit.valid_start_at" type="datetime-local" />
                    </div>
                    <div class="member-benefit-field">
                      <span>有效结束</span>
                      <input v-model="benefit.valid_end_at" type="datetime-local" />
                    </div>
                  </div>
                </article>
              </section>
            </div>
            <div v-else-if="field.type === 'levelBenefits'" class="level-benefit-editor">
              <div class="member-benefit-toolbar">
                <small>这里配置当前等级会拥有的权益。服务权益只展示服务内容；次数权益会进入会员中心的次数列表，并可同步到具体会员账户。</small>
              </div>

              <section class="level-benefit-section">
                <div class="level-benefit-section-head">
                  <div>
                    <strong>服务权益</strong>
                    <span>例如会员专享活动、定制储藏服务、山居管家服务。</span>
                  </div>
                  <button class="btn secondary compact-btn" type="button" @click="addLevelBenefitRow('service')">添加服务</button>
                </div>
                <div v-if="!activeLevelBenefits('service').length" class="multi-image-empty">暂无服务权益。</div>
                <article
                  v-for="benefit in activeLevelBenefits('service')"
                  :key="benefit.level_benefit_id || benefit.benefit_key"
                  class="level-benefit-row service"
                >
                  <input v-model="benefit.benefit_name" type="text" placeholder="服务名称，如会员专享活动" />
                  <textarea v-model="benefit.description" rows="2" placeholder="说明，可选；会显示在会员中心的会员服务里"></textarea>
                  <label class="inline-check">
                    <input v-model="benefit.show_on_card" type="checkbox" />
                    <span>显示在会员卡</span>
                  </label>
                  <button class="btn danger compact-btn" type="button" @click="removeLevelBenefitRow(benefit)">删除</button>
                </article>
              </section>

              <section class="level-benefit-section">
                <div class="level-benefit-section-head">
                  <div>
                    <strong>次数权益</strong>
                    <span>例如免费住房 10 次、自然采摘 20 人次、音乐会 4 次。</span>
                  </div>
                  <button class="btn secondary compact-btn" type="button" @click="addLevelBenefitRow('quota')">添加次数</button>
                </div>
                <div v-if="!activeLevelBenefits('quota').length" class="multi-image-empty">暂无次数权益。</div>
                <article
                  v-for="benefit in activeLevelBenefits('quota')"
                  :key="benefit.level_benefit_id || benefit.benefit_key"
                  class="level-benefit-row quota"
                >
                  <input v-model="benefit.benefit_name" type="text" placeholder="权益名称，如免费住房" />
                  <input v-model.number="benefit.total_quota" type="number" min="0" step="1" placeholder="次数" />
                  <input v-model="benefit.quota_unit" type="text" placeholder="单位，如 次 / 人次" />
                  <textarea v-model="benefit.description" rows="2" placeholder="说明，可选；会显示在会员中心次数权益下方"></textarea>
                  <label class="inline-check">
                    <input v-model="benefit.show_on_card" type="checkbox" />
                    <span>显示在会员卡</span>
                  </label>
                  <button class="btn danger compact-btn" type="button" @click="removeLevelBenefitRow(benefit)">删除</button>
                </article>
              </section>
            </div>
            <textarea v-else-if="field.type === 'json'" v-model="form[field.key]" rows="7" spellcheck="false"></textarea>
            <select v-else-if="field.type === 'select'" v-model="form[field.key]">
              <option v-for="item in field.options" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
            <label v-else-if="field.type === 'boolean'" class="switch-row">
              <input v-model="form[field.key]" type="checkbox" />
              <span>启用</span>
            </label>
            <input v-else-if="field.type === 'number'" v-model.number="form[field.key]" type="number" step="0.01" />
            <input v-else-if="field.type === 'datetime'" v-model="form[field.key]" type="datetime-local" />
            <input v-else v-model="form[field.key]" type="text" :readonly="isMembersModule && state.editingId && field.key === 'member_id'" />
          </label>
        </div>

        <div v-if="isMealTablesModule" class="qr-generator-panel">
          <div>
            <strong>桌台小程序码</strong>
            <span>生成后会保存为 meal-tables/{{ form.table_name || form.table_id || '桌台名称' }}.png</span>
          </div>
          <div class="qr-generator-body">
            <div class="qr-preview-box">
              <img v-if="formPreviewUrl('qr_image_file_id')" :src="formPreviewUrl('qr_image_file_id')" alt="桌台小程序码" />
              <span v-else>暂无小程序码</span>
            </div>
            <div class="qr-generator-actions">
              <button
                class="btn secondary"
                type="button"
                :disabled="state.generatingQrId === state.editingId"
                @click="generateTableQrCode"
              >
                {{ state.generatingQrId === state.editingId ? '生成中' : '生成小程序码' }}
              </button>
              <small>当前会话 ID 是扫码用餐时产生的桌台会话标识，平时不用填写。</small>
            </div>
          </div>
        </div>

        <aside v-if="state.editingCollection === 'activity_items'" class="activity-editor-preview">
          <div>
            <h3>页面预览</h3>
            <p>按小程序活动详情页的阅读顺序预览。</p>
          </div>
          <div class="activity-phone-preview">
            <div class="phone-preview-bar"></div>
            <section class="phone-hero">
              <img v-if="formPreviewUrl('image_url')" :src="formPreviewUrl('image_url')" alt="活动封面预览" />
              <div v-else class="activity-cover-empty">活动封面</div>
              <div class="phone-hero-copy">
                <small>{{ form.start_at ? formatDateTime(form.start_at) : '活动时间' }}</small>
                <h4>{{ form.title || '活动标题' }}</h4>
                <p>{{ form.subtitle || '活动副标题' }}</p>
                <div>
                  <em>{{ activityPreviewFeeText() }}</em>
                  <em>{{ activityScopeLabel(form.signup_scope) }}</em>
                  <em v-if="form.is_pinned">置顶</em>
                </div>
              </div>
            </section>
            <section class="phone-info-list">
              <div><span>活动时间</span><strong>{{ activityTimeText(form) }}</strong></div>
              <div><span>活动地点</span><strong>{{ form.location || '未填写地点' }}</strong></div>
              <div><span>人数上限</span><strong>{{ form.capacity || '不限' }}</strong></div>
              <div><span>报名截止</span><strong>{{ form.signup_deadline ? formatDateTime(form.signup_deadline) : '未设置' }}</strong></div>
            </section>
            <section class="phone-content-section">
              <h5>活动介绍</h5>
              <p>{{ form.intro_text || '活动介绍文字会显示在这里。' }}</p>
              <div v-if="form.video_url" class="phone-video-placeholder">活动视频</div>
              <div v-if="formImageRows('intro_images').length" class="phone-intro-images">
                <template v-for="(image, index) in formImageRows('intro_images')" :key="`${image.value}-${index}`">
                  <img v-if="formImagePreview(image)" :src="formImagePreview(image)" alt="活动介绍图片" />
                  <div v-else class="phone-image-file">图片 {{ index + 1 }}</div>
                </template>
              </div>
            </section>
            <section v-if="formImageRows('highlight_images').length" class="phone-content-section">
              <h5>精彩瞬间</h5>
              <div class="phone-moment-grid">
                <template v-for="(image, index) in formImageRows('highlight_images').slice(0, 6)" :key="`${image.value}-${index}`">
                  <img v-if="formImagePreview(image)" :src="formImagePreview(image)" alt="精彩瞬间图片" />
                  <div v-else class="phone-image-file">图片</div>
                </template>
              </div>
            </section>
            <button class="phone-submit-preview" type="button">立即报名</button>
          </div>
          <div v-if="formPreviewUrl('qr_image_file_id')" class="qr-preview-box">
            <img :src="formPreviewUrl('qr_image_file_id')" alt="活动二维码" />
          </div>
        </aside>

        <div class="drawer-actions">
          <button class="btn secondary" type="button" @click="closeDrawer">取消</button>
          <button class="btn primary" type="submit" :disabled="state.saving">
            {{ state.saving ? '保存中' : '保存' }}
          </button>
        </div>
      </form>
    </div>

    <!-- 云存储选择器 -->
    <div v-if="state.cloudPicker.visible" class="cloud-picker-modal" aria-modal="true">
      <button class="modal-mask" type="button" aria-label="关闭" @click="closeCloudStoragePicker"></button>
      <div class="cloud-picker-dialog">
        <div class="cloud-picker-head">
          <h3>从云存储选择文件</h3>
          <small>{{ state.cloudPicker.folder || '全部目录' }}</small>
          <button class="icon-btn" type="button" @click="closeCloudStoragePicker">×</button>
        </div>

        <div class="cloud-picker-toolbar">
          <select v-model="state.cloudPicker.folder" @change="fetchCloudFiles(state.cloudPicker.folder)">
            <option value="">全部目录</option>
            <option value="home/banners">home/banners</option>
            <option value="home/cards">home/cards</option>
            <option value="intro">intro</option>
            <option value="meal-items">meal-items</option>
            <option value="rooms">rooms</option>
            <option value="dining-standards">dining-standards</option>
            <option value="activities">activities</option>
            <option value="activities/banners">activities/banners</option>
            <option value="meal-tables">meal-tables</option>
          </select>
          <button class="btn secondary compact-btn" type="button" @click="fetchCloudFiles(state.cloudPicker.folder)">
            刷新
          </button>
        </div>

        <div v-if="state.cloudPicker.loading" class="cloud-picker-loading">加载中...</div>

        <div v-else-if="!state.cloudPicker.files.length" class="cloud-picker-empty">
          该目录下暂无文件。请先通过"上传"按钮上传文件到云存储。
        </div>

        <div v-else class="cloud-picker-grid">
          <button
            v-for="file in state.cloudPicker.files"
            :key="file.fileID"
            type="button"
            class="cloud-picker-card"
            :class="{ selected: state.cloudPicker.selectedFileID === file.fileID }"
            @click="toggleFileSelect(file.fileID)"
          >
            <span class="cloud-picker-preview">
              <img
                v-if="isImageFile(file) && file.previewUrl"
                class="cloud-picker-thumb-img"
                :src="file.previewUrl"
                :alt="file.fileName || file.cloudPath"
                loading="lazy"
              />
              <span v-else class="cloud-picker-file-icon">
                {{ (file.extension || 'FILE').toUpperCase() }}
              </span>
            </span>
            <span class="cloud-picker-file-info">
              <strong class="cloud-picker-file-name" :title="file.cloudPath">
                {{ file.fileName || file.cloudPath }}
              </strong>
              <small class="cloud-picker-file-size">
                {{ formatFileSize(file.size) || (file.extension || '文件').toUpperCase() }}
              </small>
            </span>
          </button>
        </div>

        <div class="cloud-picker-actions" v-if="state.cloudPicker.files.length">
          <button class="btn secondary" type="button" @click="closeCloudStoragePicker">取消</button>
          <button
            class="btn primary"
            type="button"
            :disabled="!state.cloudPicker.selectedFileID"
            @click="selectCloudFile"
          >
            确认选择
          </button>
        </div>
      </div>
    </div>

    <div v-if="state.toastText" class="toast" :class="state.toastType" role="status">
      {{ state.toastText }}
    </div>
  </div>
</template>
