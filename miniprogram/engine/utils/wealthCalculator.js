"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCents = toCents;
exports.levelIndexOf = levelIndexOf;
exports.levelByIndex = levelByIndex;
exports.nextLevelOf = nextLevelOf;
exports.buildLevelProgress = buildLevelProgress;
exports.milestonesAhead = milestonesAhead;
exports.monthsToReach = monthsToReach;
exports.splitMonths = splitMonths;
exports.formatDurationCN = formatDurationCN;
exports.isBeyondHorizon = isBeyondHorizon;
exports.addMonthsYM = addMonthsYM;
exports.monthsBetweenYM = monthsBetweenYM;
exports.formatYM = formatYM;
exports.requiredMonthlyCents = requiredMonthlyCents;
exports.formatMoneyCents = formatMoneyCents;
exports.formatIntCNY = formatIntCNY;
exports.formatMoneyShortCents = formatMoneyShortCents;
exports.candidateMilestoneCents = candidateMilestoneCents;
/**
 * 财富 A 级测算：等级判断、升级进度、时间轴、加速器与目标倒推的纯函数集合。
 *
 * 设计要点：
 *  - 零 DOM 依赖，全部金额以「分」的整数参与运算，杜绝浮点误差；
 *  - 纯储蓄模型：每月底固定存入一次，不计投资收益 / 通胀 / 收入变化；
 *  - 升级月数 = ceil((门槛 - 资产) / 月存)，第一笔储蓄发生在起始月的下一个月底，
 *    因此存 m 个月后在「起始月 + m」的月底达标；
 *  - 超过 50 年（600 个月）的预测统一按超出视野处理，不展示具体日期。
 */
const wealthLevels_1 = require("../config/wealthLevels");
const money_1 = require("./money");
/* ---------------- 金额换算 ---------------- */
/** 元 → 分（四舍五入到分）；非法输入返回 null */
function toCents(yuan) {
    if (typeof yuan !== 'number' || !isFinite(yuan))
        return null;
    const cents = Math.round(yuan * wealthLevels_1.CENTS_PER_YUAN);
    return cents >= 0 ? cents : null;
}
/* ---------------- 等级判断 ---------------- */
/** 资产（分）→ 等级序号 1..10；负数按 0 处理（A1） */
function levelIndexOf(assetCents) {
    const cents = assetCents <= 0 ? 0 : assetCents;
    for (let i = wealthLevels_1.WEALTH_LEVELS.length - 1; i >= 0; i--) {
        if (cents >= wealthLevels_1.WEALTH_LEVELS[i].minCents)
            return wealthLevels_1.WEALTH_LEVELS[i].index;
    }
    return 1;
}
function levelByIndex(index) {
    return wealthLevels_1.WEALTH_LEVELS[Math.min(Math.max(index, 1), wealthLevels_1.MAX_LEVEL_INDEX) - 1];
}
/** 下一个未达成等级；A10 返回 null */
function nextLevelOf(assetCents) {
    const idx = levelIndexOf(assetCents);
    return idx >= wealthLevels_1.MAX_LEVEL_INDEX ? null : levelByIndex(idx + 1);
}
/** 当前等级 + 升级进度（按当前等级上下限计算） */
function buildLevelProgress(assetCents) {
    const level = levelByIndex(levelIndexOf(assetCents));
    const next = level.index >= wealthLevels_1.MAX_LEVEL_INDEX ? null : levelByIndex(level.index + 1);
    if (next == null) {
        return { level, next: null, gapCents: 0, progress: null };
    }
    const span = next.minCents - level.minCents;
    const progress = Math.min(Math.max((assetCents - level.minCents) / span, 0), 1);
    return { level, next, gapCents: Math.max(next.minCents - assetCents, 0), progress };
}
/* ---------------- 中间里程碑 ---------------- */
/**
 * 当前等级内、尚未达成的中间里程碑（分，升序）。
 * 只对 A5 及以上（跨度大）的等级提供；里程碑不改变正式 A 级等级。
 */
function milestonesAhead(assetCents, levelIndex) {
    if (levelIndex < wealthLevels_1.MILESTONE_FROM_INDEX)
        return [];
    const level = levelByIndex(levelIndex);
    if (level.maxCents == null)
        return [];
    return wealthLevels_1.MILESTONE_FACTORS
        .map((f) => Math.round(level.maxCents * f / wealthLevels_1.CENTS_PER_YUAN) * wealthLevels_1.CENTS_PER_YUAN)
        .filter((cents) => cents > assetCents && cents < level.maxCents);
}
/* ---------------- 储蓄时间计算 ---------------- */
/**
 * 纯储蓄达标所需月数。
 *  - 已达标 → 0；
 *  - 月存 ≤ 0 或非法 → null（无法通过当前储蓄方式升级）；
 *  - 否则 = ceil((门槛 - 资产) / 月存)。
 */
function monthsToReach(assetCents, monthlyCents, thresholdCents) {
    if (assetCents >= thresholdCents)
        return 0;
    if (typeof monthlyCents !== 'number' || !isFinite(monthlyCents) || monthlyCents <= 0)
        return null;
    return Math.ceil((thresholdCents - assetCents) / monthlyCents);
}
/** 月数 → { years, months }：164 → { 13, 8 } */
function splitMonths(totalMonths) {
    const m = Math.max(Math.round(totalMonths), 0);
    return { years: Math.floor(m / 12), months: m % 12 };
}
/** 时长中文：'13 年 8 个月' / '11 个月' / '0 个月（本月内）' */
function formatDurationCN(totalMonths) {
    const { years, months } = splitMonths(totalMonths);
    if (years === 0 && months === 0)
        return '本月内';
    if (years === 0)
        return `${months} 个月`;
    if (months === 0)
        return `${years} 年`;
    return `${years} 年 ${months} 个月`;
}
/** 超出 50 年预测视野 */
function isBeyondHorizon(totalMonths) {
    return totalMonths > wealthLevels_1.HORIZON_MONTHS;
}
/** 起始年月 + n 个月（n 可为 0） */
function addMonthsYM(from, n) {
    const total = from.year * 12 + (from.month - 1) + Math.max(Math.round(n), 0);
    return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}
/** from → to 之间相隔的自然月数（to 早于 from 返回负数） */
function monthsBetweenYM(from, to) {
    return to.year * 12 + (to.month - 1) - (from.year * 12 + (from.month - 1));
}
/** '2040 年 7 月' */
function formatYM(ym) {
    return `${ym.year} 年 ${ym.month} 月`;
}
/* ---------------- 目标倒推 ---------------- */
/**
 * 指定月数内达标所需的每月储蓄（分）。
 *  - 已达标 → 0；
 *  - months ≤ 0 → null（请重新选择日期）；
 *  - 否则向上取整至元：ceil(差额 / 月数 / 100) × 100。
 */
function requiredMonthlyCents(assetCents, thresholdCents, months) {
    if (assetCents >= thresholdCents)
        return 0;
    const m = Math.round(months);
    if (!isFinite(m) || m <= 0)
        return null;
    const gapCents = thresholdCents - assetCents;
    return Math.ceil(gapCents / m / wealthLevels_1.CENTS_PER_YUAN) * wealthLevels_1.CENTS_PER_YUAN;
}
/* ---------------- 展示格式化 ---------------- */
/** 18 万 → '18 万元'；9,999.99 元 → '9,999.99 元'；1.2 亿 → '1.2 亿元'（金额自动元/万/亿） */
function formatMoneyCents(cents) {
    const yuan = cents / wealthLevels_1.CENTS_PER_YUAN;
    // 尾零裁剪：先取整到分，再按分位/角位是否为 0 决定小数位数
    const trim = (v, unit) => {
        const fen = Math.round(v * 100);
        const digits = fen % 100 === 0 ? 0 : fen % 10 === 0 ? 1 : 2;
        return `${(0, money_1.fmtNum)(fen / 100, digits)} ${unit}`;
    };
    if (yuan < 1e4) {
        const fen = Math.round(yuan * 100);
        const digits = fen % 100 === 0 ? 0 : fen % 10 === 0 ? 1 : 2;
        return `${(0, money_1.fmtNum)(fen / 100, digits)} 元`;
    }
    if (yuan < 1e8) {
        return trim(yuan / 1e4, '万元');
    }
    return trim(yuan / 1e8, '亿元');
}
/** 千分位整数金额（输入用）：'13,667' */
function formatIntCNY(yuan) {
    return (0, money_1.fmtNum)(Math.ceil(yuan), 0);
}
/** 设计稿 fmtShort：18 万 → '18 万'，不幕「元」字（用于徽章/小卡） */
function formatMoneyShortCents(cents) {
    const yuan = cents / wealthLevels_1.CENTS_PER_YUAN;
    const trim = (v, unit) => {
        const fen = Math.round(v * 100);
        const digits = fen % 100 === 0 ? 0 : fen % 10 === 0 ? 1 : 2;
        return `${(0, money_1.fmtNum)(fen / 100, digits)} ${unit}`;
    };
    if (yuan < 1e4) {
        const fen = Math.round(yuan * 100);
        const digits = fen % 100 === 0 ? 0 : fen % 10 === 0 ? 1 : 2;
        return `${(0, money_1.fmtNum)(fen / 100, digits)} 元`;
    }
    if (yuan < 1e8) {
        return trim(yuan / 1e4, '万');
    }
    return trim(yuan / 1e8, '亿');
}
/**
 * 设计稿 candidateMilestones：里程碑卡片条（最多 4 张，首张 featured）。
 * 组成：当前等级内 20%/50%/80% 阶段目标（仅 A5+，未达成的）→ 下一级门槛 → 再往后最多三级门槛。
 * 里程碑不改变正式 A 级等级。
 */
function candidateMilestoneCents(assetCents, levelIndex) {
    if (levelIndex >= wealthLevels_1.MAX_LEVEL_INDEX)
        return [];
    const level = levelByIndex(levelIndex);
    const nextMin = level.maxCents;
    const span = nextMin - level.minCents;
    const all = [];
    if (levelIndex >= 5) {
        for (const ratio of [0.2, 0.5, 0.8]) {
            const t = Math.round((level.minCents + span * ratio) / wealthLevels_1.CENTS_PER_YUAN) * wealthLevels_1.CENTS_PER_YUAN;
            if (t > assetCents && t < nextMin)
                all.push({ cents: t, isRank: false });
        }
    }
    all.push({ cents: nextMin, isRank: true });
    for (let j = levelIndex + 1; j < Math.min(levelIndex + 4, wealthLevels_1.MAX_LEVEL_INDEX); j++) {
        all.push({ cents: levelByIndex(j + 1).minCents, isRank: true });
    }
    return all.slice(0, 4);
}
