import { __decorate } from "tslib";
import { SuperComponent, wxComponent } from "../common/src/index";
import config from "../common/config";
import props from "./props";
import TCalendar from "../common/shared/calendar/index";
import useCustomNavbar from "../mixins/using-custom-navbar";
import { getPrevMonth, getPrevYear, getNextMonth, getNextYear } from "./utils";

const { prefix } = config;
const name = `${prefix}-calendar`;
const defaultLocaleText = {
  title: "请选择日期",
  weekdays: ["日", "一", "二", "三", "四", "五", "六"],
  monthTitle: "{year} 年 {month}",
  months: ["1 月", "2 月", "3 月", "4 月", "5 月", "6 月", "7 月", "8 月", "9 月", "10 月", "11 月", "12 月"],
  confirm: "确认",
};

function getMonthTitle(year, month, pattern) {
  return (pattern || "").replace(/\{year\}|\{month\}/g, (match) => {
    if (match === "{year}") return year;
    if (match === "{month}") return month || "";
    return match;
  });
}

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

let Calendar = class extends SuperComponent {
  constructor() {
    super(...arguments);
    this.behaviors = [useCustomNavbar];
    this.externalClasses = [`${prefix}-class`];
    this.options = { multipleSlots: true };
    this.properties = props;
    this.data = {
      prefix,
      classPrefix: name,
      months: [],
      scrollIntoView: "",
      innerConfirmBtn: {},
      realLocalText: {},
      currentMonth: [],
      currentMonthTitle: "",
      days: [],
      actionButtons: {
        preYearBtnDisable: false,
        prevMonthBtnDisable: false,
        nextMonthBtnDisable: false,
        nextYearBtnDisable: false,
      },
    };
    this.controlledProps = [
      { key: "value", event: "confirm" },
      { key: "value", event: "change" },
    ];
    this.lifetimes = {
      created() {
        this.base = new TCalendar(this.properties);
      },
      ready() {
        const localeText = Object.assign(Object.assign({}, defaultLocaleText), this.properties.localeText);
        this.initialValue();
        this.setData({
          days: this.base.getDays(localeText.weekdays),
          realLocalText: localeText,
        });
        this.calcMonths();
        if (this.data.switchMode !== "none") this.calcCurrentMonth();
        if (!this.data.usePopup) this.scrollIntoView();
      },
    };
    this.observers = {
      type(type) {
        this.base.type = type;
      },
      confirmBtn(value) {
        if (typeof value === "string") {
          this.setData({ innerConfirmBtn: value === "slot" ? "slot" : { content: value } });
        } else if (typeof value === "object") {
          this.setData({ innerConfirmBtn: value });
        }
      },
      "firstDayOfWeek,minDate,maxDate"(firstDayOfWeek, minDate, maxDate) {
        if (firstDayOfWeek) this.base.firstDayOfWeek = firstDayOfWeek;
        if (minDate) this.base.minDate = minDate;
        if (maxDate) this.base.maxDate = maxDate;
        this.calcMonths();
      },
      value(value) {
        this.base.value = value;
        this.calcMonths();
      },
      visible(visible) {
        if (!visible) return;
        this.scrollIntoView();
        this.base.value = this.data.value;
        this.calcMonths();
      },
      format(format) {
        const { usePopup, visible } = this.data;
        this.base.format = format;
        if (!usePopup || visible) this.calcMonths();
      },
      "holidayMap,workdayMap,showWeekendTip"() {
        this.calcMonths();
      },
    };
    this.methods = {
      initialValue() {
        const { value, type, minDate } = this.data;
        if (value) return;
        const today = new Date();
        const start = minDate || new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const nextValue = type === "single" ? start : [start];
        if (type === "range") nextValue[1] = start + 864e5;
        this.setData({ value: nextValue });
        this.base.value = nextValue;
      },
      scrollIntoView() {
        const { value } = this.data;
        if (!value) return;
        const firstValue = Array.isArray(value) ? value[0] : value;
        if (!firstValue) return;
        const date = new Date(firstValue);
        this.setData({ scrollIntoView: `year_${date.getFullYear()}_month_${date.getMonth()}` });
      },
      getCurrentYearAndMonth(value) {
        const date = new Date(value);
        return { year: date.getFullYear(), month: date.getMonth() };
      },
      updateActionButton(value) {
        const min = this.getCurrentYearAndMonth(this.base.minDate);
        const max = this.getCurrentYearAndMonth(this.base.maxDate);
        const minTime = new Date(min.year, min.month, 1).getTime();
        const maxTime = new Date(max.year, max.month, 1).getTime();
        const prevYear = getPrevYear(value).getTime();
        const prevMonth = getPrevMonth(value).getTime();
        const nextMonth = getNextMonth(value).getTime();
        const nextYear = getNextYear(value).getTime();
        this.setData({
          actionButtons: {
            preYearBtnDisable: prevYear < minTime || prevMonth < minTime,
            prevMonthBtnDisable: prevMonth < minTime,
            nextYearBtnDisable: nextMonth > maxTime || nextYear > maxTime,
            nextMonthBtnDisable: nextMonth > maxTime,
          },
        });
      },
      calcCurrentMonth(value) {
        const current = value || this.getCurrentDate();
        const { year, month } = this.getCurrentYearAndMonth(current);
        const matched = this.data.months.filter((item) => item.year === year && item.month === month);
        const currentMonth = matched.length ? matched : [this.data.months[0]].filter(Boolean);
        const firstMonth = currentMonth[0];
        const localeText = this.data.realLocalText || defaultLocaleText;
        const monthText = firstMonth && localeText.months ? localeText.months[firstMonth.month] : "";
        this.updateActionButton(current);
        this.setData({
          currentMonth,
          currentMonthTitle: firstMonth ? getMonthTitle(firstMonth.year, monthText, localeText.monthTitle) : "",
        });
      },
      decorateDateItem(item, year, month) {
        if (!item) return item;
        const key = dateKey(year, month, item.day);
        const holiday = this.data.holidayMap && this.data.holidayMap[key];
        const workday = this.data.workdayMap && this.data.workdayMap[key];
        const date = item.date instanceof Date ? item.date : new Date(year, month, item.day);
        const day = date.getDay();
        let suffix = item.suffix || "";
        let className = item.className || "";
        if (item.type === "start") {
          suffix = "入住";
        } else if (item.type === "end") {
          suffix = "离店";
        } else if (holiday) {
          suffix = holiday;
          className = `${className} is-holiday`;
        } else if (workday) {
          suffix = workday;
          className = `${className} is-workday`;
        } else if (this.data.showWeekendTip && (day === 0 || day === 6)) {
          suffix = "周末";
          className = `${className} is-weekend`;
        }
        return Object.assign({}, item, { suffix, className: className.trim() });
      },
      calcMonths() {
        const months = this.base.getMonths().map((month) => Object.assign({}, month, {
          months: (month.months || []).map((item) => this.decorateDateItem(item, month.year, month.month)),
        }));
        this.setData({ months });
      },
      close(trigger) {
        if (this.data.autoClose) this.setData({ visible: false });
        this.triggerEvent("close", { trigger });
      },
      onVisibleChange() {
        this.close("overlay");
      },
      handleClose() {
        this.close("close-btn");
      },
      handleSelect(event) {
        const { date, year, month } = event.currentTarget.dataset;
        if (!date || date.type === "disabled") return;
        const selected = this.base.select({
          cellType: date.type,
          year,
          month,
          date: date.day,
        });
        const value = this.toTime(selected);
        this.calcMonths();
        if (this.data.switchMode !== "none") this.calcCurrentMonth(this.getCurrentDate());
        if (this.data.confirmBtn == null && (this.data.type === "single" || (Array.isArray(selected) && selected.length === 2))) {
          this.setData({ visible: false });
          this._trigger("change", { value });
        }
        this.triggerEvent("select", { value });
      },
      onTplButtonTap() {
        const value = this.toTime(this.base.getTrimValue());
        this.close("confirm-btn");
        this._trigger("confirm", { value });
      },
      toTime(value) {
        if (!value) return null;
        return Array.isArray(value) ? value.map((item) => item.getTime()) : value.getTime();
      },
      onScroll(event) {
        this.triggerEvent("scroll", event.detail);
      },
      getCurrentDate() {
        let value = Array.isArray(this.base.value) ? this.base.value[0] : this.base.value;
        const currentMonth = Array.isArray(this.data.currentMonth) ? this.data.currentMonth : [];
        if (currentMonth.length > 0) {
          const { year, month } = currentMonth[0] || {};
          if (year != null && month != null) value = new Date(year, month, 1).getTime();
        }
        return value;
      },
      handleSwitchModeChange(event) {
        const { type, disabled } = event.currentTarget.dataset;
        if (disabled) return;
        const current = this.getCurrentDate();
        const next = {
          "pre-year": () => getPrevYear(current),
          "pre-month": () => getPrevMonth(current),
          "next-month": () => getNextMonth(current),
          "next-year": () => getNextYear(current),
        }[type]();
        if (!next) return;
        const { year, month } = this.getCurrentYearAndMonth(next);
        this.triggerEvent("panel-change", { year, month: month + 1 });
        this.calcCurrentMonth(next);
      },
    };
  }
};

Calendar = __decorate([wxComponent()], Calendar);
export default Calendar;
