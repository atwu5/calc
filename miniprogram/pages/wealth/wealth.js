"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/** 财富 A 级测算（小程序版）：与 docs/wealth.html 设计稿同构——
 * 主舞台（纹章 + 资产/挑战双栏 + XP 条）→ 段位图鉴 → 下一站升级（里程碑卡片条 + 完整路线）→ 策略工坊（加速器/目标倒推）。
 * 计算全部走 engine/utils/wealthCalculator 纯函数（与 Web 版同一套口径，「分」整数运算）。 */
const wealthLevels_1 = require("../../engine/config/wealthLevels");
const wealthCalculator_1 = require("../../engine/utils/wealthCalculator");
const money_1 = require("../../engine/utils/money");
const toolboxStorage_1 = require("../../utils/toolboxStorage");
const PERSIST_KEY = 'wealth.v1';
const EXTRA_CHIPS = [500, 1000, 2000, 3000, 5000];
function parseDraft(raw) {
    const t = String(raw == null ? '' : raw).trim();
    if (!t)
        return null;
    const n = Number(t);
    return isFinite(n) && n >= 0 ? n : null;
}
/** 设计稿 readableMonths：null（月存无效）→ 无法预计；0 → 已达成；>600 → 超过 50 年 */
function readableMonths(months) {
    if (months == null)
        return '无法预计';
    if (months === 0)
        return '已达成';
    if (months > 600)
        return '超过 50 年';
    return (0, wealthCalculator_1.formatDurationCN)(months);
}
function initialData() {
    const now = new Date();
    const thisYear = now.getFullYear();
    const yearLabels = Array.from({ length: 61 }, (_, i) => `${thisYear + i} 年`);
    const monthLabels = Array.from({ length: 12 }, (_, i) => `${i + 1} 月`);
    return {
        scope: '个人',
        unit: 'wan',
        assetDraft: '',
        monthlyDraft: '',
        extraDraft: '0',
        sliderVal: 0,
        extraValueText: '+ 0 元',
        yearLabels,
        monthLabels,
        startYearIdx: 0,
        startMonthIdx: now.getMonth(),
        goalYearIdx: 5,
        goalMonthIdx: now.getMonth(),
        tab: 'boost',
        saveLocal: false,
        routeOpen: false,
        targetOptions: [],
        boostTargetIdx: 0,
        reverseTargetIdx: 0,
        stageVm: null,
        missionVm: null,
        tiles: [],
        milestoneCards: [],
        routePoints: [],
        boostVm: null,
        boostChips: EXTRA_CHIPS.map((v) => ({ label: `+${(0, money_1.fmtNum)(v, 0)}`, value: v, selected: false })),
        reverseVm: null,
        modal: null,
        showRules: false,
    };
}
function persistOf(d, thisYear) {
    return {
        scope: d.scope,
        unit: d.unit,
        assetDraft: d.assetDraft,
        monthlyDraft: d.monthlyDraft,
        extraDraft: d.extraDraft,
        startYear: thisYear + d.startYearIdx,
        startMonth: d.startMonthIdx + 1,
        goalYear: thisYear + Math.max(d.goalYearIdx, 0),
        goalMonth: d.goalMonthIdx + 1,
        boostTargetIdx: d.boostTargetIdx,
        reverseTargetIdx: d.reverseTargetIdx,
        routeOpen: d.routeOpen,
        saveLocal: d.saveLocal,
    };
}
Page({
    data: initialData(),
    onLoad() {
        var _a, _b, _c, _d, _e;
        const saved = (0, toolboxStorage_1.loadStore)(PERSIST_KEY, null);
        if (saved && saved.saveLocal) {
            const d = initialData();
            const thisYear = new Date().getFullYear();
            const inRange = (y) => y != null && y >= thisYear && y < thisYear + d.yearLabels.length ? y - thisYear : null;
            const startYearIdx = (_a = inRange(saved.startYear)) !== null && _a !== void 0 ? _a : 0;
            const goalYearIdx = (_b = inRange(saved.goalYear)) !== null && _b !== void 0 ? _b : 5;
            this.setData({
                scope: saved.scope === '家庭' ? '家庭' : '个人',
                unit: saved.unit === 'yuan' ? 'yuan' : 'wan',
                assetDraft: String((_c = saved.assetDraft) !== null && _c !== void 0 ? _c : ''),
                monthlyDraft: String((_d = saved.monthlyDraft) !== null && _d !== void 0 ? _d : ''),
                extraDraft: String((_e = saved.extraDraft) !== null && _e !== void 0 ? _e : '0'),
                sliderVal: Math.min(Number(saved.extraDraft) || 0, 10000),
                extraValueText: `+ ${(0, money_1.fmtNum)(Number(saved.extraDraft) || 0, 0)} 元`,
                startYearIdx,
                startMonthIdx: saved.startMonth >= 1 && saved.startMonth <= 12 ? saved.startMonth - 1 : d.startMonthIdx,
                goalYearIdx,
                goalMonthIdx: saved.goalMonth >= 1 && saved.goalMonth <= 12 ? saved.goalMonth - 1 : d.goalMonthIdx,
                boostTargetIdx: Math.max(Number(saved.boostTargetIdx) || 0, 0),
                reverseTargetIdx: Math.max(Number(saved.reverseTargetIdx) || 0, 0),
                routeOpen: saved.routeOpen === true,
                saveLocal: true,
            });
        }
        this.recompute();
    },
    persist() {
        if (!this.data.saveLocal)
            return;
        (0, toolboxStorage_1.saveStore)(PERSIST_KEY, persistOf(this.data, new Date().getFullYear()));
    },
    recompute() {
        var _a, _b, _c, _d;
        const d = this.data;
        const now = new Date();
        const thisYear = now.getFullYear();
        const start = { year: thisYear + d.startYearIdx, month: d.startMonthIdx + 1 };
        const assetVal = parseDraft(d.assetDraft);
        const assetYuan = assetVal == null ? null : d.unit === 'wan' ? assetVal * 10000 : assetVal;
        const assetCents = assetYuan == null ? null : (0, wealthCalculator_1.toCents)(assetYuan);
        const monthlyVal = parseDraft(d.monthlyDraft);
        const monthlyCents = monthlyVal == null ? null : (0, wealthCalculator_1.toCents)(monthlyVal);
        const extraVal = (_a = parseDraft(d.extraDraft)) !== null && _a !== void 0 ? _a : 0;
        const extraCents = extraVal > 0 ? (_b = (0, wealthCalculator_1.toCents)(extraVal)) !== null && _b !== void 0 ? _b : 0 : 0;
        const idx = assetCents == null ? -1 : (0, wealthCalculator_1.levelIndexOf)(assetCents);
        const rank = idx - 1; // 0-based，与设计稿一致；-1 = 未输入
        /* ---------- 主舞台 ---------- */
        let stageVm = null;
        if (rank < 0) {
            stageVm = {
                currentAmount: '--',
                scopeShow: `${d.scope}财富档案`,
                classShow: '等待探索',
                crestRank: '?',
                rankTitle: '等待测算',
                rankNote: '输入你的资产，唤醒专属财富徽章',
                gapAmount: '--',
                nextRank: '等待解锁',
                nextTarget: '尚未开启',
                barLabel: '财富成长进度 · 尚未开始',
                barFillStyle: 'width: 0%;',
                barPct: '0%',
                exploreText: '✦ 开启我的财富之旅',
            };
        }
        else {
            const progress = (0, wealthCalculator_1.buildLevelProgress)(assetCents);
            const isTop = rank === wealthLevels_1.MAX_LEVEL_INDEX - 1;
            const target = isTop ? null : wealthLevels_1.WEALTH_LEVELS[rank + 1].minCents;
            const pct = isTop ? 100 : progress.progress * 100;
            stageVm = {
                currentAmount: (0, wealthCalculator_1.formatMoneyCents)(assetCents),
                scopeShow: `${d.scope}财富档案`,
                classShow: wealthLevels_1.RANK_SHORT_LABELS[rank] + '资产',
                crestRank: `A${rank + 1}`,
                rankTitle: wealthLevels_1.RANK_NAMES[rank],
                rankNote: `第 ${rank + 1} 阶 · ${wealthLevels_1.RANK_SHORT_LABELS[rank]}资产`,
                gapAmount: isTop ? 'MAX' : (0, wealthCalculator_1.formatMoneyCents)(Math.max(target - assetCents, 0)),
                nextRank: isTop ? '巅峰已达成' : `下一级 A${rank + 2} · ${wealthLevels_1.RANK_SHORT_LABELS[rank + 1]}`,
                nextTarget: isTop ? '巅峰段位 · 继续积累' : `目标 ${(0, wealthCalculator_1.formatMoneyCents)(target)}`,
                barLabel: isTop ? '最高财富段位已解锁' : `成长进度 · A${rank + 1} → A${rank + 2}`,
                barFillStyle: `width: ${pct}%;`,
                barPct: `${pct.toFixed(2)}%`,
                exploreText: '✦ 更新我的财富段位',
            };
        }
        /* ---------- 段位图鉴 ---------- */
        const tiles = wealthLevels_1.WEALTH_LEVELS.map((lv, i) => {
            const state = rank >= 0 && i < rank ? 'unlocked' : i === rank ? 'active' : 'locked';
            const color = wealthLevels_1.RANK_COLORS[i];
            return {
                code: lv.code,
                numText: String(i + 1),
                smallText: wealthLevels_1.RANK_SHORT_LABELS[i],
                stateIcon: state === 'unlocked' ? '✓' : state === 'active' ? '✦' : '♢',
                cls: state,
                emblemStyle: `background: linear-gradient(155deg, ${color}ba 0%, ${color} 38%, #0f1525 93%);`,
            };
        });
        /* ---------- 目标选项（未达成段位） ---------- */
        const targetOptions = wealthLevels_1.WEALTH_LEVELS.filter((_, i) => rank < 0 || i > rank).map((lv) => `${lv.code} · ${wealthLevels_1.RANK_SHORT_LABELS[lv.index - 1]}（${(0, wealthCalculator_1.formatMoneyShortCents)(lv.minCents)}）`);
        const boostTargetIdx = Math.min(d.boostTargetIdx, Math.max(targetOptions.length - 1, 0));
        const reverseTargetIdx = Math.min(d.reverseTargetIdx, Math.max(targetOptions.length - 1, 0));
        const boostTargetLv = (_c = wealthLevels_1.WEALTH_LEVELS.filter((_, i) => rank < 0 || i > rank)[boostTargetIdx]) !== null && _c !== void 0 ? _c : null;
        const reverseTargetLv = (_d = wealthLevels_1.WEALTH_LEVELS.filter((_, i) => rank < 0 || i > rank)[reverseTargetIdx]) !== null && _d !== void 0 ? _d : null;
        /* ---------- 下一站升级 ---------- */
        const milestoneCards = [];
        const routePoints = [];
        let missionVm = null;
        if (assetCents == null) {
            missionVm = {
                title: '你的下一段冒险，等待开启',
                desc: '先在上方输入可用资产，唤醒你的财富段位。',
            };
        }
        else if (rank === wealthLevels_1.MAX_LEVEL_INDEX - 1) {
            missionVm = {
                title: '恭喜！你已解锁 A10 最高段位',
                desc: '你已抵达财富等级图鉴的巅峰。',
            };
        }
        else {
            const mCents = monthlyCents;
            const need = (target) => (0, wealthCalculator_1.monthsToReach)(assetCents, mCents !== null && mCents !== void 0 ? mCents : 0, target);
            const goal = wealthLevels_1.WEALTH_LEVELS[rank + 1].minCents;
            const n = need(goal);
            missionVm = {
                title: mCents == null
                    ? '设定每月储蓄，开启升级预测'
                    : mCents === 0
                        ? '还需要为冒险积累储蓄'
                        : n != null && n > 600
                            ? '目标很远，但旅程已经开始'
                            : `前往 A${rank + 2} · 预计 ${readableMonths(n)}`,
                desc: `距离下一等级还差 ${(0, wealthCalculator_1.formatMoneyCents)(Math.max(goal - assetCents, 0))}。` +
                    (mCents == null
                        ? '填写每月可存金额，查看成长路线。'
                        : mCents === 0
                            ? '月储蓄为 0，暂时无法预计升级时间。'
                            : n != null && n > 600
                                ? '按当前存钱速度，预计超过 50 年。'
                                : n != null
                                    ? `按每月存入 ${(0, wealthCalculator_1.formatMoneyCents)(mCents)} 计算，预计 ${(0, wealthCalculator_1.formatYM)((0, wealthCalculator_1.addMonthsYM)(start, n))} 达成。`
                                    : ''),
            };
            for (const item of (0, wealthCalculator_1.candidateMilestoneCents)(assetCents, rank + 1)) {
                const months = need(item.cents);
                milestoneCards.push({
                    cap: item.isRank ? `✦ 解锁 A${(0, wealthCalculator_1.levelIndexOf)(item.cents)}` : '◇ 阶段性目标',
                    amount: (0, wealthCalculator_1.formatMoneyShortCents)(item.cents),
                    time: mCents == null ? '等待设置储蓄' : readableMonths(months),
                    cls: milestoneCards.length === 0 ? 'featured' : '',
                });
            }
            for (let i = rank + 1; i <= wealthLevels_1.MAX_LEVEL_INDEX - 1; i++) {
                const lv = wealthLevels_1.WEALTH_LEVELS[i];
                const months = need(lv.minCents);
                routePoints.push({
                    title: `${lv.code} · ${(0, wealthCalculator_1.formatMoneyShortCents)(lv.minCents)}`,
                    time: mCents == null
                        ? '等待设置月储蓄'
                        : `${readableMonths(months)}${months != null && months <= 600 ? ` · ${(0, wealthCalculator_1.formatYM)((0, wealthCalculator_1.addMonthsYM)(start, months))}` : ''}`,
                });
            }
        }
        /* ---------- 策略工坊：加速器 ---------- */
        const boostChips = EXTRA_CHIPS.map((v) => ({ label: `+${(0, money_1.fmtNum)(v, 0)}`, value: v, selected: extraVal === v }));
        let boostVm = null;
        if (assetCents == null || monthlyVal == null) {
            boostVm = {
                metric: '输入资产与月储蓄',
                sub: '设置后查看加速结果',
                baseText: '--',
                boostText: '--',
                foot: '依据纯储蓄模型计算，不包含投资回报。',
            };
        }
        else if (rank === wealthLevels_1.MAX_LEVEL_INDEX - 1) {
            boostVm = {
                metric: '最高段位已解锁',
                sub: '已经到达 A10',
                baseText: '已达成',
                boostText: '已达成',
                foot: '依据纯储蓄模型计算，不包含投资回报。',
            };
        }
        else if (boostTargetLv != null) {
            const target = boostTargetLv.minCents;
            const base = monthlyCents != null && monthlyCents > 0 ? (0, wealthCalculator_1.monthsToReach)(assetCents, monthlyCents, target) : null;
            const fastMonthly = (monthlyCents !== null && monthlyCents !== void 0 ? monthlyCents : 0) + extraCents;
            const boost = fastMonthly > 0 ? (0, wealthCalculator_1.monthsToReach)(assetCents, fastMonthly, target) : null;
            let metric = '';
            if (base == null && boost == null)
                metric = '仍需增加储蓄';
            else if (base == null && boost != null)
                metric = `加速后 ${readableMonths(boost)}`;
            else if (base != null && base > 600 && boost != null && boost <= 600)
                metric = `加速后 ${readableMonths(boost)}`;
            else if (boost == null)
                metric = '暂无可用预测';
            else if (base === boost)
                metric = '目前升级月份不变';
            else
                metric = `预计提前 ${readableMonths(base - boost)}`;
            boostVm = {
                metric,
                sub: `挑战 ${boostTargetLv.code} · ${(0, wealthCalculator_1.formatMoneyCents)(target)}，每月多存 ${(0, wealthCalculator_1.formatMoneyCents)(extraCents)}`,
                baseText: readableMonths(base),
                boostText: readableMonths(boost),
                foot: base != null && boost != null && base <= 600 && boost <= 600
                    ? `预计由 ${(0, wealthCalculator_1.formatYM)((0, wealthCalculator_1.addMonthsYM)(start, base))} 提前至 ${(0, wealthCalculator_1.formatYM)((0, wealthCalculator_1.addMonthsYM)(start, boost))}。`
                    : '长期预测存在较大不确定性，仅供趣味参考。',
            };
        }
        /* ---------- 策略工坊：目标倒推 ---------- */
        let reverseVm = null;
        if (reverseTargetLv != null) {
            const target = reverseTargetLv.minCents;
            const gapCents = Math.max(target - (assetCents !== null && assetCents !== void 0 ? assetCents : 0), 0);
            const goalYM = {
                year: thisYear + Math.max(d.goalYearIdx, 0),
                month: d.goalMonthIdx + 1,
            };
            const n = (goalYM.year - start.year) * 12 + (goalYM.month - start.month);
            const gapZero = assetCents != null && gapCents === 0;
            let metric = '';
            let sub = '';
            if (assetCents == null) {
                metric = '先设置当前资产';
                sub = '你的财富目标计划将展示在这里';
            }
            else if (rank === wealthLevels_1.MAX_LEVEL_INDEX - 1) {
                metric = '最高段位已解锁';
                sub = '你已经站在 A10 之巅';
            }
            else if (gapZero) {
                metric = '目标已经达成';
                sub = '你已拥有达到该等级的资产';
            }
            else if (n <= 0) {
                metric = '请选择未来月份';
                sub = '目标时间应晚于起始月份';
            }
            else {
                const required = (0, wealthCalculator_1.requiredMonthlyCents)(assetCents, target, n);
                if (required == null) {
                    metric = '请选择未来月份';
                    sub = '目标时间应晚于起始月份';
                }
                else {
                    metric = `${(0, wealthCalculator_1.formatMoneyCents)(required)} / 月`;
                    sub = `想在 ${(0, wealthCalculator_1.formatYM)((0, wealthCalculator_1.addMonthsYM)(start, n))} 解锁 ${reverseTargetLv.code}，需要持续储蓄 ${n} 个月。`;
                }
            }
            const requiredForFoot = n > 0 ? (0, wealthCalculator_1.requiredMonthlyCents)(assetCents !== null && assetCents !== void 0 ? assetCents : 0, target, n) : null;
            const foot = monthlyCents == null
                ? '填写当前每月结余，可比较储蓄缺口。'
                : requiredForFoot != null && requiredForFoot <= monthlyCents
                    ? '按当前储蓄速度，预计可以实现目标。'
                    : requiredForFoot != null
                        ? `相比目前每月储蓄，还需要多存 ${(0, wealthCalculator_1.formatMoneyCents)(requiredForFoot - monthlyCents)}。`
                        : '日期按自然月计算。';
            reverseVm = {
                metric,
                sub,
                amountText: (0, wealthCalculator_1.formatMoneyCents)(target),
                gapText: (0, wealthCalculator_1.formatMoneyCents)(gapCents),
                foot,
            };
        }
        this.setData({
            extraValueText: `+ ${(0, money_1.fmtNum)(extraVal, 0)} 元`,
            sliderVal: Math.min(extraVal, 10000),
            boostChips,
            targetOptions,
            boostTargetIdx,
            reverseTargetIdx,
            stageVm,
            missionVm,
            tiles,
            milestoneCards,
            routePoints,
            boostVm,
            reverseVm,
        });
        this.persist();
    },
    onScopePick(e) {
        const i = Number(e.detail.value);
        this.setData({ scope: i === 1 ? '家庭' : '个人' });
        this.recompute();
    },
    onUnitPick(e) {
        const to = Number(e.detail.value) === 1 ? 'yuan' : 'wan';
        if (to === this.data.unit)
            return;
        const v = parseDraft(this.data.assetDraft);
        const converted = v == null ? '' : String(to === 'yuan' ? v * 10000 : v / 10000);
        this.setData({ unit: to, assetDraft: converted });
        this.recompute();
    },
    onAssetInput(e) {
        const cleaned = e.detail.value.replace(/[^\d.]/g, '');
        this.setData({ assetDraft: cleaned });
        this.recompute();
    },
    onMonthlyInput(e) {
        const cleaned = e.detail.value.replace(/[^\d.]/g, '');
        this.setData({ monthlyDraft: cleaned });
        this.recompute();
    },
    onExplore() {
        var _a;
        const a = parseDraft(this.data.assetDraft);
        if (a == null) {
            tt.showToast({ title: '请输入有效的非负资产金额', icon: 'none' });
            return;
        }
        this.recompute();
        const cents = (_a = (0, wealthCalculator_1.toCents)(this.data.unit === 'wan' ? a * 10000 : a)) !== null && _a !== void 0 ? _a : 0;
        const rank = (0, wealthCalculator_1.levelIndexOf)(cents);
        tt.showToast({ title: `恭喜！已解锁 A${rank} · ${wealthLevels_1.RANK_NAMES[rank - 1]}`, icon: 'none' });
    },
    onStartYearPick(e) {
        const i = Number(e.detail.value);
        this.setData({ startYearIdx: i >= 0 && i < this.data.yearLabels.length ? i : this.data.startYearIdx });
        this.recompute();
    },
    onStartMonthPick(e) {
        const i = Number(e.detail.value);
        this.setData({ startMonthIdx: i >= 0 && i < 12 ? i : this.data.startMonthIdx });
        this.recompute();
    },
    onToggleRoute() {
        this.setData({ routeOpen: !this.data.routeOpen });
    },
    onTabTap(e) {
        var _a;
        const v = String((_a = e.currentTarget.dataset.tab) !== null && _a !== void 0 ? _a : 'boost');
        this.setData({ tab: v === 'reverse' ? 'reverse' : 'boost' });
    },
    onBoostTargetPick(e) {
        const i = Number(e.detail.value);
        this.setData({ boostTargetIdx: i >= 0 && i < this.data.targetOptions.length ? i : this.data.boostTargetIdx });
        this.recompute();
    },
    onReverseTargetPick(e) {
        const i = Number(e.detail.value);
        this.setData({ reverseTargetIdx: i >= 0 && i < this.data.targetOptions.length ? i : this.data.reverseTargetIdx });
        this.recompute();
    },
    /** slider 拖动中与松手共用：实时更新结果（与设计稿 range input 行为一致） */
    onSliderInput(e) {
        const v = Math.min(Math.max(Number(e.detail.value) || 0, 0), 10000);
        this.setData({ sliderVal: v, extraDraft: String(v) });
        this.recompute();
    },
    onExtraInput(e) {
        const cleaned = e.detail.value.replace(/[^\d.]/g, '');
        this.setData({ extraDraft: cleaned, sliderVal: Math.min(Number(cleaned) || 0, 10000) });
        this.recompute();
    },
    onChipTap(e) {
        var _a;
        const v = Number((_a = e.currentTarget.dataset.extra) !== null && _a !== void 0 ? _a : 0);
        if (!(v > 0))
            return;
        this.setData({ extraDraft: String(v), sliderVal: Math.min(v, 10000) });
        this.recompute();
    },
    onGoalYearPick(e) {
        const i = Number(e.detail.value);
        this.setData({ goalYearIdx: i >= 0 && i < this.data.yearLabels.length ? i : this.data.goalYearIdx });
        this.recompute();
    },
    onGoalMonthPick(e) {
        const i = Number(e.detail.value);
        this.setData({ goalMonthIdx: i >= 0 && i < 12 ? i : this.data.goalMonthIdx });
        this.recompute();
    },
    /** 设计稿 goalChip：目标日期 = 起始月 + N 年 */
    onGoalQuick(e) {
        var _a;
        const years = Number((_a = e.currentTarget.dataset.years) !== null && _a !== void 0 ? _a : 0);
        if (!(years > 0))
            return;
        const target = (0, wealthCalculator_1.addMonthsYM)({ year: new Date().getFullYear() + this.data.startYearIdx, month: this.data.startMonthIdx + 1 }, years * 12);
        this.setData({
            goalYearIdx: target.year - new Date().getFullYear(),
            goalMonthIdx: target.month - 1,
        });
        this.recompute();
    },
    onTileTap(e) {
        var _a;
        const i = Number((_a = e.currentTarget.dataset.index) !== null && _a !== void 0 ? _a : -1);
        if (!(i >= 0 && i < 10))
            return;
        const d = this.data;
        const a = parseDraft(d.assetDraft);
        const assetCents = a == null ? null : (0, wealthCalculator_1.toCents)(d.unit === 'wan' ? a * 10000 : a);
        const lv = wealthLevels_1.WEALTH_LEVELS[i];
        const req = lv.minCents;
        const next = i < 9 ? wealthLevels_1.WEALTH_LEVELS[i + 1].minCents : null;
        const stateText = assetCents == null
            ? '尚未开始测算'
            : assetCents >= req
                ? '已解锁'
                : `还差 ${(0, wealthCalculator_1.formatMoneyCents)(req - assetCents)} 即可解锁`;
        const lines = [
            `资产门槛：${(0, wealthCalculator_1.formatMoneyCents)(req)}${next != null ? ` 至低于 ${(0, wealthCalculator_1.formatMoneyCents)(next)}` : '及以上'}`,
            `当前状态：${stateText}`,
        ];
        if (assetCents != null && assetCents < req) {
            const m = parseDraft(d.monthlyDraft);
            const monthlyCents = m == null ? null : (0, wealthCalculator_1.toCents)(m);
            const months = monthlyCents != null && monthlyCents > 0
                ? (0, wealthCalculator_1.monthsToReach)(assetCents, monthlyCents, req)
                : null;
            if (months != null) {
                const start = { year: new Date().getFullYear() + d.startYearIdx, month: d.startMonthIdx + 1 };
                lines.push(`按当前储蓄计划：${readableMonths(months)}${months <= 600 ? `，预计 ${(0, wealthCalculator_1.formatYM)((0, wealthCalculator_1.addMonthsYM)(start, months))} 达成` : ''}`);
            }
        }
        lines.push('自定义趣味财富等级，非官方财富标准。');
        this.setData({
            modal: {
                title: `${lv.code} · ${wealthLevels_1.RANK_NAMES[i]}`,
                code: lv.code,
                color: wealthLevels_1.RANK_COLORS[i],
                lines,
            },
        });
    },
    onModalClose() {
        this.setData({ modal: null, showRules: false });
    },
    /** 阻止弹窗内容区点击冒泡到遮罩 */
    noop() {
        // noop
    },
    onRulesOpen() {
        this.setData({ showRules: true });
    },
    onRememberToggle() {
        const next = !this.data.saveLocal;
        this.setData({ saveLocal: next });
        if (next) {
            this.persist();
            tt.showToast({ title: '已启用本机保存', icon: 'none' });
        }
        else {
            (0, toolboxStorage_1.removeStore)(PERSIST_KEY);
            tt.showToast({ title: '已关闭本机保存', icon: 'none' });
        }
    },
    onReset() {
        (0, toolboxStorage_1.removeStore)(PERSIST_KEY);
        this.setData(Object.assign(Object.assign({}, initialData()), { showRules: false, modal: null }));
        tt.showToast({ title: '冒险档案已重置', icon: 'none' });
    },
});
