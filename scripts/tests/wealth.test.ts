import test from 'node:test'
import assert from 'node:assert/strict'
import { WEALTH_LEVELS, MAX_LEVEL_INDEX } from '../../src/config/wealthLevels'
import {
  addMonthsYM,
  buildLevelProgress,
  formatDurationCN,
  formatMoneyCents,
  formatYM,
  isBeyondHorizon,
  levelIndexOf,
  milestonesAhead,
  monthsBetweenYM,
  monthsToReach,
  nextLevelOf,
  requiredMonthlyCents,
  splitMonths,
  toCents,
} from '../../src/utils/wealthCalculator'

const Y = (v: number): number => toCents(v) as number

/* ---------------- 等级判断边界（需求文档第十一节 1–11） ---------------- */
test('等级判断：11 个数量级边界全部命中', () => {
  assert.equal(levelIndexOf(Y(0)), 1) // 0 元 → A1
  assert.equal(levelIndexOf(Y(9.99)), 1) // 9.99 元 → A1
  assert.equal(levelIndexOf(Y(10)), 2)
  assert.equal(levelIndexOf(Y(100)), 3)
  assert.equal(levelIndexOf(Y(1000)), 4)
  assert.equal(levelIndexOf(Y(10000)), 5)
  assert.equal(levelIndexOf(Y(100000)), 6)
  assert.equal(levelIndexOf(Y(1000000)), 7)
  assert.equal(levelIndexOf(Y(10000000)), 8)
  assert.equal(levelIndexOf(Y(100000000)), 9)
  assert.equal(levelIndexOf(Y(1000000000)), 10)
  assert.equal(levelIndexOf(Y(9999999999)), 10) // 99.99 亿仍是 A10
})

test('等级判断：区间左闭右开，紧邻边界不串级', () => {
  assert.equal(levelIndexOf(Y(9.99)), 1)
  assert.equal(levelIndexOf(Y(99.99)), 2)
  assert.equal(levelIndexOf(Y(999.99)), 3)
  assert.equal(levelIndexOf(Y(9999.99)), 4)
  assert.equal(levelIndexOf(Y(99999.99)), 5)
  assert.equal(levelIndexOf(Y(999999.99)), 6)
  // 浮点安全：18.05 万元 分级仍准确
  assert.equal(levelIndexOf(Y(180500)), 6)
})

test('等级配置：10 级连续无缝、A10 无上限', () => {
  assert.equal(WEALTH_LEVELS.length, 10)
  assert.equal(WEALTH_LEVELS[0].minCents, 0)
  for (let i = 1; i < WEALTH_LEVELS.length; i++) {
    assert.equal(WEALTH_LEVELS[i].minCents, WEALTH_LEVELS[i - 1].maxCents)
  }
  assert.equal(WEALTH_LEVELS[9].maxCents, null)
  assert.equal(WEALTH_LEVELS[9].code, 'A10')
})

/* ---------------- 升级进度（需求文档第四节） ---------------- */
test('进度：18 万 → A6，差额 82 万，等级内进度 ≈ 8.89%', () => {
  const p = buildLevelProgress(Y(180000))
  assert.equal(p.level.code, 'A6')
  assert.equal(p.next?.code, 'A7')
  assert.equal(p.gapCents, Y(820000))
  assert.ok(Math.abs((p.progress as number) - 80000 / 900000) < 1e-9) // (18-10)/(100-10)
  assert.ok((p.progress as number) > 0.0888 && (p.progress as number) < 0.0889)
})

test('进度：恰好等级起点（10 万）进度为 0，恰达门槛进度为 1', () => {
  const atStart = buildLevelProgress(Y(100000))
  assert.equal(atStart.progress, 0)
  const atEnd = buildLevelProgress(Y(999999.99))
  assert.ok((atEnd.progress as number) > 0.99)
})

test('进度：A10 不显示下一级，progress 为 null', () => {
  const p = buildLevelProgress(Y(1000000000))
  assert.equal(p.level.code, 'A10')
  assert.equal(p.next, null)
  assert.equal(p.progress, null)
  assert.equal(p.gapCents, 0)
  assert.equal(nextLevelOf(Y(2000000000)), null)
})

/* ---------------- 升级时间轴（需求文档第五节示例） ---------------- */
test('时间轴：18 万 / 月存 5000 → A7 需 164 个月（13 年 8 个月）', () => {
  const m = monthsToReach(Y(180000), Y(5000), Y(1000000))
  assert.equal(m, 164)
  assert.deepEqual(splitMonths(164), { years: 13, months: 8 })
  assert.equal(formatDurationCN(164), '13 年 8 个月')
})

test('时间轴：起始月 + 164 个月 → 正确落点（2026-11 → 2040-07）', () => {
  assert.deepEqual(addMonthsYM({ year: 2026, month: 11 }, 164), { year: 2040, month: 7 })
  // 跨年：2026-11 + 2 = 2027-01（第一笔下月底，2 个月后达标）
  assert.deepEqual(addMonthsYM({ year: 2026, month: 11 }, 2), { year: 2027, month: 1 })
  assert.equal(formatYM({ year: 2040, month: 7 }), '2040 年 7 月')
  assert.equal(monthsBetweenYM({ year: 2026, month: 11 }, { year: 2040, month: 7 }), 164)
})

test('时间轴：已达标 → 0（已解锁）；月存 0 → null，不抛除零错误', () => {
  assert.equal(monthsToReach(Y(1000000), Y(5000), Y(1000000)), 0)
  assert.equal(monthsToReach(Y(1200000), Y(0), Y(2000000)), null)
  assert.equal(monthsToReach(Y(1200000), -Y(100), Y(2000000)), null)
  assert.equal(monthsToReach(Y(1200000), NaN, Y(2000000)), null)
})

test('时间轴：超过 50 年统一提示（999,000 个月）', () => {
  const m = monthsToReach(Y(1000000), Y(1000), Y(1000000000))
  assert.ok((m as number) > 600)
  assert.equal(isBeyondHorizon(m as number), true)
  assert.equal(isBeyondHorizon(600), false)
  assert.equal(isBeyondHorizon(601), true)
})

/* ---------------- 升级加速器（需求文档第六节示例） ---------------- */
test('加速器：5000→164 个月，8000→103 个月（8 年 7 个月），提前 61 个月（5 年 1 个月）', () => {
  const base = monthsToReach(Y(180000), Y(5000), Y(1000000)) as number
  const fast = monthsToReach(Y(180000), Y(8000), Y(1000000)) as number
  assert.equal(base, 164)
  assert.equal(fast, 103) // 820000 元 / 8000 = 102.5 → ceil 103
  assert.deepEqual(splitMonths(fast), { years: 8, months: 7 })
  assert.deepEqual(splitMonths(base - fast), { years: 5, months: 1 })
  assert.equal(formatDurationCN(base - fast), '5 年 1 个月')
})

test('加速器：原计划超 50 年、加速后可达时只展示加速时间', () => {
  // 18 万 → A10：月存 5000 需 199,832 个月（超视野）；月存 200000 → 4,916 个月仍超
  // 月存 200 万 → 492 个月 < 600，可达
  const base = monthsToReach(Y(180000), Y(5000), Y(1000000000)) as number
  assert.equal(isBeyondHorizon(base), true)
  const fast = monthsToReach(Y(180000), Y(2000000), Y(1000000000)) as number
  assert.equal(isBeyondHorizon(fast), false)
})

/* ---------------- 目标倒推（需求文档第七节示例） ---------------- */
test('倒推：18 万 → A7（100 万）5 年（60 个月）→ 每月 13,667 元（向上取整至元）', () => {
  const r = requiredMonthlyCents(Y(180000), Y(1000000), 60)
  assert.equal(r, Y(13667)) // ceil(820000/60)=13666.67 → 13667
})

test('倒推：整除月份不多收（差额 82 万 / 410 个月 = 2000 元整）', () => {
  assert.equal(requiredMonthlyCents(Y(180000), Y(1000000), 410), Y(2000))
})

test('倒推：已达标 → 0；月份 ≤ 0 → null', () => {
  assert.equal(requiredMonthlyCents(Y(1000000), Y(1000000), 60), 0)
  assert.equal(requiredMonthlyCents(Y(500000), Y(1000000), 0), null)
  assert.equal(requiredMonthlyCents(Y(500000), Y(1000000), -3), null)
})

test('倒推：剩余月份计算', () => {
  assert.equal(monthsBetweenYM({ year: 2026, month: 11 }, { year: 2031, month: 11 }), 60)
  assert.equal(monthsBetweenYM({ year: 2026, month: 11 }, { year: 2026, month: 11 }), 0)
  assert.equal(monthsBetweenYM({ year: 2026, month: 11 }, { year: 2026, month: 10 }), -1)
})

/* ---------------- 中间里程碑（需求文档第四节） ---------------- */
test('里程碑：A6 门槛 100 万 → 20/30/50/80 万；只展示未达成项', () => {
  assert.deepEqual(milestonesAhead(Y(0), 6), [Y(200000), Y(300000), Y(500000), Y(800000)])
  // 已有 18 万 → 20/30/50/80 万都还没到
  assert.deepEqual(milestonesAhead(Y(180000), 6), [Y(200000), Y(300000), Y(500000), Y(800000)])
  // 已有 35 万 → 剩 50/80 万
  assert.deepEqual(milestonesAhead(Y(350000), 6), [Y(500000), Y(800000)])
  // 已有 85 万 → 无剩余里程碑
  assert.deepEqual(milestonesAhead(Y(850000), 6), [])
})

test('里程碑：A1–A4 不展示；A10 无下一级不展示', () => {
  for (const idx of [1, 2, 3, 4]) {
    assert.deepEqual(milestonesAhead(Y(0), idx), [])
  }
  assert.deepEqual(milestonesAhead(Y(0), 10), [])
  // A5（门槛 10 万）→ 2/3/5/8 万
  assert.deepEqual(milestonesAhead(Y(0), 5), [Y(20000), Y(30000), Y(50000), Y(80000)])
})

/* ---------------- 金额展示 ---------------- */
test('金额格式：元 / 万元 / 亿元 自动切换，千分位', () => {
  assert.equal(formatMoneyCents(Y(9.99)), '9.99 元')
  assert.equal(formatMoneyCents(Y(9999.99)), '9,999.99 元')
  assert.equal(formatMoneyCents(Y(180000)), '18 万元')
  assert.equal(formatMoneyCents(Y(1234567)), '123.46 万元')
  assert.equal(formatMoneyCents(Y(10000000)), '1,000 万元')
  assert.equal(formatMoneyCents(Y(120000000)), '1.2 亿元')
  assert.equal(formatMoneyCents(Y(1000000000)), '10 亿元')
})

/* ---------------- 输入换算 ---------------- */
test('toCents：非法输入返回 null，负数返回 null', () => {
  assert.equal(toCents(NaN), null)
  assert.equal(toCents(Infinity), null)
  assert.equal(toCents(-1), null)
  assert.equal(toCents(0), 0)
  assert.equal(toCents(0.1), 10) // 浮点 0.1*100=10.000000000000002 → round 到 10 分
})
