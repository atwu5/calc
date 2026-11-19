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
import {
  CENTS_PER_YUAN,
  HORIZON_MONTHS,
  MAX_LEVEL_INDEX,
  MILESTONE_FACTORS,
  MILESTONE_FROM_INDEX,
  WEALTH_LEVELS,
  type WealthLevel,
} from '../config/wealthLevels'
import { fmtNum } from './money'

/* ---------------- 金额换算 ---------------- */

/** 元 → 分（四舍五入到分）；非法输入返回 null */
export function toCents(yuan: number): number | null {
  if (typeof yuan !== 'number' || !isFinite(yuan)) return null
  const cents = Math.round(yuan * CENTS_PER_YUAN)
  return cents >= 0 ? cents : null
}

/* ---------------- 等级判断 ---------------- */

/** 资产（分）→ 等级序号 1..10；负数按 0 处理（A1） */
export function levelIndexOf(assetCents: number): number {
  const cents = assetCents <= 0 ? 0 : assetCents
  for (let i = WEALTH_LEVELS.length - 1; i >= 0; i--) {
    if (cents >= WEALTH_LEVELS[i].minCents) return WEALTH_LEVELS[i].index
  }
  return 1
}

export function levelByIndex(index: number): WealthLevel {
  return WEALTH_LEVELS[Math.min(Math.max(index, 1), MAX_LEVEL_INDEX) - 1]
}

/** 下一个未达成等级；A10 返回 null */
export function nextLevelOf(assetCents: number): WealthLevel | null {
  const idx = levelIndexOf(assetCents)
  return idx >= MAX_LEVEL_INDEX ? null : levelByIndex(idx + 1)
}

export interface LevelProgress {
  /** 当前等级 */
  level: WealthLevel
  /** 下一等级；A10 为 null */
  next: WealthLevel | null
  /** 距下一级门槛差额（分）；A10 为 0 */
  gapCents: number
  /** 当前等级内进度 0..1；A10 为 null */
  progress: number | null
}

/** 当前等级 + 升级进度（按当前等级上下限计算） */
export function buildLevelProgress(assetCents: number): LevelProgress {
  const level = levelByIndex(levelIndexOf(assetCents))
  const next = level.index >= MAX_LEVEL_INDEX ? null : levelByIndex(level.index + 1)
  if (next == null) {
    return { level, next: null, gapCents: 0, progress: null }
  }
  const span = (next.minCents as number) - level.minCents
  const progress = Math.min(Math.max((assetCents - level.minCents) / span, 0), 1)
  return { level, next, gapCents: Math.max((next.minCents as number) - assetCents, 0), progress }
}

/* ---------------- 中间里程碑 ---------------- */

/**
 * 当前等级内、尚未达成的中间里程碑（分，升序）。
 * 只对 A5 及以上（跨度大）的等级提供；里程碑不改变正式 A 级等级。
 */
export function milestonesAhead(assetCents: number, levelIndex: number): number[] {
  if (levelIndex < MILESTONE_FROM_INDEX) return []
  const level = levelByIndex(levelIndex)
  if (level.maxCents == null) return []
  return MILESTONE_FACTORS
    .map((f) => Math.round((level.maxCents as number) * f / CENTS_PER_YUAN) * CENTS_PER_YUAN)
    .filter((cents) => cents > assetCents && cents < (level.maxCents as number))
}

/* ---------------- 储蓄时间计算 ---------------- */

/**
 * 纯储蓄达标所需月数。
 *  - 已达标 → 0；
 *  - 月存 ≤ 0 或非法 → null（无法通过当前储蓄方式升级）；
 *  - 否则 = ceil((门槛 - 资产) / 月存)。
 */
export function monthsToReach(assetCents: number, monthlyCents: number, thresholdCents: number): number | null {
  if (assetCents >= thresholdCents) return 0
  if (typeof monthlyCents !== 'number' || !isFinite(monthlyCents) || monthlyCents <= 0) return null
  return Math.ceil((thresholdCents - assetCents) / monthlyCents)
}

export interface Duration {
  years: number
  months: number
}

/** 月数 → { years, months }：164 → { 13, 8 } */
export function splitMonths(totalMonths: number): Duration {
  const m = Math.max(Math.round(totalMonths), 0)
  return { years: Math.floor(m / 12), months: m % 12 }
}

/** 时长中文：'13 年 8 个月' / '11 个月' / '0 个月（本月内）' */
export function formatDurationCN(totalMonths: number): string {
  const { years, months } = splitMonths(totalMonths)
  if (years === 0 && months === 0) return '本月内'
  if (years === 0) return `${months} 个月`
  if (months === 0) return `${years} 年`
  return `${years} 年 ${months} 个月`
}

/** 超出 50 年预测视野 */
export function isBeyondHorizon(totalMonths: number): boolean {
  return totalMonths > HORIZON_MONTHS
}

/* ---------------- 年月运算（自然月，无时区成分） ---------------- */

export interface YM {
  year: number
  month: number // 1..12
}

/** 起始年月 + n 个月（n 可为 0） */
export function addMonthsYM(from: YM, n: number): YM {
  const total = from.year * 12 + (from.month - 1) + Math.max(Math.round(n), 0)
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

/** from → to 之间相隔的自然月数（to 早于 from 返回负数） */
export function monthsBetweenYM(from: YM, to: YM): number {
  return to.year * 12 + (to.month - 1) - (from.year * 12 + (from.month - 1))
}

/** '2040 年 7 月' */
export function formatYM(ym: YM): string {
  return `${ym.year} 年 ${ym.month} 月`
}

/* ---------------- 目标倒推 ---------------- */

/**
 * 指定月数内达标所需的每月储蓄（分）。
 *  - 已达标 → 0；
 *  - months ≤ 0 → null（请重新选择日期）；
 *  - 否则向上取整至元：ceil(差额 / 月数 / 100) × 100。
 */
export function requiredMonthlyCents(
  assetCents: number,
  thresholdCents: number,
  months: number,
): number | null {
  if (assetCents >= thresholdCents) return 0
  const m = Math.round(months)
  if (!isFinite(m) || m <= 0) return null
  const gapCents = thresholdCents - assetCents
  return Math.ceil(gapCents / m / CENTS_PER_YUAN) * CENTS_PER_YUAN
}

/* ---------------- 展示格式化 ---------------- */

/** 18 万 → '18 万元'；9,999.99 元 → '9,999.99 元'；1.2 亿 → '1.2 亿元'（金额自动元/万/亿） */
export function formatMoneyCents(cents: number): string {
  const yuan = cents / CENTS_PER_YUAN
  // 尾零裁剪：先取整到分，再按分位/角位是否为 0 决定小数位数
  const trim = (v: number, unit: string): string => {
    const fen = Math.round(v * 100)
    const digits = fen % 100 === 0 ? 0 : fen % 10 === 0 ? 1 : 2
    return `${fmtNum(fen / 100, digits)} ${unit}`
  }
  if (yuan < 1e4) {
    const fen = Math.round(yuan * 100)
    const digits = fen % 100 === 0 ? 0 : fen % 10 === 0 ? 1 : 2
    return `${fmtNum(fen / 100, digits)} 元`
  }
  if (yuan < 1e8) {
    return trim(yuan / 1e4, '万元')
  }
  return trim(yuan / 1e8, '亿元')
}

/** 千分位整数金额（输入用）：'13,667' */
export function formatIntCNY(yuan: number): string {
  return fmtNum(Math.ceil(yuan), 0)
}
