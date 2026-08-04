(() => {
  "use strict";

  const CONFIG = Object.freeze({
    targetDeficit: 15000,
    dailyAllowance: 1600,
    kcalPerJin: 3000,
    targetJin: 5,
    storageKey: "calorie-deficit-tracker.v1"
  });

  const dom = {};
  let appData = loadData();
  let selectedDate = todayKey();
  let modalDate = selectedDate;
  let selectedCategory = "全部";
  let selectedFood = null;
  let pendingConfirmAction = null;
  let toastTimer = null;

  document.addEventListener("DOMContentLoaded", initialize);

  function initialize() {
    cacheDom();
    bindEvents();
    dom.recordDateInput.max = todayKey();
    dom.recordDateInput.value = selectedDate;
    renderCategoryChips();
    renderFoodChoices();
    updatePackagePreview();
    renderAll();
    updateInstallStatus();
    registerServiceWorker();
  }

  function cacheDom() {
    [
      "remainingDeficit", "completedDeficit", "goalProgressBar", "goalProgressText", "estimatedWeightText",
      "todayLabel", "todayStatus", "todayIntake", "todayDeficit", "todayEmptyNote", "insightText",
      "currentWeightInput", "saveCurrentWeightButton", "currentWeightDisplay", "projectedWeightDisplay",
      "weightStatus", "weightEstimateNote", "quickAddButton", "addTodayFoodButton", "addTodayFoodDetailButton",
      "recordAddButton", "emptyAddButton", "recordDateInput",
      "recordDateFriendly", "previousDayButton", "nextDayButton", "selectedDayIntake", "selectedDayDeficit",
      "dailyTotalCard", "dailyTotalValue", "editDailyTotalButton", "clearDailyTotalButton", "entryCount",
      "foodEntryList", "recordsEmptyState", "foodModal", "modalDateLabel", "closeFoodModal",
      "foodSearchInput", "categoryChips", "commonFoodList", "selectedFoodPanel", "selectedFoodName",
      "selectedFoodReference", "foodQuantityInput", "foodQuantityUnit", "commonCaloriePreview",
      "confirmCommonFoodButton", "packageFoodName", "kilojouleFieldLabel", "kilojouleInput",
      "packageWeightField", "packageWeightInput", "packageCaloriePreview", "confirmPackageFoodButton",
      "dailyCalorieInput", "directIntakeNote", "saveDailyTotalButton",
      "exportButton", "importInput", "resetButton", "installStatusText", "confirmDialog", "confirmTitle",
      "confirmMessage", "confirmCancel", "confirmAccept", "toast"
    ].forEach((id) => { dom[id] = document.getElementById(id); });
    dom.pages = [...document.querySelectorAll(".page")];
    dom.navItems = [...document.querySelectorAll(".nav-item")];
    dom.segments = [...document.querySelectorAll(".segment")];
    dom.entryPanels = [...document.querySelectorAll(".entry-panel")];
    dom.packageModeInputs = [...document.querySelectorAll('input[name="packageMode"]')];
  }

  function bindEvents() {
    dom.navItems.forEach((button) => button.addEventListener("click", () => navigate(button.dataset.target)));
    dom.quickAddButton.addEventListener("click", () => openFoodModal(todayKey(), "direct"));
    dom.addTodayFoodButton.addEventListener("click", () => openFoodModal(todayKey(), "direct"));
    dom.addTodayFoodDetailButton.addEventListener("click", () => openFoodModal(todayKey(), "common"));
    dom.recordAddButton.addEventListener("click", () => openFoodModal(selectedDate, "direct"));
    dom.emptyAddButton.addEventListener("click", () => openFoodModal(selectedDate, "direct"));
    dom.editDailyTotalButton.addEventListener("click", () => openFoodModal(selectedDate, "direct"));
    dom.clearDailyTotalButton.addEventListener("click", confirmClearDailyTotal);
    dom.saveCurrentWeightButton.addEventListener("click", saveCurrentWeight);
    dom.currentWeightInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") saveCurrentWeight();
    });

    dom.previousDayButton.addEventListener("click", () => changeSelectedDate(-1));
    dom.nextDayButton.addEventListener("click", () => changeSelectedDate(1));
    dom.recordDateInput.addEventListener("change", (event) => {
      const value = event.target.value;
      selectedDate = value && value <= todayKey() ? value : todayKey();
      renderRecordsPage();
    });

    dom.closeFoodModal.addEventListener("click", closeFoodModal);
    dom.foodModal.addEventListener("click", (event) => {
      if (event.target === dom.foodModal) closeFoodModal();
    });
    dom.segments.forEach((segment) => segment.addEventListener("click", () => setEntryMode(segment.dataset.entryMode)));
    dom.foodSearchInput.addEventListener("input", renderFoodChoices);
    dom.foodQuantityInput.addEventListener("input", updateCommonPreview);
    dom.confirmCommonFoodButton.addEventListener("click", addCommonFood);
    dom.packageModeInputs.forEach((input) => input.addEventListener("change", updatePackageMode));
    dom.kilojouleInput.addEventListener("input", updatePackagePreview);
    dom.packageWeightInput.addEventListener("input", updatePackagePreview);
    dom.confirmPackageFoodButton.addEventListener("click", addPackageFood);
    dom.saveDailyTotalButton.addEventListener("click", saveDailyTotal);
    dom.dailyCalorieInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") saveDailyTotal();
    });

    dom.exportButton.addEventListener("click", exportData);
    dom.importInput.addEventListener("change", importData);
    dom.resetButton.addEventListener("click", () => openConfirm({
      title: "清空全部记录？",
      message: "该操作会删除当前设备里的体重、饮食与进度数据，且无法撤回。",
      acceptLabel: "全部清空",
      action: () => {
        appData = createEmptyData();
        saveData();
        selectedDate = todayKey();
        renderAll();
        showToast("全部记录已清空");
      }
    }));

    dom.confirmCancel.addEventListener("click", closeConfirm);
    dom.confirmAccept.addEventListener("click", () => {
      const action = pendingConfirmAction;
      closeConfirm();
      if (action) action();
    });
    dom.confirmDialog.addEventListener("click", (event) => {
      if (event.target === dom.confirmDialog) closeConfirm();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (dom.confirmDialog.classList.contains("is-open")) closeConfirm();
      else if (dom.foodModal.classList.contains("is-open")) closeFoodModal();
    });
  }

  function renderAll() {
    renderDashboard();
    renderRecordsPage();
  }

  function renderDashboard() {
    const stats = calculateOverallStats();
    const todayIntake = calculateDayIntake(todayKey());
    const todayDeficit = calculateDayDeficit(todayKey());
    const completionForDisplay = Math.max(0, stats.completed);

    dom.remainingDeficit.textContent = formatNumber(stats.remaining);
    dom.completedDeficit.textContent = formatSignedNumber(stats.completed);
    dom.goalProgressBar.style.width = `${stats.progress}%`;
    dom.goalProgressText.textContent = `已完成 ${formatDecimal(stats.progress, 1)}%`;
    dom.estimatedWeightText.textContent = `预计已减 ${formatDecimal(completionForDisplay / CONFIG.kcalPerJin, 1)}斤`;
    dom.todayLabel.textContent = friendlyDate(todayKey());
    dom.todayIntake.textContent = formatNumber(todayIntake);

    const resultBox = dom.todayDeficit.closest(".equation-result");
    resultBox.classList.remove("is-negative");
    dom.todayStatus.classList.remove("is-positive", "is-negative");
    if (todayDeficit === null) {
      dom.todayDeficit.textContent = "—";
      dom.todayStatus.textContent = "等待记录";
      dom.todayEmptyNote.hidden = false;
    } else {
      dom.todayDeficit.textContent = formatSignedNumber(todayDeficit);
      dom.todayEmptyNote.hidden = true;
      if (todayDeficit >= 0) {
        dom.todayStatus.textContent = `缺口 +${formatNumber(todayDeficit)}`;
        dom.todayStatus.classList.add("is-positive");
      } else {
        dom.todayStatus.textContent = `超出 ${formatNumber(Math.abs(todayDeficit))}`;
        dom.todayStatus.classList.add("is-negative");
        resultBox.classList.add("is-negative");
      }
    }

    dom.insightText.textContent = buildInsight(stats);
    renderWeightEstimate(stats);
  }

  function renderWeightEstimate(stats) {
    const profile = appData.profile || {};
    const currentWeight = Number(profile.currentWeightJin);
    if (!Number.isFinite(currentWeight) || currentWeight <= 0) {
      if (document.activeElement !== dom.currentWeightInput) dom.currentWeightInput.value = "";
      dom.currentWeightDisplay.textContent = "—";
      dom.projectedWeightDisplay.textContent = "—";
      dom.weightStatus.textContent = "尚未录入";
      dom.weightStatus.classList.remove("is-positive");
      dom.weightEstimateNote.textContent = "录入现在体重后，将从这一刻起按“每完成3000大卡缺口预计减1斤”推算。";
      return;
    }

    const baseline = Number(profile.baselineCompletedDeficit) || 0;
    const changeInDeficit = stats.completed - baseline;
    const projectedWeight = currentWeight - changeInDeficit / CONFIG.kcalPerJin;
    dom.currentWeightInput.value = formatInputNumber(currentWeight);
    dom.currentWeightDisplay.textContent = `${formatDecimal(currentWeight, 1)}斤`;
    dom.projectedWeightDisplay.textContent = `${formatDecimal(projectedWeight, 1)}斤`;
    dom.weightStatus.textContent = "已开始预估";
    dom.weightStatus.classList.add("is-positive");
    dom.weightEstimateNote.textContent = `从最近保存体重时起，热量缺口变化 ${formatSignedNumber(changeInDeficit)} 大卡，预估体重变化 ${formatSignedDecimal(-changeInDeficit / CONFIG.kcalPerJin, 1)}斤。`;
  }

  function renderRecordsPage() {
    if (selectedDate > todayKey()) selectedDate = todayKey();
    dom.recordDateInput.value = selectedDate;
    dom.recordDateFriendly.textContent = friendlyDate(selectedDate);
    dom.nextDayButton.disabled = selectedDate >= todayKey();
    dom.nextDayButton.style.opacity = selectedDate >= todayKey() ? ".35" : "1";

    const entries = getEntries(selectedDate);
    const intake = calculateDayIntake(selectedDate);
    const deficit = calculateDayDeficit(selectedDate);
    const hasDirectTotal = hasDailyTotal(selectedDate);
    dom.selectedDayIntake.textContent = formatNumber(intake);
    dom.selectedDayDeficit.textContent = deficit === null
      ? "未记录"
      : `${deficit >= 0 ? "+" : ""}${formatNumber(deficit)} 大卡`;
    dom.selectedDayDeficit.style.color = deficit !== null && deficit < 0 ? "#ffc3bc" : "white";
    dom.entryCount.textContent = `${entries.length} 项`;
    dom.dailyTotalCard.hidden = !hasDirectTotal;
    dom.dailyTotalValue.textContent = hasDirectTotal ? formatNumber(appData.dailyTotals[selectedDate]) : "0";
    dom.recordsEmptyState.hidden = entries.length > 0 || hasDirectTotal;
    dom.foodEntryList.hidden = entries.length === 0;
    renderEntryList(entries);
  }

  function renderEntryList(entries) {
    dom.foodEntryList.replaceChildren();
    entries
      .slice()
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .forEach((entry) => {
        const item = document.createElement("article");
        item.className = "food-entry-item";

        const symbol = document.createElement("div");
        symbol.className = "food-entry-symbol";
        symbol.textContent = (entry.name || "食").slice(0, 1);

        const main = document.createElement("div");
        main.className = "food-entry-main";
        const name = document.createElement("strong");
        name.textContent = entry.name;
        const detail = document.createElement("span");
        detail.textContent = buildEntryDetail(entry);
        main.append(name, detail);

        const calories = document.createElement("div");
        calories.className = "food-entry-kcal";
        const kcalNumber = document.createElement("strong");
        kcalNumber.textContent = formatNumber(entry.kcal);
        const kcalUnit = document.createElement("span");
        kcalUnit.textContent = "大卡";
        calories.append(kcalNumber, kcalUnit);

        const remove = document.createElement("button");
        remove.className = "delete-entry";
        remove.type = "button";
        remove.textContent = "删除";
        remove.setAttribute("aria-label", `删除 ${entry.name}`);
        remove.addEventListener("click", () => confirmDeleteEntry(entry));

        item.append(symbol, main, calories, remove);
        dom.foodEntryList.append(item);
      });
  }

  function renderCategoryChips() {
    dom.categoryChips.replaceChildren();
    window.FOOD_CATEGORIES.forEach((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `category-chip${category === selectedCategory ? " is-active" : ""}`;
      button.textContent = category;
      button.addEventListener("click", () => {
        selectedCategory = category;
        renderCategoryChips();
        renderFoodChoices();
      });
      dom.categoryChips.append(button);
    });
  }

  function renderFoodChoices() {
    const query = normalizeSearch(dom.foodSearchInput ? dom.foodSearchInput.value : "");
    const matches = window.FOOD_DATABASE.filter((food) => {
      const inCategory = selectedCategory === "全部" || food.category === selectedCategory;
      const searchable = normalizeSearch(`${food.name} ${food.category}`);
      return inCategory && searchable.includes(query);
    });

    dom.commonFoodList.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "food-list-empty";
      empty.textContent = "没有找到，试试包装千焦录入。";
      dom.commonFoodList.append(empty);
      return;
    }

    matches.forEach((food) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `food-choice${selectedFood === food ? " is-selected" : ""}`;
      const copy = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = food.name;
      const reference = document.createElement("span");
      reference.textContent = `${food.category} · 建议录入 ${food.serving}${food.unit}`;
      copy.append(name, reference);
      const kcal = document.createElement("em");
      kcal.textContent = `${food.kcal} 大卡/100${food.unit}`;
      button.append(copy, kcal);
      button.addEventListener("click", () => selectCommonFood(food));
      dom.commonFoodList.append(button);
    });
  }

  function selectCommonFood(food) {
    selectedFood = food;
    dom.selectedFoodName.textContent = food.name;
    dom.selectedFoodReference.textContent = `${food.kcal} 大卡 / 100${food.unit}`;
    dom.foodQuantityInput.value = food.serving;
    dom.foodQuantityUnit.textContent = food.unit;
    dom.selectedFoodPanel.hidden = false;
    renderFoodChoices();
    updateCommonPreview();
    requestAnimationFrame(() => dom.selectedFoodPanel.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function updateCommonPreview() {
    const quantity = positiveNumber(dom.foodQuantityInput.value);
    const calories = selectedFood && quantity ? selectedFood.kcal * quantity / 100 : 0;
    dom.commonCaloriePreview.textContent = formatNumber(calories);
  }

  function addCommonFood() {
    const quantity = positiveNumber(dom.foodQuantityInput.value);
    if (!selectedFood) return showToast("请先选择一种食物");
    if (!quantity) return showToast("请输入本次食用量");
    const calories = selectedFood.kcal * quantity / 100;
    addEntry(modalDate, {
      id: createId(),
      name: selectedFood.name,
      kcal: round2(calories),
      source: "common",
      category: selectedFood.category,
      amount: quantity,
      unit: selectedFood.unit,
      kcalPer100: selectedFood.kcal,
      createdAt: new Date().toISOString()
    });
    closeFoodModal();
    renderAll();
    showToast(hasDailyTotal(modalDate)
      ? `已保存 ${selectedFood.name}；当天仍按全天总数计算`
      : `已加入 ${selectedFood.name} · ${formatNumber(calories)} 大卡`);
  }

  function updatePackageMode() {
    const mode = getPackageMode();
    const per100 = mode === "per100";
    dom.kilojouleFieldLabel.textContent = per100 ? "每 100克千焦" : "本次总千焦";
    dom.packageWeightField.hidden = !per100;
    updatePackagePreview();
  }

  function updatePackagePreview() {
    if (!dom.kilojouleInput) return;
    const kj = positiveNumber(dom.kilojouleInput.value);
    const weight = positiveNumber(dom.packageWeightInput.value);
    const totalKj = getPackageMode() === "per100" ? (kj && weight ? kj * weight / 100 : 0) : kj;
    dom.packageCaloriePreview.textContent = formatNumber(totalKj ? totalKj / 4.184 : 0);
  }

  function addPackageFood() {
    const name = dom.packageFoodName.value.trim();
    const kj = positiveNumber(dom.kilojouleInput.value);
    const mode = getPackageMode();
    const weight = positiveNumber(dom.packageWeightInput.value);
    if (!name) return showToast("请填写食物名称");
    if (!kj) return showToast("请输入包装上的千焦数值");
    if (mode === "per100" && !weight) return showToast("请输入本次实际食用克数");

    const totalKj = mode === "per100" ? kj * weight / 100 : kj;
    const calories = totalKj / 4.184;
    addEntry(modalDate, {
      id: createId(),
      name,
      kcal: round2(calories),
      source: "package",
      packageMode: mode,
      kilojoules: kj,
      totalKilojoules: round2(totalKj),
      amount: mode === "per100" ? weight : null,
      unit: mode === "per100" ? "克" : null,
      createdAt: new Date().toISOString()
    });
    closeFoodModal();
    renderAll();
    showToast(hasDailyTotal(modalDate)
      ? `已保存 ${name}；当天仍按全天总数计算`
      : `已换算 ${formatNumber(totalKj)} 千焦 = ${formatNumber(calories)} 大卡`);
  }

  function saveDailyTotal() {
    const calories = nonNegativeNumber(dom.dailyCalorieInput.value);
    if (calories === null) return showToast("请输入0或更大的大卡数");
    if (calories > 20000) return showToast("单日总摄入不能超过20,000大卡");
    appData.dailyTotals[modalDate] = round2(calories);
    saveData();
    closeFoodModal();
    renderAll();
    showToast(`已按全天 ${formatNumber(calories)} 大卡计算`);
  }

  function saveCurrentWeight() {
    const weight = positiveNumber(dom.currentWeightInput.value);
    if (!weight) return showToast("请输入现在体重");
    if (weight > 1000) return showToast("请输入1000斤以内的体重");
    const stats = calculateOverallStats();
    appData.profile = {
      currentWeightJin: round2(weight),
      baselineCompletedDeficit: stats.completed,
      recordedAt: new Date().toISOString()
    };
    saveData();
    renderAll();
    showToast(`已保存现在体重 ${formatDecimal(weight, 1)}斤`);
  }

  function addEntry(dateKey, entry) {
    if (!appData.records[dateKey]) appData.records[dateKey] = [];
    appData.records[dateKey].push(entry);
    saveData();
  }

  function confirmDeleteEntry(entry) {
    openConfirm({
      title: `删除“${entry.name}”？`,
      message: `删除后，这一天的摄入与热量缺口会立即重新计算。`,
      acceptLabel: "删除",
      action: () => {
        const entries = getEntries(selectedDate).filter((item) => item.id !== entry.id);
        if (entries.length) appData.records[selectedDate] = entries;
        else delete appData.records[selectedDate];
        saveData();
        renderAll();
        showToast("记录已删除");
      }
    });
  }

  function confirmClearDailyTotal() {
    if (!hasDailyTotal(selectedDate)) return;
    openConfirm({
      title: "取消全天总大卡？",
      message: getEntries(selectedDate).length
        ? "取消后，这一天会恢复按现有食物明细合计。"
        : "取消后，这一天将变为未记录。",
      acceptLabel: "确认取消",
      action: () => {
        delete appData.dailyTotals[selectedDate];
        saveData();
        renderAll();
        showToast("已取消全天总大卡");
      }
    });
  }

  function openFoodModal(dateKey, mode = "direct") {
    modalDate = dateKey && dateKey <= todayKey() ? dateKey : todayKey();
    selectedFood = null;
    selectedCategory = "全部";
    dom.modalDateLabel.textContent = `记录到${friendlyDate(modalDate)}`;
    dom.foodSearchInput.value = "";
    dom.selectedFoodPanel.hidden = true;
    dom.packageFoodName.value = "";
    dom.kilojouleInput.value = "";
    dom.packageWeightInput.value = "";
    dom.packageModeInputs[0].checked = true;
    dom.dailyCalorieInput.value = hasDailyTotal(modalDate) ? formatInputNumber(appData.dailyTotals[modalDate]) : "";
    dom.directIntakeNote.textContent = getEntries(modalDate).length
      ? "保存后，将以这个全天总数为准，现有食物明细会保留但不重复计算。"
      : "保存后，将直接用该数值计算当日缺口。";
    setEntryMode(mode);
    updatePackageMode();
    renderCategoryChips();
    renderFoodChoices();
    dom.foodModal.classList.add("is-open");
    dom.foodModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    window.setTimeout(() => {
      if (mode === "direct") dom.dailyCalorieInput.focus();
      else if (mode === "common") dom.foodSearchInput.focus();
    }, 250);
  }

  function closeFoodModal() {
    dom.foodModal.classList.remove("is-open");
    dom.foodModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function setEntryMode(mode) {
    dom.segments.forEach((segment) => segment.classList.toggle("is-active", segment.dataset.entryMode === mode));
    dom.entryPanels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.entryPanel === mode));
    if (mode === "direct") dom.dailyCalorieInput.focus({ preventScroll: true });
  }

  function navigate(target) {
    dom.pages.forEach((page) => page.classList.toggle("is-active", page.dataset.page === target));
    dom.navItems.forEach((item) => item.classList.toggle("is-active", item.dataset.target === target));
    if (target === "records") renderRecordsPage();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function changeSelectedDate(offset) {
    const candidate = addDays(selectedDate, offset);
    selectedDate = candidate > todayKey() ? todayKey() : candidate;
    renderRecordsPage();
  }

  function calculateOverallStats() {
    const dateKeys = new Set([...Object.keys(appData.records), ...Object.keys(appData.dailyTotals)]);
    const activeDays = [...dateKeys].filter((dateKey) => hasDayRecord(dateKey));
    const completed = round2(activeDays.reduce((sum, dateKey) => sum + CONFIG.dailyAllowance - calculateDayIntake(dateKey), 0));
    const remaining = round2(Math.max(0, CONFIG.targetDeficit - completed));
    const progress = Math.min(100, Math.max(0, completed / CONFIG.targetDeficit * 100));
    return { completed, remaining, progress, activeDays: activeDays.length };
  }

  function calculateDayIntake(dateKey) {
    if (hasDailyTotal(dateKey)) return round2(Number(appData.dailyTotals[dateKey]));
    return round2(getEntries(dateKey).reduce((sum, entry) => sum + (Number(entry.kcal) || 0), 0));
  }

  function calculateDayDeficit(dateKey) {
    return hasDayRecord(dateKey) ? round2(CONFIG.dailyAllowance - calculateDayIntake(dateKey)) : null;
  }

  function buildInsight(stats) {
    if (!stats.activeDays) return "直接记录当天总大卡后，累计缺口和剩余目标会自动更新。";
    if (stats.completed >= CONFIG.targetDeficit) return "你已按本计划公式完成 15,000 大卡累计缺口。继续记录，可留存完整饮食轨迹。";
    const average = stats.completed / stats.activeDays;
    if (average <= 0) return `已记录 ${stats.activeDays} 天，目前累计缺口尚未增加。可先观察饮食记录，再调整接下来的安排。`;
    const estimatedDays = Math.ceil(stats.remaining / average);
    return `已记录 ${stats.activeDays} 天，平均每天完成 ${formatNumber(average)} 大卡缺口；按当前记录节奏，约还需 ${estimatedDays} 个记录日。`;
  }

  function buildEntryDetail(entry) {
    if (entry.source === "common") {
      return `${formatDecimal(entry.amount, 1)}${entry.unit || "克"} · 参考 ${entry.kcalPer100} 大卡/100${entry.unit || "克"}`;
    }
    if (entry.packageMode === "per100") {
      return `${formatDecimal(entry.amount, 1)}克 · ${formatDecimal(entry.kilojoules, 1)} 千焦/100克`;
    }
    return `包装换算 · 本次 ${formatDecimal(entry.totalKilojoules || entry.kilojoules, 1)} 千焦`;
  }

  function openConfirm({ title, message, acceptLabel, action }) {
    dom.confirmTitle.textContent = title;
    dom.confirmMessage.textContent = message;
    dom.confirmAccept.textContent = acceptLabel || "确认";
    pendingConfirmAction = action;
    dom.confirmDialog.classList.add("is-open");
    dom.confirmDialog.setAttribute("aria-hidden", "false");
  }

  function closeConfirm() {
    dom.confirmDialog.classList.remove("is-open");
    dom.confirmDialog.setAttribute("aria-hidden", "true");
    pendingConfirmAction = null;
  }

  function exportData() {
    const payload = {
      app: "缺口计划",
      exportedAt: new Date().toISOString(),
      rules: CONFIG,
      data: appData
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `缺口计划备份-${todayKey()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("备份文件已生成");
  }

  function importData(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const normalized = normalizeImportedData(parsed.data || parsed);
        openConfirm({
          title: "导入这份备份？",
          message: "导入会替换当前设备已有的全部记录。",
          acceptLabel: "确认导入",
          action: () => {
            appData = normalized;
            saveData();
            renderAll();
            showToast("备份已导入");
          }
        });
      } catch (error) {
        showToast("备份文件无法识别");
      }
    };
    reader.onerror = () => showToast("读取备份失败");
    reader.readAsText(file);
  }

  function normalizeImportedData(input) {
    if (!input || typeof input !== "object" || !input.records || typeof input.records !== "object") {
      throw new Error("Invalid backup");
    }
    const records = {};
    Object.entries(input.records).forEach(([dateKey, entries]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !Array.isArray(entries)) throw new Error("Invalid record date");
      const cleanEntries = entries.map((entry) => {
        if (!entry || typeof entry.name !== "string" || !Number.isFinite(Number(entry.kcal)) || Number(entry.kcal) < 0) {
          throw new Error("Invalid entry");
        }
        return {
          ...entry,
          id: typeof entry.id === "string" ? entry.id : createId(),
          name: entry.name.slice(0, 80),
          kcal: round2(Number(entry.kcal))
        };
      });
      if (cleanEntries.length) records[dateKey] = cleanEntries;
    });
    const dailyTotals = {};
    if (input.dailyTotals && typeof input.dailyTotals === "object") {
      Object.entries(input.dailyTotals).forEach(([dateKey, calories]) => {
        const number = Number(calories);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !Number.isFinite(number) || number < 0 || number > 20000) {
          throw new Error("Invalid daily total");
        }
        dailyTotals[dateKey] = round2(number);
      });
    }

    const profile = {};
    if (input.profile && typeof input.profile === "object") {
      const weight = Number(input.profile.currentWeightJin);
      const baseline = Number(input.profile.baselineCompletedDeficit);
      if (Number.isFinite(weight) && weight > 0 && weight <= 1000) {
        profile.currentWeightJin = round2(weight);
        profile.baselineCompletedDeficit = Number.isFinite(baseline) ? round2(baseline) : 0;
        profile.recordedAt = typeof input.profile.recordedAt === "string" ? input.profile.recordedAt : "";
      }
    }
    return { version: 2, records, dailyTotals, profile };
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) return createEmptyData();
      return normalizeImportedData(JSON.parse(raw));
    } catch (error) {
      return createEmptyData();
    }
  }

  function createEmptyData() {
    return { version: 2, records: {}, dailyTotals: {}, profile: {} };
  }

  function saveData() {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(appData));
  }

  function getEntries(dateKey) {
    return Array.isArray(appData.records[dateKey]) ? appData.records[dateKey] : [];
  }

  function hasDailyTotal(dateKey) {
    return Object.prototype.hasOwnProperty.call(appData.dailyTotals, dateKey)
      && Number.isFinite(Number(appData.dailyTotals[dateKey]))
      && Number(appData.dailyTotals[dateKey]) >= 0;
  }

  function hasDayRecord(dateKey) {
    return hasDailyTotal(dateKey) || getEntries(dateKey).length > 0;
  }

  function getPackageMode() {
    const selected = dom.packageModeInputs && dom.packageModeInputs.find((input) => input.checked);
    return selected ? selected.value : "total";
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => dom.toast.classList.remove("is-visible"), 2600);
  }

  function updateInstallStatus() {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (standalone) dom.installStatusText.textContent = "已从主屏幕打开。你的饮食记录会继续保存在此设备。";
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  function friendlyDate(dateKey) {
    const today = todayKey();
    if (dateKey === today) return "今天";
    if (dateKey === addDays(today, -1)) return "昨天";
    const date = parseDate(dateKey);
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return `${date.getMonth() + 1}月${date.getDate()}日 · ${weekdays[date.getDay()]}`;
  }

  function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function addDays(dateKey, days) {
    const date = parseDate(dateKey);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseDate(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  function normalizeSearch(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, "");
  }

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function nonNegativeNumber(value) {
    if (String(value).trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function formatNumber(value) {
    const rounded = Math.round(Number(value) || 0);
    return new Intl.NumberFormat("zh-CN").format(rounded);
  }

  function formatSignedNumber(value) {
    const number = Number(value) || 0;
    return `${number > 0 ? "+" : ""}${formatNumber(number)}`;
  }

  function formatDecimal(value, digits) {
    const number = Number(value) || 0;
    return number.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function formatSignedDecimal(value, digits) {
    const number = Number(value) || 0;
    return `${number > 0 ? "+" : ""}${formatDecimal(number, digits)}`;
  }

  function formatInputNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return String(round2(number));
  }

  function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function pad(number) {
    return String(number).padStart(2, "0");
  }
})();
