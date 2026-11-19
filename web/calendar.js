(() => {
  "use strict";
  const host = window.chrome?.webview;
  const isDesktop = Boolean(host) && location.hostname === "calendar.example";
  const detachedId = isDesktop ? new URLSearchParams(location.search).get("note") : null;
  const projects = window.CalendarProjects;
  document.documentElement.classList.toggle("native", isDesktop);
  document.documentElement.classList.toggle("note-window", Boolean(detachedId));
  const recordKey = "desktop-calendar-sketch.records.v1";
  const transparencyKey = "desktop-calendar-sketch.transparency.v1";
  const sizeKey = "desktop-calendar-sketch.size.v1";
  const days = document.getElementById("days");
  const panel = document.querySelector(".calendar");
  const desktop = document.querySelector(".desktop");
  const sizeMenu = document.getElementById("settings-menu");
  const sizeToggle = document.getElementById("settings-toggle");
  const sizeInputs = [...sizeMenu.querySelectorAll("input[data-setting]")];
  const feedback = document.getElementById("feedback");
  const slider = document.getElementById("transparency");
  const originalText = new WeakMap();
  const composing = new WeakSet();
  const now = new Date();
  let month = new Date(now.getFullYear(), now.getMonth(), 1);
  const viewMonthKey = "desktop-calendar-sketch.view-month.v1";
  const viewKey = "desktop-calendar-sketch.view.v1";
  const yearGrid = document.getElementById("year-grid");
  const yearToggle = document.getElementById("year-toggle");
  let annual = false;
  try {
    const restored = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(sessionStorage.getItem(viewMonthKey) || "");
    if (restored) month = new Date(Number(restored[1]), Number(restored[2]) - 1, 1);
    annual = sessionStorage.getItem(viewKey) === "year";
  } catch {}
  let sequence = 0;
  let records = [];
  let storedTransparency = null;
  let sizes = {};
  let layoutFrame = 0;
  let drag = null;
  const languageKey = "desktop-calendar-sketch.language.v1";
  let locale = "zh-CN";
  try { if (localStorage.getItem(languageKey) === "en-US") locale = "en-US"; } catch {}
  const words = {
    calendar: ["桌面月历", "Desktop calendar"], title: ["桌面月历 · 点写清单", "Desktop calendar · Daily checklist"],
    navigate: ["切换月份", "Month navigation"], previous: ["上个月", "Previous month"], next: ["下个月", "Next month"],
    today: ["今天", "Today"], thisMonth: ["回到本月", "Return to this month"], transparency: ["透明度", "Transparency"],
    yearView: ["年览", "Year view"], monthView: ["月览", "Month view"], yearNav: ["切换年份", "Year navigation"],
    previousYear: ["上一年", "Previous year"], nextYear: ["下一年", "Next year"], thisYear: ["今年", "This year"],
    settings: ["设置", "Settings"], language: ["语言", "Language"], width: ["月历宽度", "Calendar width"],
    taskActions: ["待办操作", "Task actions"], editTask: ["编辑", "Edit"], deleteTask: ["删除", "Delete"],
    taskNote: ["待办笔记", "Task note"], noteTitle: ["待办标题", "Task title"],
    formatNote: ["笔记文字格式", "Note formatting"], textSize: ["文字字号", "Text size"], defaultSize: ["默认字号", "Default size"],
    bold: ["加粗", "Bold"], underline: ["下划线", "Underline"], textColor: ["选择文字颜色", "Choose text color"],
    highlight: ["选择荧光笔颜色", "Choose highlight color"], applyColor: ["应用或移除文字颜色", "Apply or remove text color"],
    applyHighlight: ["应用或擦除荧光笔", "Apply or remove highlight"],
    noteBody: ["笔记正文", "Notes"], notePrompt: ["写下详细内容…", "Write a note…"],
    insertPhoto: ["插入图片", "Add image"], insertPhotoHelp: ["选择本地图片，或在正文按 Ctrl+V 粘贴截图", "Choose an image or paste a screenshot into the note"],
    removePhoto: ["移除图片", "Remove image"], viewPhoto: ["查看大图", "View full image"], closePhoto: ["关闭大图", "Close image"],
    picture: ["图片", "Image"], loadingPhoto: ["读取图片…", "Loading image…"],
    unsupportedPhoto: ["此图片无法打开，可尝试 PNG 或 JPG", "This image could not be opened. Try PNG or JPG."],
    missingPhoto: ["原图未能读取，可重新打开笔记重试", "Could not read this image. Reopen the note to try again."],
    photoSaveError: ["图片没有保存，请检查浏览器存储空间后重试", "Could not save the images. Check browser storage and try again."],
    noteConflict: ["此记录已在其他窗口更改，请复制本次改动后重新打开", "This record changed in another window. Copy your edits and reopen it."],
    exportIllustrated: ["导出图文与格式 HTML", "Export formatted HTML with images"], exportImageError: ["有图片无法读取，图文导出未完成", "An image could not be read. The export did not finish."],
    exportFileError: ["文件没有写入，请换个位置重试", "Could not save the file. Try a different location."],
    cancelNote: ["取消", "Cancel"], saveNote: ["保存", "Save"], titleRequired: ["请填写待办标题", "Enter a task title"],
    desktopMode: ["固定在桌面", "Pin to desktop"], quitApp: ["退出月历", "Quit calendar"],
    moveWindow: ["拖动标题移动月历", "Drag the heading to move the calendar"],
    moveNote: ["拖动日期栏移动笔记", "Drag the date bar to move the note"],
    discardDraft: ["放弃这篇笔记尚未保存的修改？", "Discard unsaved changes to this note?"],
    closeSettings: ["关闭设置", "Close settings"],
    height: ["月历高度", "Calendar height"], calendarFont: ["日历字号", "Calendar font size"], noteFont: ["便签字号", "Note font size"], leading: ["清单行距", "Line spacing"],
    reset: ["恢复默认大小", "Reset sizes"], export: ["导出记录", "Export records"], exportHelp: ["导出所有月份的记录为 CSV", "Export all months as CSV"],
    dragWidth: ["拖动左边缘调整宽度", "Drag the left edge to resize"], dragHeight: ["拖动下边缘调整高度", "Drag the bottom edge to resize"],
    dragBoth: ["拖动左下角调整月历大小", "Drag the bottom-left corner to resize"],
    noSchedule: ["本年节假日安排尚未收录", "Holiday schedule unavailable for this year"],
    storage: ["本地存储不可用，可导出记录", "Storage unavailable. Export to keep your records."],
    temporary: ["暂存于页面，请导出记录", "Export to keep these records."], sizeTemporary: ["大小设置仅在本次打开时生效", "Size settings apply to this session."],
    write: ["写一条待办…", "Write a task…"], add: ["写待办", "Add a task"], task: ["待办", "Task"], date: ["日期", "Date"],
    status: ["完成状态", "Status"], completed: ["已完成", "Completed"], pending: ["未完成", "Open"], check: ["完成待办", "Mark complete"],
    holiday: ["休", "Hol"], work: ["班", "Work"], observed: ["补休", "Obs"], saturday: ["周六", "Sat"], sunday: ["周日", "Sun"]
  };
  function t(key) { return words[key][locale === "en-US" ? 1 : 0]; }
  let feedbackCode = null;
  let exportCount = 0;
  function setFeedback(code) {
    feedbackCode = code;
    feedback.classList.toggle("sr-only", !["storage","temporary","sizeTemporary","exportImageError","exportFileError"].includes(code));
    feedback.textContent = code === "exported"
      ? (locale === "zh-CN" ? "已导出 " + exportCount + " 条记录" : "Exported " + exportCount + " record" + (exportCount === 1 ? "" : "s"))
      : code ? t(code) : "";
  }

  const chinaSources = {
    2024: "https://jdjc.mof.gov.cn/fgzd/202310/t20231025_3913088.htm",
    2025: "https://www.forestry.gov.cn/c/www/szxx/594663.jhtml",
    2026: "https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html",
    2027: "https://www.dxh.gov.cn/ZWGK/zc_zwgk/ZFWJ/TZGG/202611/t20261106_2875104.shtml"
  };
  const usSource = "https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/";
  const chinaCalendar = new Map();
  // Start and end are inclusive. Make-up workdays are explicit annual decisions.
  const chinaBreaks = [
    ["元旦","2023-12-30","2024-01-01"], ["春节","2024-02-10","2024-02-17","2024-02-04","2024-02-18"],
    ["清明节","2024-04-04","2024-04-06","2024-04-07"], ["劳动节","2024-05-01","2024-05-05","2024-04-28","2024-05-11"],
    ["端午节","2024-06-08","2024-06-10"], ["中秋节","2024-09-15","2024-09-17","2024-09-14"],
    ["国庆节","2024-10-01","2024-10-07","2024-09-29","2024-10-12"],
    ["元旦","2025-01-01","2025-01-01"], ["春节","2025-01-28","2025-02-04","2025-01-26","2025-02-08"],
    ["清明节","2025-04-04","2025-04-06"], ["劳动节","2025-05-01","2025-05-05","2025-04-27"],
    ["端午节","2025-05-31","2025-06-02"], ["国庆·中秋","2025-10-01","2025-10-08","2025-09-28","2025-10-11"],
    ["元旦","2026-01-01","2026-01-03","2026-01-04"], ["春节","2026-02-15","2026-02-23","2026-02-14","2026-02-28"],
    ["清明节","2026-04-04","2026-04-06"], ["劳动节","2026-05-01","2026-05-05","2026-05-09"],
    ["端午节","2026-06-19","2026-06-21"], ["中秋节","2026-09-25","2026-09-27"],
    ["国庆节","2026-10-01","2026-10-07","2026-09-20","2026-10-10"],
    ["元旦","2027-01-01","2027-01-03"], ["春节","2027-02-05","2027-02-13","2027-01-31","2027-02-14"],
    ["清明节","2027-04-03","2027-04-05"], ["劳动节","2027-05-01","2027-05-05","2027-05-08"],
    ["端午节","2027-06-09","2027-06-09"], ["中秋节","2027-09-15","2027-09-15"],
    ["国庆节","2027-10-01","2027-10-07","2027-09-26","2027-10-09"]
  ];
  for (const [name, first, last, ...workdays] of chinaBreaks) {
    const cursor = new Date(first + "T00:00:00Z");
    while (cursor.toISOString().slice(0, 10) <= last) {
      chinaCalendar.set(cursor.toISOString().slice(0, 10), { kind: "holiday", name, full: name + "假期" });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    for (const key of workdays) chinaCalendar.set(key, { kind: "work", name: "补班", full: name + "调休上班" });
  }

  const usCalendar = new Map();
  // Nationwide 5 USC 6103(a) dates and the observed date for a Monday–Friday workweek.
  function addFederalHoliday(date, name) {
    usCalendar.set(dateKey(date), { kind: "holiday", name, full: name });
    const weekday = date.getDay();
    if (weekday === 6 || weekday === 0) {
      const observed = new Date(date);
      observed.setDate(observed.getDate() + (weekday === 6 ? -1 : 1));
      usCalendar.set(dateKey(observed), { kind: "observed", name, full: name + " (observed)" });
    }
  }
  for (let year = 2021; year <= 2030; year++) {
    for (const [m, d, name] of [[1,1,"New Year’s Day"], [6,19,"Juneteenth National Independence Day"],
      [7,4,"Independence Day"], [11,11,"Veterans Day"], [12,25,"Christmas Day"]]) {
      addFederalHoliday(new Date(year, m - 1, d), name);
    }
    for (const [m, weekday, occurrence, name] of [[1,1,3,"Birthday of Martin Luther King, Jr."],
      [2,1,3,"Washington’s Birthday"], [5,1,-1,"Memorial Day"], [9,1,1,"Labor Day"],
      [10,1,2,"Columbus Day"], [11,4,4,"Thanksgiving Day"]]) {
      const anchor = occurrence === -1 ? new Date(year, m, 0) : new Date(year, m - 1, 1);
      if (occurrence === -1) anchor.setDate(anchor.getDate() - (anchor.getDay() - weekday + 7) % 7);
      else anchor.setDate(1 + (weekday - anchor.getDay() + 7) % 7 + 7 * (occurrence - 1));
      addFederalHoliday(anchor, name);
    }
  }

  try {
    records = readRecords();
    storedTransparency = localStorage.getItem(transparencyKey);
  } catch {
    setFeedback("storage");
  }
  try {
    const saved = JSON.parse(localStorage.getItem(sizeKey) || "{}");
    for (const input of sizeInputs) {
      const name = input.dataset.setting;
      const legacy = Number.isFinite(saved?.font) && saved.font >= 11 && saved.font <= 28 ? saved.font : undefined;
      const value = saved?.[name] ?? (name === "noteFont" ? legacy : name === "calendarFont" && legacy ? legacy + 1 : undefined);
      if (Number.isFinite(value) && value > 0 &&
          (!input.min || value >= Number(input.min)) && (!input.max || value <= Number(input.max))) {
        sizes[name] = value;
      }
    }
  } catch {}

  function dateKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")].join("-");
  }

  function readRecords() {
    const data = JSON.parse(localStorage.getItem(recordKey) || "[]");
    if (!Array.isArray(data)) throw new Error("Invalid calendar records");
    return data.filter(item => item && typeof item.id === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(item.date) && typeof item.text === "string");
  }

  function applyChange(list, {id, patch, create}) {
    const index = list.findIndex(item => item.id === id);
    if (patch === null) {
      if (index >= 0) list.splice(index, 1);
    } else if (index >= 0) {
      list[index] = {...list[index], ...patch};
    } else if (create) {
      list.push({id, ...patch});
    }
  }

  const pendingChanges = [];
  function changeRecord(id, patch, create = false, expectedNote = null) {
    const change = {id, patch, create};
    try {
      const latest = readRecords();
      for (const pending of pendingChanges) applyChange(latest, pending);
      const previous = latest.find(item => item.id === id);
      if (expectedNote && (!previous || !sameNote(previous, expectedNote) ||
          (Object.hasOwn(patch, "text") && previous.text !== expectedNote.text) ||
          (Object.hasOwn(patch, "projectId") && (previous.projectId || "") !== (expectedNote.projectId || "")))) throw new Error("noteConflict");
      applyChange(latest, change);
      localStorage.setItem(recordKey, JSON.stringify(latest));
      records = latest;
      projects.refresh();
      pendingChanges.length = 0;
      setFeedback(null);
      return previous;
    } catch (error) {
      if (expectedNote || error.message === "noteConflict") throw error;
      pendingChanges.push(change);
      applyChange(records, change);
      projects.refresh();
      setFeedback("temporary");
    }
  }

  function setTransparency(value, save) {
    const amount = Math.max(0, Math.min(100, Number(value)));
    if (!Number.isFinite(amount)) return;
    slider.value = amount;
    slider.style.setProperty("--range-fill", amount + "%");
    document.getElementById("transparency-value").value = amount + "%";
    document.documentElement.style.setProperty("--sheet-alpha", (100 - amount) / 100);
    document.documentElement.style.setProperty("--cell-alpha", .91 * (100 - amount) / 100);
    if (save) {
      try { localStorage.setItem(transparencyKey, String(amount)); } catch {}
    }
  }

  const autoHeight = CSS.supports("field-sizing", "content");
  function fit(area) {
    if (autoHeight) return;
    area.style.height = "0";
    area.style.height = area.scrollHeight + "px";
  }

  function sizeBounds() {
    if (isDesktop) return {width:[350, Math.max(350, screen.availWidth)], height:[320, Math.max(320, screen.availHeight)]};
    const padding = getComputedStyle(desktop);
    const width = Math.max(1, Math.floor(desktop.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight)));
    const height = Math.max(1, Math.floor(document.documentElement.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom)));
    return { width: [Math.min(350, width), width], height: [Math.min(320, height), height] };
  }

  function syncSizeControls() {
    const bounds = sizeBounds();
    const rect = panel.getBoundingClientRect();
    const textStyle = getComputedStyle(days);
    const fontSize = parseFloat(textStyle.fontSize);
    const values = {
      width: Math.round(rect.width), height: Math.round(rect.height), noteFont: Math.round(fontSize),
      calendarFont: sizes.calendarFont || Math.round(parseFloat(getComputedStyle(days.querySelector(".day-number") || document.querySelector(".mini-title") || panel).fontSize)),
      leading: Math.round(100 * parseFloat(textStyle.lineHeight) / fontSize)
    };
    for (const input of sizeInputs) {
      const name = input.dataset.setting;
      if (bounds[name]) [input.min, input.max] = bounds[name];
      input.value = values[name];
      const readout = name === "leading" ? (Number(input.value) / 100).toFixed(2) + (locale === "zh-CN" ? " 倍" : "×") : input.value + " px";
      document.getElementById(input.id + "-out").value = readout;
      input.setAttribute("aria-valuetext", readout);
    }
  }

  function queueLayout() {
    if (detachedId) return;
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      if (note.open) positionNote();
      if (!sizeMenu.hidden) syncSizeControls();
      if (autoHeight) return;
      const editors = [...days.querySelectorAll(".task")];
      editors.forEach(area => { area.style.height = "0"; });
      const heights = editors.map(area => area.scrollHeight);
      editors.forEach((area, index) => { area.style.height = heights[index] + "px"; });
    });
  }

  function applySizes() {
    panel.style.width = sizes.width ? sizes.width + "px" : "";
    panel.style.height = sizes.height ? sizes.height + "px" : "";
    document.documentElement.style.setProperty("--task-size", sizes.noteFont ? sizes.noteFont + "px" : "");
    panel.style.setProperty("--calendar-size", sizes.calendarFont ? sizes.calendarFont + "px" : "");
    panel.style.setProperty("--calendar-title-size", sizes.calendarFont ? sizes.calendarFont * 1.85 + "px" : "");
    panel.style.setProperty("--leading", sizes.leading ? String(sizes.leading / 100) : "");
    queueLayout();
  }

  function saveSizes() {
    try { localStorage.setItem(sizeKey, JSON.stringify(sizes)); } catch {
      setFeedback("sizeTemporary");
    }
  }

  function showSizeMenu(open) {
    sizeMenu.hidden = !open;
    sizeToggle.setAttribute("aria-expanded", String(open));
    if (open) {
      document.getElementById("export-illustrated").hidden = !records.some(item => item.note || photoRefs(item).length);
      syncSizeControls();
    }
  }
  sizeToggle.addEventListener("click", () => showSizeMenu(sizeMenu.hidden));
  document.getElementById("settings-close").addEventListener("click", () => {
    showSizeMenu(false);
    sizeToggle.focus({ preventScroll: true });
  });
  document.addEventListener("pointerdown", event => {
    if (!sizeMenu.hidden && !sizeMenu.contains(event.target) && !sizeToggle.contains(event.target)) showSizeMenu(false);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !sizeMenu.hidden) {
      showSizeMenu(false);
      sizeToggle.focus();
    }
  });
  sizeMenu.addEventListener("input", event => {
    const input = event.target;
    if (!input.dataset.setting) return;
    if (isDesktop && ["width","height"].includes(input.dataset.setting)) {
      host.postMessage(input.dataset.setting + "=" + input.value);
      return;
    }
    sizes[input.dataset.setting] = Number(input.value);
    applySizes();
  });
  sizeMenu.addEventListener("change", event => { if (event.target.dataset.setting) saveSizes(); });
  document.getElementById("size-reset").addEventListener("click", () => {
    sizes = {};
    if (isDesktop) host.postMessage("reset-size");
    applySizes();
    saveSizes();
  });

  panel.addEventListener("pointerdown", event => {
    const handle = event.target.closest("[data-resize]");
    if (!handle || !event.isPrimary || event.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    drag = { id: event.pointerId, mode: handle.dataset.resize, x: event.clientX, y: event.clientY,
      width: rect.width, height: rect.height, bounds: sizeBounds(), moved: false };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  function resizeByPointer(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const deltaX = drag.x - event.clientX;
    const deltaY = event.clientY - drag.y;
    if (!deltaX && !deltaY && !drag.moved) return;
    function clamp(value, limits) { return Math.round(Math.min(limits[1], Math.max(limits[0], value))); }
    if (drag.mode !== "height") sizes.width = clamp(drag.width + deltaX, drag.bounds.width);
    if (drag.mode !== "width") sizes.height = clamp(drag.height + deltaY, drag.bounds.height);
    drag.moved = true;
    applySizes();
  }
  panel.addEventListener("pointermove", resizeByPointer);
  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (event.type === "pointerup") resizeByPointer(event);
    if (drag.moved) saveSizes();
    drag = null;
  }
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) panel.addEventListener(type, endDrag);

  function updateRow(row) {
    const area = row.querySelector(".task");
    const box = row.querySelector(".check");
    const text = area.value.trim();
    const index = records.findIndex(item => item.id === row.dataset.id);
    box.disabled = !text;
    const checked = box.checked;
    row.classList.toggle("done", checked && !!text);
    box.setAttribute("aria-label", t("check") + " " + text);
    const existing = records[index];
    if (!text) {
      if (existing && !existing.note && !photoRefs(existing).length) changeRecord(row.dataset.id, null);
      return;
    }
    if (!existing) {
      changeRecord(row.dataset.id, {date: row.closest(".day").dataset.date, text, done: checked, projectId: row.dataset.projectId || ""}, true);
      return;
    }
    const patch = {};
    if (existing.text !== text) patch.text = text;
    if (existing.done !== checked) patch.done = checked;
    if (Object.keys(patch).length) changeRecord(existing.id, patch);
  }

  function makeRow(cell, item) {
    const row = document.createElement("div");
    row.className = "entry";
    row.dataset.id = item?.id || (window.crypto?.randomUUID?.() ??
      "trial-" + Date.now().toString(36) + "-" + (++sequence).toString(36));
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "check";
    box.checked = Boolean(item?.done);
    box.disabled = !item;
    box.setAttribute("aria-label", t("check") + " " + (item?.text || ""));
    const area = document.createElement("textarea");
    area.className = "task";
    area.rows = 1;
    area.spellcheck = false;
    area.setAttribute("aria-label", cell.dataset.date + " " + t("task"));
    area.value = item?.text || "";
    row.classList.toggle("done", box.checked);
    row.append(box, area);
    projects.tagRow(row,item ? item.projectId : projects.active());
    return row;
  }

  function focusDraft(cell) {
    const list = cell.querySelector(".entries");
    let area = Array.from(list.querySelectorAll(".task")).find(editor => !editor.value.trim());
    if (!area) {
      const row = makeRow(cell);
      list.append(row);
      area = row.querySelector(".task");
      fit(area);
    }
    area.focus({ preventScroll: true });
    area.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function renderYearGrid(year, fullDate, weekdays) {
    const fragment = document.createDocumentFragment();
    const todayKey = dateKey(new Date());
    const recorded = new Set(records.map(entry => entry.date));
    const calendar = locale === "zh-CN" ? chinaCalendar : usCalendar;
    const name = new Intl.DateTimeFormat(locale, {month:"long"});
    for (let m = 0; m < 12; m++) {
      const first = new Date(year, m, 1);
      const card = document.createElement("section");
      card.className = "mini-month";
      card.classList.toggle("alternate", (m + 1) % 2 === 0);
      const title = document.createElement("button");
      title.type = "button";
      title.className = "mini-title";
      title.dataset.monthIndex = m;
      title.textContent = name.format(first);
      const week = document.createElement("div");
      week.className = "mini-week";
      week.setAttribute("aria-hidden", "true");
      for (const weekday of weekdays) {
        const mark = document.createElement("span");
        mark.textContent = locale === "zh-CN" ? weekday.slice(-1) : weekday.slice(0,2);
        week.append(mark);
      }
      const numbers = document.createElement("div");
      numbers.className = "mini-dates";
      for (let gap = 0; gap < first.getDay(); gap++) numbers.append(document.createElement("span"));
      const length = new Date(year, m + 1, 0).getDate();
      for (let d = 1; d <= length; d++) {
        const date = new Date(year, m, d);
        const key = dateKey(date);
        const occasion = calendar.get(key);
        const button = document.createElement("button");
        button.className = "mini-date";
        button.type = "button";
        button.dataset.date = key;
        button.textContent = d;
        button.classList.toggle("has-record", recorded.has(key));
        button.classList.toggle("weekend", date.getDay() === 0 || date.getDay() === 6);
        if (occasion) button.dataset.holiday = occasion.kind;
        if (key === todayKey) button.setAttribute("aria-current", "date");
        button.title = fullDate.format(date) + (occasion ? " · " + occasion.full : "") +
          (recorded.has(key) ? (locale === "zh-CN" ? " · 有待办" : " · Has tasks") : "");
        button.setAttribute("aria-label", button.title);
        numbers.append(button);
      }
      card.append(title, week, numbers);
      fragment.append(card);
    }
    yearGrid.replaceChildren(fragment);
    yearGrid.scrollTop = 0;
  }
  function renderMonth() {
    closeTaskMenu();
    const english = locale === "en-US";
    const year = month.getFullYear();
    try {
      sessionStorage.setItem(viewMonthKey, dateKey(month).slice(0, 7));
      sessionStorage.setItem(viewKey, annual ? "year" : "month");
    } catch {}
    const monthName = new Intl.DateTimeFormat(locale, { month: "short" });
    const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
    const weekdays = english ? ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"] : ["周日","周一","周二","周三","周四","周五","周六"];
    document.querySelectorAll(".weekdays span").forEach((node, index) => { node.textContent = weekdays[index]; });
    const source = document.getElementById("holiday-source");
    source.href = english ? usSource : (chinaSources[year] || chinaSources[2027]);
    source.textContent = english ? "U.S. nationwide federal holidays · 2021–2030" : "国务院放假调休安排 · 2024–2027";
    const knownYear = english ? year >= 2021 && year <= 2030 : Object.hasOwn(chinaSources, year);
    const coverageNote = document.getElementById("calendar-hint");
    coverageNote.hidden = knownYear;
    coverageNote.textContent = knownYear ? "" : t("noSchedule");
    document.getElementById("year-value").textContent = month.getFullYear();
    document.getElementById("month-value").textContent = english ? month.toLocaleDateString(locale, {month:"long"}) : month.getMonth() + 1;
    panel.classList.toggle("annual", annual);
    days.hidden = annual;
    document.querySelector(".weekdays").hidden = annual;
    yearGrid.hidden = !annual;
    yearToggle.textContent = t(annual ? "monthView" : "yearView");
    yearToggle.setAttribute("aria-pressed", String(annual));
    document.querySelector(".month-nav").setAttribute("aria-label", t(annual ? "yearNav" : "navigate"));
    const todayButton = document.getElementById("today");
    todayButton.textContent = t(annual ? "thisYear" : "today");
    todayButton.title = t(annual ? "thisYear" : "thisMonth");
    for (const id of ["previous", "next"]) {
      const button = document.getElementById(id);
      button.title = t(annual ? id + "Year" : id);
      button.setAttribute("aria-label", button.title);
    }
    if (annual) {
      days.replaceChildren();
      renderYearGrid(year, fullDate, weekdays);
      return;
    }
    yearGrid.replaceChildren();
    const first = month.getDay();
    const length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const weeks = Math.max(5, Math.ceil((first + length) / 7));
    const todayKey = dateKey(new Date());
    const byDate = new Map();
    for (const record of records) {
      if (!byDate.has(record.date)) byDate.set(record.date, []);
      byDate.get(record.date).push(record);
    }
    const fragment = document.createDocumentFragment();
    const dates = Array.from({length: weeks * 7}, (_, i) => new Date(year, month.getMonth(), i - first + 1));
    for (const [i, date] of dates.entries()) {
      const key = dateKey(date);
      const occasion = (english ? usCalendar : chinaCalendar).get(key);
      const label = fullDate.format(date) + (occasion ? " · " + occasion.full : "");
      const cell = document.createElement("section");
      cell.className = "day";
      cell.dataset.date = key;
      cell.dataset.month = String(date.getMonth() + 1);
      const sameMonth = index => dates[index]?.getMonth() === date.getMonth();
      const edges = [];
      if (!sameMonth(i - 7)) edges.push("top");
      if (!sameMonth(i + 7)) edges.push("bottom");
      if (i % 7 === 0 || !sameMonth(i - 1)) edges.push("left");
      if (i % 7 === 6 || !sameMonth(i + 1)) edges.push("right");
      cell.dataset.edges = edges.join(" ");
      cell.classList.toggle("alternate", (date.getMonth() + 1) % 2 === 0);
      cell.dataset.weekday = String(date.getDay());
      cell.classList.toggle("outside", date.getMonth() !== month.getMonth());
      cell.classList.toggle("current", key === todayKey);
      cell.setAttribute("aria-label", label);
      const number = document.createElement("button");
      number.className = "day-number";
      number.type = "button";
      number.textContent = date.getDate();
      number.setAttribute("aria-label", label + " · " + t("add"));
      if (key === todayKey) number.setAttribute("aria-current", "date");
      const dayHeading = document.createElement("div");
      dayHeading.className = "day-heading";
      dayHeading.append(number);
      if (i === 0 || date.getDate() === 1) {
        const mark = document.createElement("span");
        mark.className = "month-mark";
        mark.textContent = english ? monthName.format(date) : (date.getMonth() + 1) + "月";
        mark.setAttribute("aria-hidden", "true");
        dayHeading.append(mark);
      }
      if (occasion) {
        cell.dataset.holiday = occasion.kind;
        const mark = document.createElement("span");
        mark.className = "holiday-mark " + occasion.kind;
        mark.title = occasion.full;
        mark.setAttribute("aria-label", occasion.full);
        const name = document.createElement("span");
        name.className = "holiday-name";
        name.textContent = occasion.name;
        mark.append(t(occasion.kind), name);
        number.after(mark);
      }
      const list = document.createElement("div");
      list.className = "entries";
      for (const entry of byDate.get(key) || []) list.append(makeRow(cell, entry));
      cell.append(dayHeading, list);
      fragment.append(cell);
    }
    days.style.setProperty("--weeks", weeks);
    days.replaceChildren(fragment);
    days.scrollTop = 0;
    days.querySelectorAll(".task").forEach(fit);
  }

  function displayLanguage() {
    document.documentElement.lang = locale;
    projects.langChanged();
    noteBody.dataset.placeholder = t("notePrompt");
    document.title = t("title");
    if (isDesktop && !detachedId) host.postMessage("lang=" + locale);
    document.getElementById("language").value = locale;
    panel.style.setProperty("--write-hint", JSON.stringify(t("write")));
    document.querySelectorAll("input[data-placeholder],textarea[data-placeholder]").forEach(node => { node.placeholder = t(node.dataset.placeholder); });
    document.querySelectorAll("[data-copy]").forEach(node => { node.textContent = t(node.dataset.copy); });
    document.querySelectorAll("[data-aria]").forEach(node => node.setAttribute("aria-label", t(node.dataset.aria)));
    document.querySelectorAll("[data-tip]").forEach(node => { node.title = t(node.dataset.tip); });
    setFeedback(feedbackCode);
    if (!detachedId) renderMonth();
    if (!sizeMenu.hidden) syncSizeControls();
  }
  document.getElementById("language").addEventListener("change", event => {
    locale = event.target.value;
    try { localStorage.setItem(languageKey, locale); } catch {}
    displayLanguage();
  });

  days.addEventListener("click", event => {
    const target = event.target;
    const cell = target.closest(".day");
    if (!cell) return;
    if (target.matches("textarea, input")) return;
    const row = target.closest(".entry");
    if (row) row.querySelector(".task").focus();
    else focusDraft(cell);
  });
  days.addEventListener("focusin", event => {
    if (event.target.matches(".task")) originalText.set(event.target, event.target.value);
  });
  days.addEventListener("compositionstart", event => composing.add(event.target));
  days.addEventListener("compositionend", event => {
    composing.delete(event.target);
    if (event.target.matches(".task")) updateRow(event.target.closest(".entry"));
  });
  days.addEventListener("input", event => {
    const area = event.target;
    if (!area.matches(".task")) return;
    fit(area);
    if (!event.isComposing && !composing.has(area)) updateRow(area.closest(".entry"));
  });
  days.addEventListener("change", event => {
    if (event.target.matches(".check")) updateRow(event.target.closest(".entry"));
  });
  days.addEventListener("focusout", event => {
    const area = event.target;
    if (!area.matches(".task")) return;
    const row = area.closest(".entry");
    if (!row) return;
    updateRow(row);
    if (!area.value.trim()) {
      const saved = records.find(item => item.id === row.dataset.id);
      if (saved && (saved.note || photoRefs(saved).length)) {
        area.value = saved.text;
        updateRow(row);
        fit(area);
      } else row.remove();
    }
  });
  days.addEventListener("keydown", event => {
    const area = event.target;
    if (!area.matches(".task") || event.isComposing || event.keyCode === 229 || composing.has(area)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (area.value.trim()) {
        updateRow(area.closest(".entry"));
        focusDraft(area.closest(".day"));
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      const dateButton = area.closest(".day").querySelector(".day-number");
      area.value = originalText.get(area) || "";
      fit(area);
      updateRow(area.closest(".entry"));
      dateButton.focus({ preventScroll: true });
    }
  });

  function moveMonth(delta) {
    month = new Date(month.getFullYear(), month.getMonth() + (annual ? 12 : 1) * delta, 1);
    renderMonth();
  }
  yearToggle.addEventListener("click", () => { annual = !annual; renderMonth(); });
  yearGrid.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    const key = button.dataset.date;
    month = key ? new Date(Number(key.slice(0,4)), Number(key.slice(5,7)) - 1, 1)
      : new Date(month.getFullYear(), Number(button.dataset.monthIndex), 1);
    annual = false;
    renderMonth();
    if (key) focusDraft(days.querySelector('[data-date="' + key + '"]'));
    else yearToggle.focus({ preventScroll: true });
  });
  document.getElementById("previous").addEventListener("click", () => moveMonth(-1));
  document.getElementById("next").addEventListener("click", () => moveMonth(1));
  document.getElementById("today").addEventListener("click", () => {
    const localToday = new Date();
    month = new Date(localToday.getFullYear(), localToday.getMonth(), 1);
    renderMonth();
  });
  slider.addEventListener("input", () => setTransparency(slider.value, true));

  function csvField(value) {
    const safe = /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
    return '"' + safe.replace(/"/g, '""') + '"';
  }
  let pendingExport = null;
  if (isDesktop) {
    window.readCalendarExportChunk = async (id, offset, length) => {
      if (pendingExport?.id !== id) throw new Error("Expired export");
      const encoded = await dataURL(pendingExport.blob.slice(offset, offset + length));
      return encoded.slice(encoded.indexOf(",") + 1);
    };
    host.addEventListener("message", event => {
      const parts = typeof event.data === "string" ? event.data.split("|") : [];
      if (parts[0] !== "export" || !pendingExport || parts[1] !== pendingExport.id) return;
      const count = pendingExport.count;
      pendingExport = null;
      if (parts[2] === "saved") exportFinished(count);
      if (parts[2] === "error") setFeedback("exportFileError");
    });
  }
  function exportFinished(count) {
    exportCount = count;
    setFeedback("exported");
    showSizeMenu(false);
    sizeToggle.focus({preventScroll:true});
  }
  function downloadRecords(blob, extension, count) {
    if (isDesktop) {
      if (pendingExport) return;
      const id=crypto.randomUUID();
      pendingExport={id,blob,count};
      host.postMessage(["export",id,extension,blob.size].join("|"));
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (locale === "en-US" ? "Calendar_" : "月历清单_") + dateKey(new Date()) + "." + extension;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 15000);
    exportFinished(count);
  }
  function exportRecords() {
    let source = records;
    if (!pendingChanges.length) try { source = readRecords(); } catch {}
    return [...source].sort((a, b) => a.date.localeCompare(b.date));
  }
  document.getElementById("export").addEventListener("click", () => {
    const rows = [[t("date"), t("task"), t("status"), t("noteBody"), locale==="en-US" ? "Project" : "项目", locale==="en-US" ? "Project color" : "项目颜色"]];
    const ordered = exportRecords();
    for (const entry of ordered) {
      const body = noteParts(entry).map(part => typeof part === "string" ? part : "\n[" + t("picture") + " · " + part.name + "]\n").join("");
      const project=projects.find(entry.projectId);
      rows.push([entry.date, entry.text, t(entry.done ? "completed" : "pending"), body, project.name, project.color]);
    }
    const csv = "\uFEFF" + rows.map(row => row.map(csvField).join(",")).join("\r\n") + "\r\n";
    downloadRecords(new Blob([csv], {type:"text/csv;charset=utf-8"}), "csv", ordered.length);
  });
  function htmlText(value) {
    return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
  }
  function dataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  document.getElementById("export-illustrated").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    const ordered = exportRecords();
    const chunks = ['<!doctype html><html lang="' + locale + '"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + htmlText(t("calendar")) + '</title>',
      '<style>body{max-width:54rem;margin:2rem auto;padding:0 1rem;background:#fafbfc;color:#172e3e;font:16px/1.6 system-ui,sans-serif}h1,h2,h3{line-height:1.3}h1{font-size:1.6rem}h2{font-size:1.1rem;margin-top:2rem}h3{font-size:1.1rem;margin:0}article{padding:1rem 0;border-top:1px solid #c9d5dc}small{color:#486272}p{white-space:pre-wrap;overflow-wrap:anywhere}img{display:block;max-width:100%;height:auto;margin:.5rem 0;border-radius:6px}</style><body><h1>' + htmlText(t("calendar")) + '</h1>'];
    try {
      let lastDate = "";
      for (const item of ordered) {
        if (lastDate !== item.date) { chunks.push("<h2>" + htmlText(item.date) + "</h2>"); lastDate = item.date; }
        const project=projects.find(item.projectId);
        chunks.push("<article><h3>" + htmlText(item.text) + "</h3><small>" + t(item.done ? "completed" : "pending") + ' · <span style="color:' + project.color + '">●</span> ' + htmlText(project.name) + "</small>");
        chunks.push('<div style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:' + getComputedStyle(days).fontSize + '">');
        for (const part of CalendarRichNote.parts(item,noteParts(item))) {
          if (part.photo) {
            const blob = await readPhoto(part.photo.id);
            chunks.push('<img alt="' + htmlText(part.photo.name) + '" src="', await dataURL(blob), '">');
          } else {
            const style = CalendarRichNote.css(part.attributes);
            chunks.push(style ? '<span style="' + style + '">' + htmlText(part.text) + '</span>' : htmlText(part.text));
          }
        }
        chunks.push("</div>");
        chunks.push("</article>");
      }
      chunks.push("<\/body></html>");
      downloadRecords(new Blob(chunks, {type:"text/html;charset=utf-8"}), "html", ordered.length);
    } catch { setFeedback("exportImageError"); }
    finally { button.disabled = false; }
  });
  const taskMenu = document.getElementById("task-menu");
  const menuItems = [...taskMenu.querySelectorAll('[role="menuitem"]')];
  const note = document.getElementById("task-note");
  const noteForm = document.getElementById("note-form");
  const noteTitle = document.getElementById("note-title");
  const noteDocument = document.getElementById("note-document");
  const noteFiles = document.getElementById("note-files");
  const noteMessage = document.getElementById("note-message");
  const photoPreview = document.getElementById("photo-preview");
  const fullPhoto = document.getElementById("photo-original");
  let menuRow = null;
  let noteRow = null;
  let movedNote = null;
  let draft = null;
  let databasePromise = null;
  const rich = CalendarRichNote.create(noteDocument,paintPhoto);
  const noteBody = rich.root;

  function photoRefs(item) {
    return Array.isArray(item?.noteImages) ? item.noteImages : [];
  }
  function sameNote(a, b) {
    return (a.note || "") === (b.note || "") && JSON.stringify(photoRefs(a)) === JSON.stringify(photoRefs(b)) &&
      JSON.stringify(a.noteStyles || []) === JSON.stringify(b.noteStyles || []);
  }
  // Offsets use the same UTF-16 indices as a textarea selection. Older text-only records need no migration.
  function noteParts(item) {
    const text = item.note || "", parts = [];
    let start = 0;
    for (const ref of photoRefs(item)) {
      const end = Math.max(start, Math.min(text.length, Number(ref.at) || 0));
      parts.push(text.slice(start, end), ref);
      start = end;
    }
    parts.push(text.slice(start));
    return parts;
  }
  function imageDatabase() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const req = indexedDB.open("desktop-calendar-sketch.images.v1", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("images");
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => { db.close(); databasePromise = null; };
          resolve(db);
        };
        req.onerror = () => reject(req.error);
      }).catch(error => { databasePromise = null; throw error; });
    }
    return databasePromise;
  }
  async function readPhoto(id) {
    const db = await imageDatabase();
    return new Promise((resolve, reject) => {
      const req = db.transaction("images").objectStore("images").get(id);
      req.onsuccess = () => req.result instanceof Blob ? resolve(req.result) : reject(new Error("missingPhoto"));
      req.onerror = () => reject(req.error);
    });
  }
  async function writePhotos(additions, removals) {
    if (!additions.length && !removals.length) return;
    const db = await imageDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("images", "readwrite");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error("photoSaveError"));
      const store = tx.objectStore("images");
      for (const {id, file} of additions) store.put(file, id);
      for (const id of removals) store.delete(id);
    });
  }
  async function discardUnreferenced(ids) {
    if (!ids.length) return;
    try {
      const referenced = new Set(readRecords().flatMap(item => photoRefs(item).map(ref => ref.id)));
      await writePhotos([], ids.filter(id => !referenced.has(id)));
    } catch { /* A later cleanup must never cost a referenced original. */ }
  }
  function paintPhoto(figure, id) {
    const owner = draft, photo = owner?.photos.get(id);
    if (!photo) return;
    const view = document.createElement("button"), remove = document.createElement("button");
    view.type = remove.type = "button";
    view.className = "note-photo-view";
    view.disabled = true;
    view.textContent = t("loadingPhoto");
    view.setAttribute("aria-label", t("viewPhoto") + " · " + photo.name);
    remove.className = "note-photo-remove";
    remove.textContent = "×";
    remove.title = t("removePhoto") + " · " + photo.name;
    remove.setAttribute("aria-label", remove.title);
    figure.append(view, remove);
    if (!photo.ready) photo.ready = (async () => {
      const blob = photo.file || await readPhoto(id);
      if (draft !== owner) return;
      photo.url = URL.createObjectURL(blob);
      const image = new Image();
      image.src = photo.url;
      await image.decode();
      photo.loaded = true;
    })();
    photo.ready.then(() => {
      if (draft !== owner || !photo.loaded) return;
      const image = new Image();
      image.alt = photo.name;
      image.src = photo.url;
      view.replaceChildren(image);
      view.disabled = false;
    }).catch(() => {
      if (draft !== owner) return;
      view.textContent = photo.name;
      noteMessage.textContent = photo.name + " · " + t(photo.file ? "unsupportedPhoto" : "missingPhoto");
    });
  }
  function resetPhotoDraft() {
    if (draft) for (const photo of draft.photos.values()) if (photo.url) URL.revokeObjectURL(photo.url);
    draft = null;
    rich.reset({}, []);
    noteDocument.classList.remove("drag-over");
    noteMessage.textContent = "";
    noteFiles.value = "";
    noteForm.inert = false;
  }
  function fillNoteDocument(item) {
    resetPhotoDraft();
    const photos = new Map(photoRefs(item).map(ref => [ref.id,{id:ref.id,name:ref.name}]));
    draft = {original:item, photos, saving:false};
    rich.reset(item, noteParts(item));
    noteBody.scrollTop = 0;
  }
  function insertPhotos(files) {
    if (!draft || draft.saving || !files.length) return;
    noteMessage.textContent = "";
    const accepted = [];
    for (const file of files) {
      const mime = file.type.toLowerCase();
      const knownRaster = /^image\/(?:png|x-png|jpe?g|pjpeg|gif|webp|bmp|x-ms-bmp|avif|apng|heic|heif|tiff|jxl)$/;
      const namedRaster = /\.(?:png|jpe?g|gif|webp|bmp|avif|apng|heic|heif|tiff?|jxl)$/i;
      if (knownRaster.test(mime) || ((!mime || mime === "application/octet-stream") && namedRaster.test(file.name))) accepted.push(file);
      else noteMessage.textContent = (file.name || t("picture")) + " · " + t("unsupportedPhoto");
    }
    if (!accepted.length) return;
    const ids = accepted.map(file => {
      const id = crypto.randomUUID();
      draft.photos.set(id, {id, name:file.name || t("picture"), file});
      return id;
    });
    rich.addPhotos(ids);
  }
  document.getElementById("add-note-photo").addEventListener("click", () => noteFiles.click());
  noteFiles.addEventListener("change", () => {
    insertPhotos([...noteFiles.files]);
    noteFiles.value = "";
  });
  noteForm.addEventListener("paste", event => {
    const data = event.clipboardData;
    if (!data) return;
    const files = [...data.files];
    if (!files.length) {
      for (const item of data.items) {
        if (item.kind === "file") { const file = item.getAsFile(); if (file) files.push(file); }
      }
    }
    if (!files.length && !data.getData("text/plain").trim() && data.types.includes("text/html")) {
      const source = document.createElement("template");
      source.innerHTML = data.getData("text/html");
      for (const image of source.content.querySelectorAll("img[src]")) {
        const match = /^data:(image\/(?:png|jpeg|webp|gif|avif|bmp));base64,([\s\S]+)$/i.exec(image.getAttribute("src"));
        if (!match) continue;
        try {
          const binary = atob(match[2]);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          files.push(new File([bytes], t("picture") + "." + match[1].slice(6), {type:match[1]}));
        } catch {}
      }
    }
    if (files.length) { event.preventDefault(); event.stopPropagation(); insertPhotos(files); }
  }, true);
  noteForm.addEventListener("dragover", event => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    noteDocument.classList.add("drag-over");
  });
  noteForm.addEventListener("dragleave", event => {
    if (!noteForm.contains(event.relatedTarget)) noteDocument.classList.remove("drag-over");
  });
  noteForm.addEventListener("drop", event => {
    noteDocument.classList.remove("drag-over");
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    event.stopPropagation();
    const point = document.caretRangeFromPoint(event.clientX,event.clientY);
    if (point && noteBody.contains(point.startContainer)) {
      noteBody.focus({preventScroll:true});
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(point);
    }
    insertPhotos([...event.dataTransfer.files]);
  }, true);
  noteDocument.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || !draft) return;
    const figure = button.closest(".note-photo");
    if (button.matches(".note-photo-remove")) { rich.removePhoto(figure); return; }
    const photo = draft.photos.get(figure.dataset.imageId);
    if (!photo?.loaded) return;
    fullPhoto.alt = photo.name;
    fullPhoto.src = photo.url;
    photoPreview.showModal();
  });
  document.getElementById("photo-close").addEventListener("click", () => photoPreview.close());
  photoPreview.addEventListener("close", () => fullPhoto.removeAttribute("src"));
  function clampWithin(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  function closeTaskMenu(restoreFocus = false) {
    const row = menuRow;
    menuRow = null;
    taskMenu.hidden = true;
    if (restoreFocus && row?.isConnected) row.querySelector(".task").focus({preventScroll: true});
  }

  function openTaskMenu(event, keyboard = false) {
    const row = event.target.closest(".entry");
    if (!row || !records.some(record => record.id === row.dataset.id)) return;
    event.preventDefault();
    showSizeMenu(false);
    menuRow = row;
    taskMenu.hidden = false;
    const rect = row.getBoundingClientRect();
    const menu = taskMenu.getBoundingClientRect();
    const x = keyboard ? rect.left + 8 : event.clientX;
    const y = keyboard ? rect.bottom : event.clientY;
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    taskMenu.style.left = clampWithin(x, 4, width - menu.width - 4) + "px";
    taskMenu.style.top = clampWithin(y + menu.height <= height - 4 ? y : y - menu.height, 4, height - menu.height - 4) + "px";
    menuItems[0].focus({preventScroll: true});
  }

  function noteBounds(row) {
    const cell = row.closest(".day").getBoundingClientRect();
    const frame = panel.getBoundingClientRect();
    const left = Math.max(6, frame.left + 6);
    const right = Math.min(document.documentElement.clientWidth - 6, frame.right - 6);
    const top = Math.max(6, frame.top + 6);
    const bottom = Math.min(document.documentElement.clientHeight - 6, frame.bottom - 6);
    const grid = getComputedStyle(days);
    const width = Math.min(right - left, Math.max(275, cell.width * 3 + 2 * parseFloat(grid.columnGap)));
    const height = Math.min(bottom - top, Math.max(240, cell.height * 3 + 2 * parseFloat(grid.rowGap)));
    const x = cell.left + cell.width / 2 - width / 2;
    const y = cell.top + cell.height / 2 - height / 2;
    return [clampWithin(x,left,right-width),clampWithin(y,top,bottom-height),width,height].map(Math.round);
  }
  function placeInViewport(x,y) {
    const rect=note.getBoundingClientRect();
    note.style.left=clampWithin(x,0,innerWidth-rect.width)+"px";
    note.style.top=clampWithin(y,0,innerHeight-rect.height)+"px";
  }
  function positionNote() {
    if (detachedId) return;
    if (movedNote) { placeInViewport(movedNote.x,movedNote.y); return; }
    if (!noteRow?.isConnected) return;
    const [x,y,w,h]=noteBounds(noteRow);
    note.style.width=w+"px"; note.style.height=h+"px";
    note.style.left=x+"px"; note.style.top=y+"px";
  }

  function openNote(row) {
    if (note.open) { rich.focus(); return; }
    if (!pendingChanges.length) try { records = readRecords(); } catch {}
    const item = records.find(record => record.id === row.dataset.id);
    if (!item || !row.isConnected) return;
    if (isDesktop) {
      host.postMessage(["edit-note",encodeURIComponent(item.id),...noteBounds(row)].join("|"));
      return;
    }
    noteRow=row;
    showNote(item);
  }
  function displayNoteDate(date) {
    const dateLabel = document.getElementById("note-date");
    dateLabel.dateTime=date;
    dateLabel.textContent=new Intl.DateTimeFormat(locale,{dateStyle:"full"}).format(new Date(date+"T12:00:00"));
  }
  function showNote(item) {
    displayNoteDate(item.date);
    noteTitle.value = item.text;
    projects.selectOptions(document.getElementById("note-project"),item.projectId);
    noteTitle.setCustomValidity("");
    fillNoteDocument(item);
    positionNote();
    note.show();
    rich.focus();
  }

  function closeNote() {
    if (draft?.saving) return;
    const row = noteRow;
    noteRow = null;
    movedNote = null;
    note.close();
    resetPhotoDraft();
    if (detachedId) host.postMessage("note-close");
    if (row?.isConnected) row.querySelector(".task").focus({preventScroll: true});
  }

  const noteHeader=note.querySelector(".note-meta");
  let noteGrab=null;
  noteHeader.addEventListener("pointerdown",event=>{
    if (!event.isPrimary || event.button!==0 || event.target.closest("label,button,select")) return;
    event.preventDefault();
    if (detachedId) { host.postMessage("drag=move"); return; }
    const rect=note.getBoundingClientRect();
    noteGrab={id:event.pointerId,x:event.clientX-rect.left,y:event.clientY-rect.top};
    noteHeader.setPointerCapture(event.pointerId);
  });
  noteHeader.addEventListener("pointermove",event=>{
    if (!noteGrab || noteGrab.id!==event.pointerId) return;
    movedNote={x:event.clientX-noteGrab.x,y:event.clientY-noteGrab.y};
    placeInViewport(movedNote.x,movedNote.y);
  });
  noteHeader.addEventListener("lostpointercapture",()=>{noteGrab=null;});

  // All native editors submit through the calendar so simultaneous writes to the
  // one local record list cannot replace independent edits made in another window.
  const noteChannel=isDesktop ? new BroadcastChannel("glass-calendar.note-commits.v1") : null;
  let awaitingCommit=null;
  function syncNoteRow(item,patch) {
    const row=[...days.querySelectorAll(".entry")].find(node=>node.dataset.id===item.id);
    if (!row) return;
    const area=row.querySelector(".task");
    if (Object.hasOwn(patch,"text") && area.value!==item.text) {
      area.value=item.text; fit(area);
      row.querySelector(".check").setAttribute("aria-label",t("check")+" "+item.text);
    }
    if (Object.hasOwn(patch,"projectId")) projects.tagRow(row,item.projectId);
  }
  if (noteChannel) noteChannel.onmessage=({data})=>{
    if (!detachedId && data.kind==="save") {
      let error=null;
      try {
        if (Object.hasOwn(data.patch,"text") && composing.has(document.activeElement) &&
            document.activeElement.closest(".entry")?.dataset.id===data.original.id) throw new Error("noteConflict");
        changeRecord(data.original.id,data.patch,false,data.original);
        syncNoteRow(records.find(item=>item.id===data.original.id),data.patch);
      } catch (ex) { error=ex.message; }
      noteChannel.postMessage({kind:"result",request:data.request,error});
    } else if (data.kind==="result" && awaitingCommit?.id===data.request) {
      const pending=awaitingCommit; awaitingCommit=null;
      if (data.error) pending.reject(new Error(data.error)); else pending.resolve();
    }
  };
  function commitNote(item,patch) {
    if (!detachedId) { changeRecord(item.id,patch,false,item); return; }
    return new Promise((resolve,reject)=>{
      const id=crypto.randomUUID();
      awaitingCommit={id,resolve,reject};
      noteChannel.postMessage({kind:"save",request:id,original:item,patch});
    });
  }

  days.addEventListener("contextmenu", event => openTaskMenu(event, !event.clientX && !event.clientY));
  days.addEventListener("keydown", event => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) openTaskMenu(event, true);
  });
  document.addEventListener("pointerdown", event => {
    if (!taskMenu.hidden && !taskMenu.contains(event.target)) closeTaskMenu();
  });
  window.addEventListener("blur", () => closeTaskMenu());
  document.addEventListener("wheel", event => {
    if (!taskMenu.hidden && !taskMenu.contains(event.target)) closeTaskMenu();
  }, {passive: true});
  taskMenu.addEventListener("keydown", event => {
    const index = menuItems.indexOf(document.activeElement);
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      closeTaskMenu(true);
      return;
    }
    const positions = {ArrowDown: (index + 1) % menuItems.length, ArrowUp: (index - 1 + menuItems.length) % menuItems.length, Home: 0, End: menuItems.length - 1};
    if (Object.hasOwn(positions, event.key)) {
      event.preventDefault();
      menuItems[positions[event.key]].focus({preventScroll: true});
    }
  });
  taskMenu.addEventListener("click", event => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    const row = menuRow;
    if (!action || !row?.isConnected) return;
    closeTaskMenu();
    if (action === "edit") { openNote(row); return; }
    const next = row.nextElementSibling?.querySelector(".task") || row.previousElementSibling?.querySelector(".task") || row.closest(".day").querySelector(".day-number");
    const deleted = changeRecord(row.dataset.id, null);
    void discardUnreferenced(photoRefs(deleted).map(ref => ref.id));
    row.remove();
    next.focus({preventScroll: true});
  });
  noteTitle.addEventListener("input", () => noteTitle.setCustomValidity(""));
  noteForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!draft || draft.saving) return;
    const title = noteTitle.value.trim();
    if (!title) {
      noteTitle.setCustomValidity(t("titleRequired"));
      noteTitle.reportValidity();
      return;
    }
    const item = draft.original;
    const {text, images, styles} = rich.read(draft.photos);
    const patch = {};
    if (item.text !== title) patch.text = title;
    const assigned=document.getElementById("note-project").value;
    if ((item.projectId || "")!==assigned) patch.projectId=assigned;
    if ((item.note || "") !== text) patch.note = text;
    if (JSON.stringify(photoRefs(item)) !== JSON.stringify(images)) patch.noteImages = images;
    if (JSON.stringify(item.noteStyles || []) !== JSON.stringify(styles)) patch.noteStyles = styles;
    const photos = images.map(ref => draft.photos.get(ref.id));
    const additions = photos.filter(photo => photo.file);
    draft.saving = true;
    noteForm.inert = true;
    try {
      if (Object.keys(patch).length) {
        if (photos.length) {
          await Promise.allSettled(photos.map(photo => photo.ready));
          const failed = photos.find(photo => !photo.loaded);
          if (failed) throw new Error(failed.file ? "unsupportedPhoto" : "missingPhoto");
        }
        // Publish metadata only after all original blobs have committed.
        if (additions.length) await writePhotos(additions, []);
        await commitNote(item,patch);
        const retained = new Set(images.map(ref => ref.id));
        const removed = photoRefs(item).filter(ref => !retained.has(ref.id)).map(ref => ref.id);
        await discardUnreferenced(removed);
      }
      if (!detachedId) {
        const latest=records.find(record=>record.id===item.id);
        if (latest) syncNoteRow(latest,patch);
      }
      draft.saving = false;
      closeNote();
    } catch (error) {
      await discardUnreferenced(additions.map(photo => photo.id));
      draft.saving = false;
      noteForm.inert = false;
      noteMessage.textContent = t(["noteConflict","unsupportedPhoto","missingPhoto"].includes(error.message) ? error.message : "photoSaveError");
      noteBody.focus({preventScroll:true});
    }
  });
  document.getElementById("note-cancel").addEventListener("click", closeNote);
  note.addEventListener("cancel", event => { event.preventDefault(); closeNote(); });
  note.addEventListener("keydown", event => {
    if (event.key==="Escape" && !event.isComposing && !photoPreview.open) {
      event.preventDefault(); requestNoteClose(); return;
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      noteForm.requestSubmit();
    }
  });
  function requestNoteClose() {
    if (!draft) { closeNote(); return; }
    if (!draft.saving) {
      const item=draft.original, value=rich.read(draft.photos);
      const dirty=noteTitle.value!==item.text || document.getElementById("note-project").value!==(item.projectId||"") ||
        !sameNote(item,{note:value.text,noteImages:value.images,noteStyles:value.styles});
      if (!dirty || window.confirm(t("discardDraft"))) { closeNote(); return; }
    }
    if (detachedId) host.postMessage("note-keep");
  }

  // A native transparent WebView has no wallpaper pixels to refract. Its static rim
  // is drawn once; browser previews can refract their own wallpaper.
  const followPointer = matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)");
  let glintFrame = 0;
  if (!isDesktop) panel.addEventListener("pointermove", event => {
    if (!followPointer.matches || glintFrame || drag) return;
    glintFrame = requestAnimationFrame(() => {
      glintFrame = 0;
      const frame = panel.getBoundingClientRect();
      panel.style.setProperty("--glint-x", event.clientX - frame.left + "px");
      panel.style.setProperty("--glint-y", event.clientY - frame.top + "px");
    });
  });
  // The map displaces only the backdrop. Text and editable controls stay on a flat layer.
  const svgNS = "http://www.w3.org/2000/svg";
  const lensDefs = document.querySelector("#lens-definitions");
  const lensObserver = new ResizeObserver(entries => {
    for (const {target} of entries) updateLens(target);
  });
  const lensByElement = new Map();
  const lenses = [
    [".refracted-edge", 19, 57], [".month-nav", 9, 24], [".opacity-control", 9, 24],
    ["#settings-toggle", 9, 21], ["#task-menu", 10, 25], ["#task-note", 13, 32], ["#settings-menu", 12, 29]
  ];
  for (const [selector, bevel, bend] of isDesktop ? [] : lenses) {
    const element = document.querySelector(selector);
    const id = "lens-" + lensByElement.size;
    const filter = document.createElementNS(svgNS, "filter");
    filter.id = id;
    filter.setAttribute("color-interpolation-filters", "sRGB");
    for (const [name, value] of Object.entries({x:"0%", y:"0%", width:"100%", height:"100%"})) filter.setAttribute(name, value);
    const texture = document.createElementNS(svgNS, "feImage");
    texture.setAttribute("preserveAspectRatio", "none");
    texture.setAttribute("result", "surface");
    const refraction = document.createElementNS(svgNS, "feDisplacementMap");
    for (const [name, value] of Object.entries({in:"SourceGraphic", in2:"surface", xChannelSelector:"R", yChannelSelector:"G", scale: String(2*bend)})) refraction.setAttribute(name, value);
    filter.append(texture, refraction);
    lensDefs.append(filter);
    lensByElement.set(element, {id, texture, bevel, size:""});
    lensObserver.observe(element);
  }

  function updateLens(element) {
    const lens = lensByElement.get(element);
    const box = element.getBoundingClientRect();
    const width = Math.round(box.width), height = Math.round(box.height);
    const size = width + "x" + height;
    if (!width || !height || lens.size === size) return;
    lens.size = size;
    const radius = Math.min(width/2, height/2, parseFloat(getComputedStyle(element).borderTopLeftRadius) || 20);
    const bevel = Math.min(lens.bevel, radius);
    const resolution = Math.min(1, 1100 / width, 850 / height);
    const map = document.createElement("canvas");
    map.width = Math.max(1, Math.round(width * resolution));
    map.height = Math.max(1, Math.round(height * resolution));
    const ctx = map.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "rgb(128,128,128)";
    ctx.fillRect(0, 0, map.width, map.height);
    const pixels = ctx.getImageData(0, 0, map.width, map.height);
    const sx = width / map.width, sy = height / map.height;
    const sideBand = Math.ceil((radius + bevel + 1) / sx);
    for (let y = 0; y < map.height; y++) {
      const dy = (y + .5) * sy - height / 2;
      const qy = Math.abs(dy) - (height / 2 - radius);
      for (let x = 0; x < map.width; x++) {
        // All interior pixels are neutral, so skip entire spans on a large panel.
        if (x === sideBand && qy < -bevel && 2 * sideBand + 2 < map.width) x = map.width - sideBand - 1;
        const dx = (x + .5) * sx - width / 2;
        const qx = Math.abs(dx) - (width / 2 - radius);
        const rx = Math.max(qx, 0), ry = Math.max(qy, 0);
        const corner = Math.hypot(rx, ry);
        const depth = radius - corner - Math.min(Math.max(qx, qy), 0);
        if (depth < 0 || depth >= bevel) continue;
        const nx = Math.sign(dx) * (corner ? rx / corner : Number(qx >= qy));
        const ny = Math.sign(dy) * (corner ? ry / corner : Number(qy > qx));
        // A curved water surface (refractive index 1.333) bends a grazing ray most.
        const sine = 1 - depth / bevel;
        const angle = Math.asin(sine) - Math.asin(sine / 1.333);
        const travel = Math.tan(angle) / Math.tan(Math.PI/2 - Math.asin(1/1.333));
        const offset = (y * map.width + x) * 4;
        pixels.data[offset] = Math.round(128 - 127 * nx * travel);
        pixels.data[offset + 1] = Math.round(128 - 127 * ny * travel);
      }
    }
    ctx.putImageData(pixels, 0, 0);
    lens.texture.setAttribute("href", map.toDataURL("image/png"));
    element.style.setProperty("--refraction", 'url("#' + lens.id + '")');
  }

  window.addEventListener("resize", () => closeTaskMenu());
  new ResizeObserver(queueLayout).observe(panel);
  window.addEventListener("resize", queueLayout);
  if (isDesktop && !detachedId) {
    const pin = document.getElementById("pin-window");
    host.addEventListener("message", event => {
      if (event.data === "pinned" || event.data === "floating") pin.checked = event.data === "pinned";
    });
    host.postMessage("state");
    pin.addEventListener("change", () => host.postMessage(pin.checked ? "pin" : "float"));
    document.getElementById("quit-app").addEventListener("click", () => host.postMessage("quit"));
    document.addEventListener("pointerdown", event => {
      if (!event.isPrimary || event.button !== 0) return;
      const edge = event.target.closest("[data-edge]");
      const toolbar = event.target.closest(".toolbar");
      if (!edge && (!toolbar || event.target.closest("button,label,input,select,a,#settings-menu,.project-control,nav"))) return;
      host.postMessage(edge ? "drag=" + edge.dataset.edge : "drag=move");
      event.preventDefault();
    });
  }

  // Local in-page integration point. Records and images stay on this device.
  window.CalendarActions = Object.freeze({
    version: 1,
    list: () => structuredClone(exportRecords()),
    add(date, title, projectId = projects.active()) {
      const parsed = new Date(date + "T12:00:00");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(parsed) || dateKey(parsed) !== date) throw new TypeError("Invalid date");
      if (typeof title !== "string" || !title.trim()) throw new TypeError("Missing title");
      const id = crypto.randomUUID();
      if ((projectId || "")!==projects.find(projectId).id) throw new TypeError("Unknown project");
      changeRecord(id, {date, text:title.trim(), done:false, projectId:projectId || ""}, true);
      renderMonth();
      return id;
    },
    update(id, fields) {
      if (!readRecords().some(item => item.id === id)) throw new Error("Unknown task");
      const patch = {};
      if (typeof fields?.text === "string" && fields.text.trim()) patch.text = fields.text.trim();
      if (typeof fields?.done === "boolean") patch.done = fields.done;
      if (Object.hasOwn(fields || {},"projectId")) {
        if ((fields.projectId || "")!==projects.find(fields.projectId).id) throw new TypeError("Unknown project");
        patch.projectId=fields.projectId || "";
      }
      if (!Object.keys(patch).length) throw new TypeError("Supply text or done");
      changeRecord(id, patch);
      renderMonth();
    },
    async remove(id) {
      const removed = changeRecord(id, null);
      if (!removed) return false;
      renderMonth();
      await discardUnreferenced(photoRefs(removed).map(ref => ref.id));
      return true;
    }
  });
  let initialClarity = storedTransparency ?? slider.value;
  try {
    const presetKey = "desktop-calendar-sketch.water-glass-preset.v1";
    if (localStorage.getItem(presetKey) === null) {
      initialClarity = Math.max(Number(initialClarity) || 0, 75);
      localStorage.setItem(transparencyKey, String(initialClarity));
      localStorage.setItem(presetKey, "1");
    }
  } catch {}
  setTransparency(initialClarity, false);
  function openProjectNote(id) {
    if (note.open) { noteBody.focus(); return; }
    if (!pendingChanges.length) try { records=readRecords(); } catch {}
    const record=exportRecords().find(entry=>entry.id===id);
    if (!record) return;
    const [year,number]=record.date.split("-").map(Number);
    month=new Date(year,number-1,1);annual=false;renderMonth();
    const row=[...days.querySelectorAll(".entry")].find(n=>n.dataset.id===id);
    if (row) openNote(row);
  }
  projects.mount(()=>exportRecords(),openProjectNote);
  if (isDesktop) host.addEventListener("message",e=>{
    if (detachedId && e.data==="request-close") requestNoteClose();
    if (!detachedId && typeof e.data==="string" && e.data.startsWith("open-note|")) openProjectNote(e.data.slice(10));
  });
  applySizes();
  displayLanguage();
  if (detachedId) {
    const item=records.find(record=>record.id===detachedId);
    if (item) { showNote(item); host.postMessage("note-ready"); }
    else host.postMessage("note-close");
    window.addEventListener("storage",event=>{
      if (event.key===sizeKey) {
        try {
          const saved=JSON.parse(event.newValue||"{}"), value=saved.noteFont??saved.font;
          document.documentElement.style.setProperty("--task-size",Number.isFinite(value) && value>=11 && value<=32 ? value+"px" : "");
        } catch {}
      }
      if (event.key===languageKey || event.key==="desktop-calendar.projects.v1") {
        if (event.key===languageKey) { locale=event.newValue==="en-US" ? "en-US" : "zh-CN"; displayLanguage(); }
        const select=document.getElementById("note-project");
        projects.selectOptions(select,select.value);
        if (draft) displayNoteDate(draft.original.date);
      }
    });
  }
})();
