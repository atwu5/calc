/** 财富 A 级测算（小程序版）：与 docs/wealth.html 设计稿同构——
 * 主舞台（纹章 + 资产/挑战双栏 + XP 条）→ 段位图鉴 → 下一站升级（里程碑卡片条 + 完整路线）→ 策略工坊（加速器/目标倒推）。
 * 计算全部走 engine/utils/wealthCalculator 纯函数（与 Web 版同一套口径，「分」整数运算）。 */
import {
  MAX_LEVEL_INDEX,
  RANK_COLORS,
  RANK_NAMES,
  RANK_SHORT_LABELS,
  WEALTH_LEVELS,
} from '../../engine/config/wealthLevels'
import {
  addMonthsYM,
  buildLevelProgress,
  candidateMilestoneCents,
  formatDurationCN,
  formatMoneyCents,
  formatMoneyShortCents,
  formatYM,
  levelIndexOf,
  monthsToReach,
  requiredMonthlyCents,
  toCents,
  type YM,
} from '../../engine/utils/wealthCalculator'
import { fmtNum } from '../../engine/utils/money'
import { loadStore, removeStore, saveStore } from '../../utils/toolboxStorage'

const PERSIST_KEY = 'wealth.v1'

interface WealthPersist {
  scope: string
  unit: string
  assetDraft: string
  monthlyDraft: string
  extraDraft: string
  startYear: number
  startMonth: number
  goalYear: number
  goalMonth: number
  boostTargetIdx: number
  reverseTargetIdx: number
  routeOpen: boolean
  saveLocal: boolean
}

interface StageVm {
  currentAmount: string
  scopeShow: string
  classShow: string
  crestRank: string
  rankTitle: string
  rankNote: string
  gapAmount: string
  nextRank: string
  nextTarget: string
  barLabel: string
  barFillStyle: string
  barPct: string
  exploreText: string
}

interface TileVm {
  code: string
  numText: string
  smallText: string
  stateIcon: string
  cls: string
  emblemStyle: string
}

interface MilestoneVm {
  cap: string
  amount: string
  time: string
  cls: string
}

interface MissionVm {
  title: string
  desc: string
}

interface RoutePointVm {
  title: string
  time: string
}

interface BoostVm {
  metric: string
  sub: string
  baseText: string
  boostText: string
  foot: string
}

interface ReverseVm {
  metric: string
  sub: string
  amountText: string
  gapText: string
  foot: string
}

interface ModalVm {
  title: string
  code: string
  color: string
  lines: string[]
}

interface WealthData {
  scope: string
  unit: string
  assetDraft: string
  monthlyDraft: string
  extraDraft: string
  sliderVal: number
  extraValueText: string
  yearLabels: string[]
  monthLabels: string[]
  startYearIdx: number
  startMonthIdx: number
  goalYearIdx: number
  goalMonthIdx: number
  tab: string
  saveLocal: boolean
  routeOpen: boolean
  targetOptions: string[]
  boostTargetIdx: number
  reverseTargetIdx: number
  stageVm: StageVm | null
  missionVm: MissionVm | null
  tiles: TileVm[]
  milestoneCards: MilestoneVm[]
  routePoints: RoutePointVm[]
  boostVm: BoostVm | null
  boostChips: Array<{ label: string; value: number; selected: boolean }>
  reverseVm: ReverseVm | null
  modal: ModalVm | null
  showRules: boolean
}

const EXTRA_CHIPS = [500, 1000, 2000, 3000, 5000]

function parseDraft(raw: string): number | null {
  const t = String(raw == null ? '' : raw).trim()
  if (!t) return null
  const n = Number(t)
  return isFinite(n) && n >= 0 ? n : null
}

/** 设计稿 readableMonths：null（月存无效）→ 无法预计；0 → 已达成；>600 → 超过 50 年 */
function readableMonths(months: number | null): string {
  if (months == null) return '无法预计'
  if (months === 0) return '已达成'
  if (months > 600) return '超过 50 年'
  return formatDurationCN(months)
}

function initialData(): WealthData {
  const now = new Date()
  const thisYear = now.getFullYear()
  const yearLabels = Array.from({ length: 61 }, (_, i) => `${thisYear + i} 年`)
  const monthLabels = Array.from({ length: 12 }, (_, i) => `${i + 1} 月`)
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
    boostChips: EXTRA_CHIPS.map((v) => ({ label: `+${fmtNum(v, 0)}`, value: v, selected: false })),
    reverseVm: null,
    modal: null,
    showRules: false,
  }
}

function persistOf(d: WealthData, thisYear: number): WealthPersist {
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
  }
}

Page<WealthData, {
  onLoad(): void
  persist(): void
  recompute(): void
  onScopePick(e: MiniEvent.PickerChange): void
  onUnitPick(e: MiniEvent.PickerChange): void
  onAssetInput(e: MiniEvent.Input): void
  onMonthlyInput(e: MiniEvent.Input): void
  onExplore(): void
  onStartYearPick(e: MiniEvent.PickerChange): void
  onStartMonthPick(e: MiniEvent.PickerChange): void
  onToggleRoute(): void
  onTabTap(e: MiniEvent.Tap): void
  onBoostTargetPick(e: MiniEvent.PickerChange): void
  onReverseTargetPick(e: MiniEvent.PickerChange): void
  onSliderInput(e: MiniEvent.PickerChange): void
  onExtraInput(e: MiniEvent.Input): void
  onChipTap(e: MiniEvent.Tap): void
  onGoalYearPick(e: MiniEvent.PickerChange): void
  onGoalMonthPick(e: MiniEvent.PickerChange): void
  onGoalQuick(e: MiniEvent.Tap): void
  onTileTap(e: MiniEvent.Tap): void
  onModalClose(): void
  noop(): void
  onRulesOpen(): void
  onRememberToggle(): void
  onReset(): void
}>({
  data: initialData(),

  onLoad() {
    const saved = loadStore<WealthPersist | null>(PERSIST_KEY, null)
    if (saved && saved.saveLocal) {
      const d = initialData()
      const thisYear = new Date().getFullYear()
      const inRange = (y: number | null | undefined): number | null =>
        y != null && y >= thisYear && y < thisYear + d.yearLabels.length ? y - thisYear : null
      const startYearIdx = inRange(saved.startYear) ?? 0
      const goalYearIdx = inRange(saved.goalYear) ?? 5
      this.setData({
        scope: saved.scope === '家庭' ? '家庭' : '个人',
        unit: saved.unit === 'yuan' ? 'yuan' : 'wan',
        assetDraft: String(saved.assetDraft ?? ''),
        monthlyDraft: String(saved.monthlyDraft ?? ''),
        extraDraft: String(saved.extraDraft ?? '0'),
        sliderVal: Math.min(Number(saved.extraDraft) || 0, 10000),
        extraValueText: `+ ${fmtNum(Number(saved.extraDraft) || 0, 0)} 元`,
        startYearIdx,
        startMonthIdx: saved.startMonth >= 1 && saved.startMonth <= 12 ? saved.startMonth - 1 : d.startMonthIdx,
        goalYearIdx,
        goalMonthIdx: saved.goalMonth >= 1 && saved.goalMonth <= 12 ? saved.goalMonth - 1 : d.goalMonthIdx,
        boostTargetIdx: Math.max(Number(saved.boostTargetIdx) || 0, 0),
        reverseTargetIdx: Math.max(Number(saved.reverseTargetIdx) || 0, 0),
        routeOpen: saved.routeOpen === true,
        saveLocal: true,
      })
    }
    this.recompute()
  },

  persist() {
    if (!this.data.saveLocal) return
    saveStore(PERSIST_KEY, persistOf(this.data, new Date().getFullYear()) as unknown as Record<string, unknown>)
  },

  recompute() {
    const d = this.data
    const now = new Date()
    const thisYear = now.getFullYear()
    const start: YM = { year: thisYear + d.startYearIdx, month: d.startMonthIdx + 1 }

    const assetVal = parseDraft(d.assetDraft)
    const assetYuan = assetVal == null ? null : d.unit === 'wan' ? assetVal * 10000 : assetVal
    const assetCents = assetYuan == null ? null : toCents(assetYuan)
    const monthlyVal = parseDraft(d.monthlyDraft)
    const monthlyCents = monthlyVal == null ? null : toCents(monthlyVal)
    const extraVal = parseDraft(d.extraDraft) ?? 0
    const extraCents = extraVal > 0 ? toCents(extraVal) ?? 0 : 0
    const idx = assetCents == null ? -1 : levelIndexOf(assetCents)
    const rank = idx - 1 // 0-based，与设计稿一致；-1 = 未输入

    /* ---------- 主舞台 ---------- */
    let stageVm: StageVm | null = null
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
      }
    } else {
      const progress = buildLevelProgress(assetCents as number)
      const isTop = rank === MAX_LEVEL_INDEX - 1
      const target = isTop ? null : WEALTH_LEVELS[rank + 1].minCents
      const pct = isTop ? 100 : (progress.progress as number) * 100
      stageVm = {
        currentAmount: formatMoneyCents(assetCents as number),
        scopeShow: `${d.scope}财富档案`,
        classShow: RANK_SHORT_LABELS[rank] + '资产',
        crestRank: `A${rank + 1}`,
        rankTitle: RANK_NAMES[rank],
        rankNote: `第 ${rank + 1} 阶 · ${RANK_SHORT_LABELS[rank]}资产`,
        gapAmount: isTop ? 'MAX' : formatMoneyCents(Math.max((target as number) - (assetCents as number), 0)),
        nextRank: isTop ? '巅峰已达成' : `下一级 A${rank + 2} · ${RANK_SHORT_LABELS[rank + 1]}`,
        nextTarget: isTop ? '巅峰段位 · 继续积累' : `目标 ${formatMoneyCents(target as number)}`,
        barLabel: isTop ? '最高财富段位已解锁' : `成长进度 · A${rank + 1} → A${rank + 2}`,
        barFillStyle: `width: ${pct}%;`,
        barPct: `${pct.toFixed(2)}%`,
        exploreText: '✦ 更新我的财富段位',
      }
    }

    /* ---------- 段位图鉴 ---------- */
    const tiles: TileVm[] = WEALTH_LEVELS.map((lv, i) => {
      const state = rank >= 0 && i < rank ? 'unlocked' : i === rank ? 'active' : 'locked'
      const color = RANK_COLORS[i]
      return {
        code: lv.code,
        numText: String(i + 1),
        smallText: RANK_SHORT_LABELS[i],
        stateIcon: state === 'unlocked' ? '✓' : state === 'active' ? '✦' : '♢',
        cls: state,
        emblemStyle: `background: linear-gradient(155deg, ${color}ba 0%, ${color} 38%, #0f1525 93%);`,
      }
    })

    /* ---------- 目标选项（未达成段位） ---------- */
    const targetOptions = WEALTH_LEVELS.filter((_, i) => rank < 0 || i > rank).map(
      (lv) => `${lv.code} · ${RANK_SHORT_LABELS[lv.index - 1]}（${formatMoneyShortCents(lv.minCents)}）`,
    )
    const boostTargetIdx = Math.min(d.boostTargetIdx, Math.max(targetOptions.length - 1, 0))
    const reverseTargetIdx = Math.min(d.reverseTargetIdx, Math.max(targetOptions.length - 1, 0))
    const boostTargetLv = WEALTH_LEVELS.filter((_, i) => rank < 0 || i > rank)[boostTargetIdx] ?? null
    const reverseTargetLv = WEALTH_LEVELS.filter((_, i) => rank < 0 || i > rank)[reverseTargetIdx] ?? null

    /* ---------- 下一站升级 ---------- */
    const milestoneCards: MilestoneVm[] = []
    const routePoints: RoutePointVm[] = []
    let missionVm: MissionVm | null = null
    if (assetCents == null) {
      missionVm = {
        title: '你的下一段冒险，等待开启',
        desc: '先在上方输入可用资产，唤醒你的财富段位。',
      }
    } else if (rank === MAX_LEVEL_INDEX - 1) {
      missionVm = {
        title: '恭喜！你已解锁 A10 最高段位',
        desc: '你已抵达财富等级图鉴的巅峰。',
      }
    } else {
      const mCents = monthlyCents
      const need = (target: number): number | null => monthsToReach(assetCents as number, mCents ?? 0, target)
      const goal = WEALTH_LEVELS[rank + 1].minCents
      const n = need(goal)
      missionVm = {
        title:
          mCents == null
            ? '设定每月储蓄，开启升级预测'
            : (mCents as number) === 0
              ? '还需要为冒险积累储蓄'
              : n != null && n > 600
                ? '目标很远，但旅程已经开始'
                : `前往 A${rank + 2} · 预计 ${readableMonths(n)}`,
        desc:
          `距离下一等级还差 ${formatMoneyCents(Math.max(goal - (assetCents as number), 0))}。` +
          (mCents == null
            ? '填写每月可存金额，查看成长路线。'
            : (mCents as number) === 0
              ? '月储蓄为 0，暂时无法预计升级时间。'
              : n != null && n > 600
                ? '按当前存钱速度，预计超过 50 年。'
                : n != null
                  ? `按每月存入 ${formatMoneyCents(mCents as number)} 计算，预计 ${formatYM(addMonthsYM(start, n))} 达成。`
                  : ''),
      }
      for (const item of candidateMilestoneCents(assetCents as number, rank + 1)) {
        const months = need(item.cents)
        milestoneCards.push({
          cap: item.isRank ? `✦ 解锁 A${levelIndexOf(item.cents)}` : '◇ 阶段性目标',
          amount: formatMoneyShortCents(item.cents),
          time: mCents == null ? '等待设置储蓄' : readableMonths(months),
          cls: milestoneCards.length === 0 ? 'featured' : '',
        })
      }
      for (let i = rank + 1; i <= MAX_LEVEL_INDEX - 1; i++) {
        const lv = WEALTH_LEVELS[i]
        const months = need(lv.minCents)
        routePoints.push({
          title: `${lv.code} · ${formatMoneyShortCents(lv.minCents)}`,
          time:
            mCents == null
              ? '等待设置月储蓄'
              : `${readableMonths(months)}${months != null && months <= 600 ? ` · ${formatYM(addMonthsYM(start, months))}` : ''}`,
        })
      }
    }

    /* ---------- 策略工坊：加速器 ---------- */
    const boostChips = EXTRA_CHIPS.map((v) => ({ label: `+${fmtNum(v, 0)}`, value: v, selected: extraVal === v }))
    let boostVm: BoostVm | null = null
    if (assetCents == null || monthlyVal == null) {
      boostVm = {
        metric: '输入资产与月储蓄',
        sub: '设置后查看加速结果',
        baseText: '--',
        boostText: '--',
        foot: '依据纯储蓄模型计算，不包含投资回报。',
      }
    } else if (rank === MAX_LEVEL_INDEX - 1) {
      boostVm = {
        metric: '最高段位已解锁',
        sub: '已经到达 A10',
        baseText: '已达成',
        boostText: '已达成',
        foot: '依据纯储蓄模型计算，不包含投资回报。',
      }
    } else if (boostTargetLv != null) {
      const target = boostTargetLv.minCents
      const base = monthlyCents != null && monthlyCents > 0 ? monthsToReach(assetCents, monthlyCents, target) : null
      const fastMonthly = (monthlyCents ?? 0) + extraCents
      const boost = fastMonthly > 0 ? monthsToReach(assetCents, fastMonthly, target) : null
      let metric = ''
      if (base == null && boost == null) metric = '仍需增加储蓄'
      else if (base == null && boost != null) metric = `加速后 ${readableMonths(boost)}`
      else if (base != null && base > 600 && boost != null && boost <= 600) metric = `加速后 ${readableMonths(boost)}`
      else if (boost == null) metric = '暂无可用预测'
      else if (base === boost) metric = '目前升级月份不变'
      else metric = `预计提前 ${readableMonths((base as number) - (boost as number))}`
      boostVm = {
        metric,
        sub: `挑战 ${boostTargetLv.code} · ${formatMoneyCents(target)}，每月多存 ${formatMoneyCents(extraCents)}`,
        baseText: readableMonths(base),
        boostText: readableMonths(boost),
        foot:
          base != null && boost != null && base <= 600 && boost <= 600
            ? `预计由 ${formatYM(addMonthsYM(start, base))} 提前至 ${formatYM(addMonthsYM(start, boost))}。`
            : '长期预测存在较大不确定性，仅供趣味参考。',
      }
    }

    /* ---------- 策略工坊：目标倒推 ---------- */
    let reverseVm: ReverseVm | null = null
    if (reverseTargetLv != null) {
      const target = reverseTargetLv.minCents
      const gapCents = Math.max(target - (assetCents ?? 0), 0)
      const goalYM: YM = {
        year: thisYear + Math.max(d.goalYearIdx, 0),
        month: d.goalMonthIdx + 1,
      }
      const n = (goalYM.year - start.year) * 12 + (goalYM.month - start.month)
      const gapZero = assetCents != null && gapCents === 0
      let metric = ''
      let sub = ''
      if (assetCents == null) {
        metric = '先设置当前资产'
        sub = '你的财富目标计划将展示在这里'
      } else if (rank === MAX_LEVEL_INDEX - 1) {
        metric = '最高段位已解锁'
        sub = '你已经站在 A10 之巅'
      } else if (gapZero) {
        metric = '目标已经达成'
        sub = '你已拥有达到该等级的资产'
      } else if (n <= 0) {
        metric = '请选择未来月份'
        sub = '目标时间应晚于起始月份'
      } else {
        const required = requiredMonthlyCents(assetCents, target, n)
        if (required == null) {
          metric = '请选择未来月份'
          sub = '目标时间应晚于起始月份'
        } else {
          metric = `${formatMoneyCents(required)} / 月`
          sub = `想在 ${formatYM(addMonthsYM(start, n))} 解锁 ${reverseTargetLv.code}，需要持续储蓄 ${n} 个月。`
        }
      }
      const requiredForFoot = n > 0 ? requiredMonthlyCents(assetCents ?? 0, target, n) : null
      const foot =
        monthlyCents == null
          ? '填写当前每月结余，可比较储蓄缺口。'
          : requiredForFoot != null && requiredForFoot <= monthlyCents
            ? '按当前储蓄速度，预计可以实现目标。'
            : requiredForFoot != null
              ? `相比目前每月储蓄，还需要多存 ${formatMoneyCents(requiredForFoot - monthlyCents)}。`
              : '日期按自然月计算。'
      reverseVm = {
        metric,
        sub,
        amountText: formatMoneyCents(target),
        gapText: formatMoneyCents(gapCents),
        foot,
      }
    }

    this.setData({
      extraValueText: `+ ${fmtNum(extraVal, 0)} 元`,
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
    })
    this.persist()
  },

  onScopePick(e: MiniEvent.PickerChange) {
    const i = Number(e.detail.value)
    this.setData({ scope: i === 1 ? '家庭' : '个人' })
    this.recompute()
  },

  onUnitPick(e: MiniEvent.PickerChange) {
    const to = Number(e.detail.value) === 1 ? 'yuan' : 'wan'
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

  onExplore() {
    const a = parseDraft(this.data.assetDraft)
    if (a == null) {
      tt.showToast({ title: '请输入有效的非负资产金额', icon: 'none' })
      return
    }
    this.recompute()
    const cents = toCents(this.data.unit === 'wan' ? a * 10000 : a) ?? 0
    const rank = levelIndexOf(cents)
    tt.showToast({ title: `恭喜！已解锁 A${rank} · ${RANK_NAMES[rank - 1]}`, icon: 'none' })
  },

  onStartYearPick(e: MiniEvent.PickerChange) {
    const i = Number(e.detail.value)
    this.setData({ startYearIdx: i >= 0 && i < this.data.yearLabels.length ? i : this.data.startYearIdx })
    this.recompute()
  },

  onStartMonthPick(e: MiniEvent.PickerChange) {
    const i = Number(e.detail.value)
    this.setData({ startMonthIdx: i >= 0 && i < 12 ? i : this.data.startMonthIdx })
    this.recompute()
  },

  onToggleRoute() {
    this.setData({ routeOpen: !this.data.routeOpen })
  },

  onTabTap(e: MiniEvent.Tap) {
    const v = String(e.currentTarget.dataset.tab ?? 'boost')
    this.setData({ tab: v === 'reverse' ? 'reverse' : 'boost' })
  },

  onBoostTargetPick(e: MiniEvent.PickerChange) {
    const i = Number(e.detail.value)
    this.setData({ boostTargetIdx: i >= 0 && i < this.data.targetOptions.length ? i : this.data.boostTargetIdx })
    this.recompute()
  },

  onReverseTargetPick(e: MiniEvent.PickerChange) {
    const i = Number(e.detail.value)
    this.setData({ reverseTargetIdx: i >= 0 && i < this.data.targetOptions.length ? i : this.data.reverseTargetIdx })
    this.recompute()
  },

  /** slider 拖动中与松手共用：实时更新结果（与设计稿 range input 行为一致） */
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

  onChipTap(e: MiniEvent.Tap) {
    const v = Number(e.currentTarget.dataset.extra ?? 0)
    if (!(v > 0)) return
    this.setData({ extraDraft: String(v), sliderVal: Math.min(v, 10000) })
    this.recompute()
  },

  onGoalYearPick(e: MiniEvent.PickerChange) {
    const i = Number(e.detail.value)
    this.setData({ goalYearIdx: i >= 0 && i < this.data.yearLabels.length ? i : this.data.goalYearIdx })
    this.recompute()
  },

  onGoalMonthPick(e: MiniEvent.PickerChange) {
    const i = Number(e.detail.value)
    this.setData({ goalMonthIdx: i >= 0 && i < 12 ? i : this.data.goalMonthIdx })
    this.recompute()
  },

  /** 设计稿 goalChip：目标日期 = 起始月 + N 年 */
  onGoalQuick(e: MiniEvent.Tap) {
    const years = Number(e.currentTarget.dataset.years ?? 0)
    if (!(years > 0)) return
    const target = addMonthsYM(
      { year: new Date().getFullYear() + this.data.startYearIdx, month: this.data.startMonthIdx + 1 },
      years * 12,
    )
    this.setData({
      goalYearIdx: target.year - new Date().getFullYear(),
      goalMonthIdx: target.month - 1,
    })
    this.recompute()
  },

  onTileTap(e: MiniEvent.Tap) {
    const i = Number(e.currentTarget.dataset.index ?? -1)
    if (!(i >= 0 && i < 10)) return
    const d = this.data
    const a = parseDraft(d.assetDraft)
    const assetCents = a == null ? null : toCents(d.unit === 'wan' ? a * 10000 : a)
    const lv = WEALTH_LEVELS[i]
    const req = lv.minCents
    const next = i < 9 ? WEALTH_LEVELS[i + 1].minCents : null
    const stateText =
      assetCents == null
        ? '尚未开始测算'
        : assetCents >= req
          ? '已解锁'
          : `还差 ${formatMoneyCents(req - assetCents)} 即可解锁`
    const lines = [
      `资产门槛：${formatMoneyCents(req)}${next != null ? ` 至低于 ${formatMoneyCents(next)}` : '及以上'}`,
      `当前状态：${stateText}`,
    ]
    if (assetCents != null && assetCents < req) {
      const m = parseDraft(d.monthlyDraft)
      const monthlyCents = m == null ? null : toCents(m)
      const months = monthlyCents != null && monthlyCents > 0
        ? monthsToReach(assetCents, monthlyCents, req)
        : null
      if (months != null) {
        const start: YM = { year: new Date().getFullYear() + d.startYearIdx, month: d.startMonthIdx + 1 }
        lines.push(
          `按当前储蓄计划：${readableMonths(months)}${months <= 600 ? `，预计 ${formatYM(addMonthsYM(start, months))} 达成` : ''}`,
        )
      }
    }
    lines.push('自定义趣味财富等级，非官方财富标准。')
    this.setData({
      modal: {
        title: `${lv.code} · ${RANK_NAMES[i]}`,
        code: lv.code,
        color: RANK_COLORS[i],
        lines,
      },
    })
  },

  onModalClose() {
    this.setData({ modal: null, showRules: false })
  },

  /** 阻止弹窗内容区点击冒泡到遮罩 */
  noop(): void {
    // noop
  },

  onRulesOpen() {
    this.setData({ showRules: true })
  },

  onRememberToggle() {
    const next = !this.data.saveLocal
    this.setData({ saveLocal: next })
    if (next) {
      this.persist()
      tt.showToast({ title: '已启用本机保存', icon: 'none' })
    } else {
      removeStore(PERSIST_KEY)
      tt.showToast({ title: '已关闭本机保存', icon: 'none' })
    }
  },

  onReset() {
    removeStore(PERSIST_KEY)
    this.setData({ ...initialData(), showRules: false, modal: null })
    tt.showToast({ title: '冒险档案已重置', icon: 'none' })
  },
})
