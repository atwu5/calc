/** 财富 A 级测算（小程序版）：测段位 → 看升级进度 → 时间轴 → 加速器/目标倒推（Tab） */
import {
  MAX_ASSET_YUAN,
  MAX_LEVEL_INDEX,
  MAX_MONTHLY_YUAN,
  WEALTH_LEVELS,
  type WealthLevel,
} from '../../engine/config/wealthLevels'
import {
  addMonthsYM,
  buildLevelProgress,
  formatDurationCN,
  formatMoneyCents,
  formatYM,
  isBeyondHorizon,
  levelByIndex,
  levelIndexOf,
  milestonesAhead,
  monthsBetweenYM,
  monthsToReach,
  requiredMonthlyCents,
  toCents,
  type YM,
} from '../../engine/utils/wealthCalculator'
import { fmtNum } from '../../engine/utils/money'
import { loadStore, removeStore, saveStore } from '../../utils/toolboxStorage'

const PERSIST_KEY = 'wealth.v1'

interface WealthPersist {
  scope: 'personal' | 'family'
  unit: 'yuan' | 'wan'
  assetDraft: string
  monthlyDraft: string
  startYear: number
  startMonth: number
  extraDraft: string
  goalYear: number | null
  goalMonth: number | null
  saveLocal: boolean
  measured: boolean
  timelineShown: boolean
}

interface LevelVm {
  code: string
  assetText: string
  scopeText: string
  labelText: string
  badgeStyle: string
  hasNext: boolean
  nextCode: string
  progressPctText: string
  barStyle: string
  startPoint: string
  thresholdPoint: string
  gapPoint: string
  topText: string
}

interface LadderItem {
  code: string
  mark: string
  badgeStyle: string
  itemStyle: string
}

interface TimelineItem {
  isNow: boolean
  isMilestone: boolean
  title: string
  amountText: string
  right: string
  chipText: string
  sub: string
  badgeStyle: string
  dotStyle: string
  dotInnerStyle: string
  cardClass: string
}

interface AccelVm {
  baseText: string
  baseSub: string
  fastText: string
  fastSub: string
  summary: string
  warn: string
}

interface GoalVm {
  thresholdText: string
  thresholdSub: string
  gapText: string
  gapSub: string
  whenText: string
  whenSub: string
  needText: string
  needSub: string
  compareText: string
}

interface WealthData {
  scope: 'personal' | 'family'
  unit: 'yuan' | 'wan'
  assetDraft: string
  assetInvalid: boolean
  assetError: string
  monthlyDraft: string
  monthlyInvalid: boolean
  extraDraft: string
  sliderVal: number
  yearLabels: string[]
  monthLabels: string[]
  startYearIdx: number
  startMonthIdx: number
  goalYearIdx: number
  goalMonthIdx: number
  tab: 'accel' | 'goal'
  saveLocal: boolean
  measured: boolean
  timelineShown: boolean
  curIdx: number
  targetLabels: string[]
  targetIdx: number
  targetAdjusted: boolean
  ladder: LadderItem[]
  ladderSelIdx: number
  ladderDetailText: string
  levelVm: LevelVm | null
  timeline: TimelineItem[]
  timelineNote: string
  accelVm: AccelVm | null
  accelHint: string
  goalVm: GoalVm | null
  goalNote: string
}

function parseDraft(raw: string): number | null {
  const t = String(raw == null ? '' : raw).trim()
  if (!t) return null
  const n = Number(t)
  return isFinite(n) && n >= 0 ? n : null
}

function badgeStyleOf(level: WealthLevel): string {
  if (level.index === MAX_LEVEL_INDEX) {
    return 'background: linear-gradient(135deg, #172554 0%, #1e3a8a 40%, #3b5bd9 72%, #c9a23c 100%);'
  }
  return `background: linear-gradient(135deg, ${level.color} 0%, ${level.color}c4 100%);`
}

function durationOf(months: number | null): string {
  if (months == null) return '—'
  return isBeyondHorizon(months) ? '超过 50 年' : formatDurationCN(months)
}

function whenTextOf(months: number | null, start: YM): string {
  if (months == null || isBeyondHorizon(months)) return '超过 50 年'
  return `${formatYM(addMonthsYM(start, months))} · ${formatDurationCN(months)}后`
}

function parseYearIdx(idx: number, len: number): number {
  return idx >= 0 && idx < len ? idx : 0
}

/** 工厂函数生成初始 data：避免 Page data 引用模块级常量对象被 setData 路径污染 */
function initialData(): WealthData {
  const now = new Date()
  const thisYear = now.getFullYear()
  const yearLabels = Array.from({ length: 61 }, (_, i) => `${thisYear + i} 年`)
  const monthLabels = Array.from({ length: 12 }, (_, i) => `${i + 1} 月`)
  return {
    scope: 'personal',
    unit: 'wan',
    assetDraft: '',
    assetInvalid: false,
    assetError: '',
    monthlyDraft: '',
    monthlyInvalid: false,
    extraDraft: '',
    sliderVal: 0,
    yearLabels,
    monthLabels,
    startYearIdx: 0,
    startMonthIdx: now.getMonth(),
    goalYearIdx: -1,
    goalMonthIdx: -1,
    tab: 'accel',
    saveLocal: false,
    measured: false,
    timelineShown: false,
    curIdx: 0,
    targetLabels: [],
    targetIdx: 0,
    targetAdjusted: false,
    ladder: [],
    ladderSelIdx: 0,
    ladderDetailText: '',
    levelVm: null,
    timeline: [],
    timelineNote: '',
    accelVm: null,
    accelHint: '',
    goalVm: null,
    goalNote: '',
  }
}

function persistOf(d: WealthData): WealthPersist {
  const thisYear = new Date().getFullYear()
  return {
    scope: d.scope,
    unit: d.unit,
    assetDraft: d.assetDraft,
    monthlyDraft: d.monthlyDraft,
    startYear: thisYear + parseYearIdx(d.startYearIdx, d.yearLabels.length),
    startMonth: d.startMonthIdx + 1,
    extraDraft: d.extraDraft,
    goalYear: d.goalYearIdx >= 0 ? thisYear + d.goalYearIdx : null,
    goalMonth: d.goalMonthIdx >= 0 ? d.goalMonthIdx + 1 : null,
    saveLocal: d.saveLocal,
    measured: d.measured,
    timelineShown: d.timelineShown,
  }
}

Page<WealthData, {
  onLoad(): void
  persist(): void
  recompute(): void
  onScopeTap(e: MiniEvent.Tap): void
  onUnitTap(e: MiniEvent.Tap): void
  onAssetInput(e: MiniEvent.Input): void
  onMonthlyInput(e: MiniEvent.Input): void
  onMeasure(): void
  onStartYearChange(e: MiniEvent.PickerChange): void
  onStartMonthChange(e: MiniEvent.PickerChange): void
  onGenerateTimeline(): void
  onTabTap(e: MiniEvent.Tap): void
  onTargetChange(e: MiniEvent.PickerChange): void
  onSliderInput(e: MiniEvent.PickerChange): void
  onExtraInput(e: MiniEvent.Input): void
  onGoalYearChange(e: MiniEvent.PickerChange): void
  onGoalMonthChange(e: MiniEvent.PickerChange): void
  onQuickGoal(e: MiniEvent.Tap): void
  onLadderTap(e: MiniEvent.Tap): void
  onSaveToggle(): void
  onReset(): void
}>({
  data: initialData(),

  onLoad() {
    const saved = loadStore<WealthPersist | null>(PERSIST_KEY, null)
    if (saved && saved.saveLocal) {
      const d = initialData()
      const thisYear = new Date().getFullYear()
      const startYearIdx =
        saved.startYear >= thisYear && saved.startYear < thisYear + d.yearLabels.length
          ? saved.startYear - thisYear
          : 0
      const goalYearIdx =
        saved.goalYear != null && saved.goalYear >= thisYear && saved.goalYear < thisYear + d.yearLabels.length
          ? saved.goalYear - thisYear
          : -1
      this.setData({
        scope: saved.scope === 'family' ? 'family' : 'personal',
        unit: saved.unit === 'yuan' ? 'yuan' : 'wan',
        assetDraft: String(saved.assetDraft ?? ''),
        monthlyDraft: String(saved.monthlyDraft ?? ''),
        extraDraft: String(saved.extraDraft ?? ''),
        sliderVal: Math.min(Number(saved.extraDraft) || 0, 10000),
        startYearIdx,
        startMonthIdx: saved.startMonth >= 1 && saved.startMonth <= 12 ? saved.startMonth - 1 : d.startMonthIdx,
        goalYearIdx,
        goalMonthIdx: saved.goalMonth != null && saved.goalMonth >= 1 && saved.goalMonth <= 12 ? saved.goalMonth - 1 : -1,
        saveLocal: true,
        measured: saved.measured === true && String(saved.assetDraft ?? '') !== '',
        timelineShown: saved.timelineShown === true,
      })
    }
    this.recompute()
  },

  persist() {
    if (!this.data.saveLocal) return
    saveStore(PERSIST_KEY, persistOf(this.data) as unknown as Record<string, unknown>)
  },

  recompute() {
    const d = this.data
    const now = new Date()
    const thisYear = now.getFullYear()
    const todayYM: YM = { year: thisYear, month: now.getMonth() + 1 }

    /* ---- 输入解析 ---- */
    const assetVal = parseDraft(d.assetDraft)
    const assetYuan = assetVal == null ? null : d.unit === 'wan' ? assetVal * 10000 : assetVal
    const assetError = assetYuan != null && assetYuan > MAX_ASSET_YUAN
      ? '金额超出测算范围（上限 10 万亿元），请检查数字或单位'
      : ''
    const assetCents = assetYuan == null ? null : toCents(assetYuan)
    const monthlyVal = parseDraft(d.monthlyDraft)
    const monthlyInvalid = monthlyVal != null && monthlyVal > MAX_MONTHLY_YUAN
    const monthlyCents = monthlyInvalid ? null : monthlyVal == null ? null : toCents(monthlyVal)
    const hasMonthly = monthlyCents != null && monthlyCents > 0
    const extraVal = parseDraft(d.extraDraft)
    const extraCents = extraVal != null && extraVal > 0 ? toCents(extraVal) ?? 0 : 0

    /* ---- 未测算或非法：只保留输入态 ---- */
    if (!d.measured || assetCents == null || assetError) {
      this.setData({
        assetInvalid: d.assetDraft !== '' && assetError !== '',
        assetError,
        monthlyInvalid,
        sliderVal: Math.min(extraVal ?? 0, 10000),
        levelVm: null,
        ladder: [],
        ladderSelIdx: 0,
        ladderDetailText: '',
        timeline: [],
        timelineNote: '',
        accelVm: null,
        accelHint: '',
        goalVm: null,
        goalNote: '',
        targetLabels: [],
        targetIdx: 0,
        targetAdjusted: false,
      })
      this.persist()
      return
    }

    const curIdx = levelIndexOf(assetCents)
    const progress = buildLevelProgress(assetCents)
    const start: YM = { year: thisYear + parseYearIdx(d.startYearIdx, d.yearLabels.length), month: d.startMonthIdx + 1 }

    /* ---- 目标等级：手动选择仍有效则保留，否则自动回落到下一个未达成等级 ---- */
    const unreached = WEALTH_LEVELS.filter((lv) => lv.index > curIdx)
    const targetLabels = unreached.map(
      (lv) => `${lv.code} · ${lv.label}（${formatMoneyCents(lv.minCents)}）`,
    )
    let targetIdx = 0
    if (d.targetIdx >= 0 && d.targetIdx < targetLabels.length) targetIdx = d.targetIdx
    const targetLevel = unreached[targetIdx]
    const targetAdjusted = d.targetIdx > 0 && targetIdx !== d.targetIdx

    /* ---- 段位卡 ---- */
    const levelVm: LevelVm = {
      code: progress.level.code,
      assetText: formatMoneyCents(assetCents),
      scopeText: d.scope === 'family' ? '家庭' : '个人',
      labelText: progress.level.label,
      badgeStyle: badgeStyleOf(progress.level),
      hasNext: progress.next != null,
      nextCode: progress.next?.code ?? '',
      progressPctText: progress.progress != null ? (progress.progress * 100).toFixed(2) : '',
      barStyle:
        progress.progress != null
          ? `width: ${Math.max(progress.progress * 100, 1.5)}%; background: linear-gradient(90deg, ${progress.level.color}99, ${progress.level.color});`
          : '',
      startPoint: formatMoneyCents(progress.level.minCents),
      thresholdPoint: progress.next != null ? formatMoneyCents(progress.next.minCents) : '',
      gapPoint: progress.next != null ? formatMoneyCents(progress.gapCents) : '',
      topText:
        progress.next == null
          ? `🏆 已解锁最高财富段位 ${progress.level.code}（${progress.level.label}）`
          : '',
    }

    /* ---- 阶梯 ---- */
    const ladder: LadderItem[] = WEALTH_LEVELS.map((lv) => {
      const state = lv.index < curIdx ? 'done' : lv.index === curIdx ? 'cur' : 'lock'
      return {
        code: lv.code,
        mark: state === 'done' ? '✅' : state === 'cur' ? '⭐' : '🔒',
        badgeStyle: badgeStyleOf(lv),
        itemStyle:
          state === 'cur'
            ? `box-shadow: 0 0 0 4rpx ${lv.color}; background: linear-gradient(180deg, #ffffff, #f7f5ff); border-color: transparent;`
            : '',
      }
    })
    const ladderSelIdx = d.ladderSelIdx >= 1 && d.ladderSelIdx <= 10 ? d.ladderSelIdx : curIdx
    const sel = levelByIndex(ladderSelIdx)
    const stateText = sel.index < curIdx ? '（已解锁）' : sel.index === curIdx ? '（当前所在）' : '（未解锁）'
    const ladderDetailText = `${sel.code} · ${sel.label}  ${formatMoneyCents(sel.minCents)} — ${sel.maxCents != null ? formatMoneyCents(sel.maxCents) : '无上限'} ${stateText}`

    /* ---- 时间轴 ---- */
    const timeline: TimelineItem[] = []
    let timelineNote = ''
    if (curIdx >= MAX_LEVEL_INDEX) {
      timelineNote = '你已站在 A10 之巅，这条时间轴只属于下一个挑战者 🎉'
    } else if (d.monthlyDraft.trim() === '') {
      timelineNote = '请先填写每月可存金额，才能生成升级路线'
    } else if (monthlyInvalid) {
      timelineNote = '月储蓄金额超出测算范围，请修改后重试'
    } else if (!hasMonthly) {
      timelineNote = '每月可存 0 元，无法通过当前储蓄方式升级——先攒出第一笔结余吧'
    } else {
      timeline.push({
        isNow: true,
        isMilestone: false,
        title: '当前所在',
        amountText: formatMoneyCents(assetCents),
        right: '',
        chipText: '起点',
        sub: '',
        badgeStyle: badgeStyleOf(progress.level),
        dotStyle: '',
        dotInnerStyle: '',
        cardClass: 'w-tl-card-now',
      })
      for (const m of milestonesAhead(assetCents, curIdx)) {
        const months = monthsToReach(assetCents, monthlyCents as number, m)
        timeline.push({
          isNow: false,
          isMilestone: true,
          title: `里程碑 · ${formatMoneyCents(m)}`,
          amountText: '',
          right: whenTextOf(months, start),
          chipText: '',
          sub: '',
          badgeStyle: '',
          dotStyle: `box-shadow: 0 0 0 4rpx ${progress.level.color}55;`,
          dotInnerStyle: `background: ${progress.level.color};`,
          cardClass: 'w-tl-card-ms',
        })
      }
      for (let idx = curIdx + 1; idx <= MAX_LEVEL_INDEX; idx++) {
        const lv = levelByIndex(idx)
        const months = monthsToReach(assetCents, monthlyCents as number, lv.minCents)
        const beyond = months != null && isBeyondHorizon(months)
        timeline.push({
          isNow: false,
          isMilestone: false,
          title: `${lv.code} ${lv.label}`,
          amountText: `门槛 ${formatMoneyCents(lv.minCents)}`,
          right: whenTextOf(months, start),
          chipText: '',
          sub: beyond
            ? '需累计储蓄超过 50 年，暂无法给出预计达成时间'
            : `需累计储蓄 ${formatDurationCN(months as number)}`,
          badgeStyle: badgeStyleOf(lv),
          dotStyle: '',
          dotInnerStyle: '',
          cardClass: '',
        })
      }
    }

    /* ---- 加速器 ---- */
    let accelVm: AccelVm | null = null
    let accelHint = ''
    if (targetLevel != null) {
      const base = hasMonthly ? monthsToReach(assetCents, monthlyCents as number, targetLevel.minCents) : null
      const fastMonthly = (monthlyCents ?? 0) + extraCents
      const fast = fastMonthly > 0 ? monthsToReach(assetCents, fastMonthly, targetLevel.minCents) : null
      if (base == null && fast == null) {
        accelHint = '请先填写每月可存金额，或设置每月额外储蓄金额'
      } else {
        let summary = ''
        let warn = ''
        if (extraCents <= 0) {
          accelHint = '拖动滑块或输入每月额外储蓄，看看能提前多久升级'
        } else if (
          base != null && fast != null && !isBeyondHorizon(base) && !isBeyondHorizon(fast)
        ) {
          summary = `每月多存 ${fmtNum(extraCents / 100, 0)} 元，预计提前 ${formatDurationCN(base - fast)} 升级 ${targetLevel.code}`
        } else if (
          base != null && isBeyondHorizon(base) && fast != null && !isBeyondHorizon(fast)
        ) {
          summary = `原计划超过 50 年；加速后预计 ${formatDurationCN(fast)} 可达成 ${targetLevel.code}`
        } else if (base == null && fast != null && !isBeyondHorizon(fast)) {
          summary = `每月存 ${fmtNum(fastMonthly / 100, 0)} 元，预计 ${formatDurationCN(fast)} 达成 ${targetLevel.code}`
        } else if (fast != null && isBeyondHorizon(fast)) {
          warn = `按每月 ${fmtNum(fastMonthly / 100, 0)} 元仍超过 50 年，建议继续提高每月储蓄`
        } else {
          warn = '请先填写原计划的每月可存金额，才能对比提前时间'
        }
        accelVm = {
          baseText: durationOf(base),
          baseSub: `每月存 ${fmtNum((monthlyCents ?? 0) / 100, 0)} 元`,
          fastText: durationOf(fast),
          fastSub: `每月存 ${fmtNum(fastMonthly / 100, 0)} 元`,
          summary,
          warn,
        }
      }
    }

    /* ---- 目标倒推 ---- */
    let goalVm: GoalVm | null = null
    let goalNote = ''
    if (targetLevel != null && d.goalYearIdx >= 0 && d.goalMonthIdx >= 0) {
      const goalYM: YM = { year: thisYear + d.goalYearIdx, month: d.goalMonthIdx + 1 }
      const months = monthsBetweenYM(todayYM, goalYM)
      const required = months > 0 ? requiredMonthlyCents(assetCents, targetLevel.minCents, months) : null
      if (required == null) {
        goalNote = '目标日期无效或已过去，请重新选择一个晚于本月的日期'
      } else {
        const cur = monthlyCents ?? 0
        const diff = Math.max(required - cur, 0)
        goalVm = {
          thresholdText: formatMoneyCents(targetLevel.minCents),
          thresholdSub: `${targetLevel.code} · ${targetLevel.label}`,
          gapText: formatMoneyCents(Math.max(targetLevel.minCents - assetCents, 0)),
          gapSub: `当前 ${formatMoneyCents(assetCents)}`,
          whenText: formatYM(goalYM),
          whenSub: `距今 ${formatDurationCN(months)}`,
          needText: `${fmtNum(required / 100, 0)} 元`,
          needSub: `按 ${months} 个月向上取整至元`,
          compareText: diff > 0 ? `比目前每月需多存 ${fmtNum(diff / 100, 0)} 元` : '按目前的月储蓄计划，届时可以达标',
        }
      }
    } else if (targetLevel != null) {
      goalNote = '选择目标年月后，算算每月需要存多少钱'
    }

    this.setData({
      assetInvalid: false,
      assetError,
      monthlyInvalid,
      sliderVal: Math.min(extraVal ?? 0, 10000),
      curIdx,
      targetLabels,
      targetIdx,
      targetAdjusted,
      ladder,
      ladderDetailText,
      levelVm,
      timeline,
      timelineNote,
      accelVm,
      accelHint,
      goalVm,
      goalNote,
    })
    this.persist()
  },

  onScopeTap(e: MiniEvent.Tap) {
    const v = String(e.currentTarget.dataset.scope ?? 'personal')
    this.setData({ scope: v === 'family' ? 'family' : 'personal' })
    this.recompute()
  },

  onUnitTap(e: MiniEvent.Tap) {
    const to = String(e.currentTarget.dataset.unit ?? 'wan') as 'yuan' | 'wan'
    if (to === this.data.unit) return
    const v = parseDraft(this.data.assetDraft)
    const converted = v == null ? '' : String(to === 'yuan' ? v * 10000 : v / 10000)
    this.setData({ unit: to, assetDraft: converted })
    this.recompute()
  },

  onAssetInput(e: MiniEvent.Input) {
    const cleaned = e.detail.value.replace(/[^\d.]/g, '')
    this.setData({ assetDraft: cleaned })
    this.recompute()
  },

  onMonthlyInput(e: MiniEvent.Input) {
    const cleaned = e.detail.value.replace(/[^\d.]/g, '')
    this.setData({ monthlyDraft: cleaned })
    this.recompute()
  },

  onMeasure() {
    if (parseDraft(this.data.assetDraft) == null) return
    this.setData({ measured: true })
    this.recompute()
  },

  onStartYearChange(e: MiniEvent.PickerChange) {
    const i = Number(e.detail.value)
    this.setData({ startYearIdx: parseYearIdx(i, this.data.yearLabels.length) })
    this.recompute()
  },

  onStartMonthChange(e: MiniEvent.PickerChange) {
    const i = Number(e.detail.value)
    this.setData({ startMonthIdx: i >= 0 && i < 12 ? i : this.data.startMonthIdx })
    this.recompute()
  },

  onGenerateTimeline() {
    this.setData({ timelineShown: true })
    this.recompute()
  },

  onTabTap(e: MiniEvent.Tap) {
    const v = String(e.currentTarget.dataset.tab ?? 'accel')
    this.setData({ tab: v === 'goal' ? 'goal' : 'accel' })
  },

  onTargetChange(e: MiniEvent.PickerChange) {
    const i = Number(e.detail.value)
    this.setData({ targetIdx: i >= 0 && i < this.data.targetLabels.length ? i : this.data.targetIdx })
    this.recompute()
  },

  /** slider 拖动中与松手共用：实时更新结果 */
  onSliderInput(e: MiniEvent.PickerChange) {
    const v = Math.min(Math.max(Number(e.detail.value) || 0, 0), 10000)
    this.setData({ sliderVal: v, extraDraft: String(v) })
    this.recompute()
  },

  onExtraInput(e: MiniEvent.Input) {
    const cleaned = e.detail.value.replace(/[^\d.]/g, '')
    this.setData({ extraDraft: cleaned, sliderVal: Math.min(Number(cleaned) || 0, 10000) })
    this.recompute()
  },

  onGoalYearChange(e: MiniEvent.PickerChange) {
    const i = Number(e.detail.value)
    this.setData({ goalYearIdx: parseYearIdx(i, this.data.yearLabels.length) })
    this.recompute()
  },

  onGoalMonthChange(e: MiniEvent.PickerChange) {
    const i = Number(e.detail.value)
    this.setData({ goalMonthIdx: i >= 0 && i < 12 ? i : this.data.goalMonthIdx })
    this.recompute()
  },

  onQuickGoal(e: MiniEvent.Tap) {
    const months = Number(e.currentTarget.dataset.months ?? 0)
    if (!(months > 0)) return
    const now = new Date()
    const target = addMonthsYM({ year: now.getFullYear(), month: now.getMonth() + 1 }, months)
    this.setData({ goalYearIdx: target.year - now.getFullYear(), goalMonthIdx: target.month - 1 })
    this.recompute()
  },

  onLadderTap(e: MiniEvent.Tap) {
    const idx = Number(e.currentTarget.dataset.index ?? 0)
    if (!(idx >= 1 && idx <= 10) || this.data.levelVm == null) return
    const curIdx = this.data.curIdx
    const sel = levelByIndex(idx)
    const stateText = idx < curIdx ? '（已解锁）' : idx === curIdx ? '（当前所在）' : '（未解锁）'
    this.setData({
      ladderSelIdx: idx,
      ladderDetailText: `${sel.code} · ${sel.label}  ${formatMoneyCents(sel.minCents)} — ${sel.maxCents != null ? formatMoneyCents(sel.maxCents) : '无上限'} ${stateText}`,
    })
  },

  onSaveToggle() {
    const next = !this.data.saveLocal
    this.setData({ saveLocal: next })
    if (next) this.persist()
    else removeStore(PERSIST_KEY)
  },

  onReset() {
    removeStore(PERSIST_KEY)
    this.setData(initialData())
  },
})
