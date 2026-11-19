/**
 * 财富 A 级测算：测段位 → 看升级进度 → 预测升级时间 → 探索加速方案。
 *
 * 交互约定（需求文档）：
 *  - 渐进式四步：资产输入 → 等级/进度/阶梯 → 月存解锁时间轴 → 加速器与目标倒推（Tab）；
 *  - 所有模块共享同一份输入，修改后全部结果自动联动；
 *  - 隐私：默认仅保存在当前页面会话（sessionStorage），
 *    用户主动开启「在本机保存」后才写入 localStorage，可一键清除。
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useToday } from '../hooks/useToday'
import { ToolShell } from '../components/toolbox/ToolShell'
import { CheckRow, Field, MiniResult, NoteBlock, NumberField, Segmented } from '../components/toolbox/kit'
import { loadJSON, removeKey, saveJSON } from '../utils/storage'
import { fmtNum } from '../utils/money'
import {
  MAX_ASSET_YUAN,
  MAX_LEVEL_INDEX,
  MAX_MONTHLY_YUAN,
  WEALTH_LEVELS,
  type WealthLevel,
} from '../config/wealthLevels'
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
} from '../utils/wealthCalculator'
import type { YMD } from '../utils/dateMath'

/* ================= 状态（会话内共享，可选本机保存） ================= */

type Scope = 'personal' | 'family'

interface WealthState {
  scope: Scope
  /** 当前可用资产（数值随 unit 变化） */
  asset: number | null
  unit: 'yuan' | 'wan'
  /** 每月可存金额（元） */
  monthly: number | null
  /** 时间轴起始月（默认当前月） */
  startYear: number
  startMonth: number
  /** 加速器/目标倒推共享的目标等级（1..10；null = 自动取下一级） */
  targetIdx: number | null
  /** 加速器：每月额外储蓄（元） */
  extraMonthly: number | null
  /** 目标倒推：目标年月 */
  goalYear: number | null
  goalMonth: number | null
  saveLocal: boolean
  /** 已点击「测测我的财富等级」 */
  measured: boolean
}

const STORAGE_KEY = 'wealth.v1'
const SESSION_KEY = 'toolbox.wealth.v1.session'

function defaultState(today: YMD): WealthState {
  return {
    scope: 'personal',
    asset: null,
    unit: 'wan',
    monthly: null,
    startYear: today.year,
    startMonth: today.month,
    targetIdx: null,
    extraMonthly: null,
    goalYear: null,
    goalMonth: null,
    saveLocal: false,
    measured: false,
  }
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && isFinite(v) && v >= 0 ? v : null

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)

/** 宽容地恢复历史状态：非法字段一律回落默认值，绝不让 NaN/Infinity 进入渲染 */
function hydrate(raw: unknown, today: YMD): WealthState {
  const d = defaultState(today)
  if (!raw || typeof raw !== 'object') return d
  const s = raw as Record<string, unknown>
  const year = typeof s.startYear === 'number' && s.startYear >= today.year && s.startYear <= today.year + 80
    ? Math.round(s.startYear) : d.startYear
  const month = typeof s.startMonth === 'number' && s.startMonth >= 1 && s.startMonth <= 12
    ? Math.round(s.startMonth) : d.startMonth
  return {
    scope: s.scope === 'family' ? 'family' : 'personal',
    asset: num(s.asset),
    unit: s.unit === 'yuan' ? 'yuan' : 'wan',
    monthly: num(s.monthly),
    startYear: year,
    startMonth: month,
    targetIdx: typeof s.targetIdx === 'number' && s.targetIdx >= 1 && s.targetIdx <= 10 ? Math.round(s.targetIdx) : null,
    extraMonthly: num(s.extraMonthly),
    goalYear: typeof s.goalYear === 'number' && s.goalYear >= today.year && s.goalYear <= today.year + 80
      ? Math.round(s.goalYear) : null,
    goalMonth: typeof s.goalMonth === 'number' && s.goalMonth >= 1 && s.goalMonth <= 12 ? Math.round(s.goalMonth) : null,
    saveLocal: bool(s.saveLocal, false),
    measured: bool(s.measured, false) && num(s.asset) != null,
  }
}

function loadInitial(today: YMD): WealthState {
  const local = loadJSON<unknown>(STORAGE_KEY, null)
  if (local != null && (local as WealthState).saveLocal === true) {
    return hydrate(local, today)
  }
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) return hydrate(JSON.parse(raw), today)
  } catch {
    // sessionStorage 不可用（隐私模式等）：退化为纯内存
  }
  return defaultState(today)
}

/* ================= 徽章 ================= */

function badgeBackground(level: WealthLevel): CSSProperties {
  // A10：深蓝 + 金属光泽，更有仪式感
  if (level.index === MAX_LEVEL_INDEX) {
    return { background: 'linear-gradient(135deg, #172554 0%, #1E3A8A 40%, #3B5BD9 72%, #C9A23C 100%)' }
  }
  return { background: `linear-gradient(135deg, ${level.color} 0%, ${level.color}C4 100%)` }
}

function LevelBadge({ level, size = 'md' }: { level: WealthLevel; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'h-24 w-24 text-[30px]' : size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-14 w-14 text-lg'
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-[0_4px_14px_rgba(33,30,46,0.22)] ring-2 ring-white/60 ${dim}`}
      style={badgeBackground(level)}
      aria-label={`财富段位 ${level.code}`}
    >
      {level.code}
    </div>
  )
}

/* ================= 时间轴节点 ================= */

interface TimelineNode {
  kind: 'level' | 'milestone' | 'now'
  level?: WealthLevel
  /** 门槛 / 里程碑金额（分） */
  cents: number
  months: number | null
  date: YM | null
  beyond: boolean
}

function TimelineRow({ node, index }: { node: TimelineNode; index: number }) {
  const isNow = node.kind === 'now'
  const isMilestone = node.kind === 'milestone'
  const level = node.level
  const color = level?.color ?? '#6D5BF6'
  const soft = level?.soft ?? '#F1EFFB'

  return (
    <li
      className="fade-in relative flex gap-3 pb-4 motion-reduce:transition-none"
      style={{ animationDelay: `${Math.min(index * 70, 700)}ms` }}
    >
      {/* 左侧轴 */}
      <div className="flex flex-col items-center">
        {isNow || !isMilestone ? (
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white shadow-md ${isNow ? 'text-[13px]' : 'text-sm'}`}
            style={level ? badgeBackground(level) : { background: color }}
          >
            {isNow ? '现在' : (level?.code ?? '')}
          </div>
        ) : (
          <div className="mt-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-2" style={{ background: '#fff', borderColor: color, boxShadow: `0 0 0 2px ${color}55` }}>
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          </div>
        )}
        <div className="mt-1 w-[2px] flex-1 rounded-full" style={{ background: `${color}44` }} />
      </div>

      {/* 右侧内容 */}
      <div className={`mb-1 min-w-0 flex-1 rounded-2xl border px-3.5 py-3 ${isNow ? 'border-[#D8D2F5] bg-[#F7F6FF]' : isMilestone ? 'border-dashed border-[#E4E1EE] bg-white' : 'border-[#ECEAF2] bg-white'}`}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 text-[13px] font-semibold text-tb-ink">
            {isNow ? '当前所在' : isMilestone ? `里程碑 · ${formatMoneyCents(node.cents)}` : `${level?.code} ${level?.label}`}
            {!isNow && !isMilestone && (
              <span className="ml-1.5 font-normal text-tb-faint">门槛 {formatMoneyCents(node.cents)}</span>
            )}
          </div>
          {isNow ? (
            <span className="shrink-0 rounded-full bg-[#EEEBFB] px-2.5 py-0.5 text-xs font-medium text-[#5B4BE0]">起点</span>
          ) : (
            <span className="num shrink-0 text-xs text-tb-sub">
              {node.months != null
                ? node.beyond
                  ? '超过 50 年'
                  : `${formatYM(node.date as YM)} · ${formatDurationCN(node.months)}后`
                : '—'}
            </span>
          )}
        </div>
        {!isNow && !isMilestone && (
          <div className="mt-1 text-xs leading-relaxed text-tb-faint">
            {node.beyond
              ? '需累计储蓄超过 50 年，暂无法给出预计达成时间'
              : `需累计储蓄 ${formatDurationCN(node.months as number)}`}
          </div>
        )}
      </div>
    </li>
  )
}

/* ================= 页面 ================= */

export default function WealthPage() {
  const today = useToday()
  const [state, setState] = useState<WealthState>(() => loadInitial(today))
  const [ladderIdx, setLadderIdx] = useState<number | null>(null)
  const [showTimeline, setShowTimeline] = useState(false)
  const [tab, setTab] = useState<'accel' | 'goal'>('accel')

  // 会话内始终保存；用户开启「在本机保存」后额外写入 localStorage，关闭即清除
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
    } catch {
      // 隐私模式等：静默降级为纯内存
    }
    if (state.saveLocal) saveJSON(STORAGE_KEY, state)
    else removeKey(STORAGE_KEY)
  }, [state])

  const patch = (p: Partial<WealthState>) => setState((prev) => ({ ...prev, ...p }))

  const handleReset = () => {
    setState(defaultState(today))
    setLadderIdx(null)
    setShowTimeline(false)
    setTab('accel')
    removeKey(STORAGE_KEY)
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // noop
    }
  }

  /* ---------- 共享派生数据 ---------- */

  const assetYuan = state.asset == null ? null : state.unit === 'wan' ? state.asset * 10000 : state.asset
  const assetError =
    state.asset == null
      ? '请输入当前可用资产'
      : (assetYuan as number) > MAX_ASSET_YUAN
        ? '金额超出测算范围（上限 10 万亿元），请检查数字或单位'
        : null
  const assetCents = assetYuan == null ? null : toCents(assetYuan)

  const monthlyInvalid = state.monthly != null && state.monthly > MAX_MONTHLY_YUAN
  const monthlyCents = monthlyInvalid ? null : state.monthly == null ? null : toCents(state.monthly)
  const hasMonthly = monthlyCents != null && monthlyCents > 0

  const progress = assetCents != null ? buildLevelProgress(assetCents) : null
  const curIdx = assetCents != null ? levelIndexOf(assetCents) : null
  const curLevel = curIdx != null ? levelByIndex(curIdx) : null
  const nextLevel = curIdx != null && curIdx < MAX_LEVEL_INDEX ? levelByIndex(curIdx + 1) : null

  // 目标等级：手动选择仍有效则保留，否则自动回落到下一个未达成等级
  const targetIdx =
    curIdx != null && curIdx < MAX_LEVEL_INDEX
      ? state.targetIdx != null && state.targetIdx > curIdx
        ? state.targetIdx
        : curIdx + 1
      : null
  const targetAdjusted = curIdx != null && state.targetIdx != null && state.targetIdx <= curIdx
  const targetLevel = targetIdx != null ? levelByIndex(targetIdx) : null

  const viewAsset = (cents: number): string => formatMoneyCents(cents)

  /* ---------- 时间轴 ---------- */

  const timelineNodes = useMemo<TimelineNode[]>(() => {
    if (curIdx == null || assetCents == null || curIdx >= MAX_LEVEL_INDEX) return []
    const start: YM = { year: state.startYear, month: state.startMonth }
    const nodes: TimelineNode[] = [
      { kind: 'now', cents: assetCents, months: 0, date: start, beyond: false },
    ]
    // 当前等级内的中间里程碑（A5+ 才有）
    for (const m of milestonesAhead(assetCents, curIdx)) {
      const months = hasMonthly ? monthsToReach(assetCents, monthlyCents as number, m) : null
      nodes.push({
        kind: 'milestone',
        cents: m,
        months,
        date: months != null ? addMonthsYM(start, months) : null,
        beyond: months != null && isBeyondHorizon(months),
      })
    }
    for (let idx = curIdx + 1; idx <= MAX_LEVEL_INDEX; idx++) {
      const lv = levelByIndex(idx)
      const months = hasMonthly ? monthsToReach(assetCents, monthlyCents as number, lv.minCents) : null
      nodes.push({
        kind: 'level',
        level: lv,
        cents: lv.minCents,
        months,
        date: months != null ? addMonthsYM(start, months) : null,
        beyond: months != null && isBeyondHorizon(months),
      })
    }
    return nodes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curIdx, assetCents, state.startYear, state.startMonth, monthlyCents, hasMonthly, showTimeline])

  /* ---------- 加速器 ---------- */

  const accel = useMemo(() => {
    if (assetCents == null || targetLevel == null) return null
    const base = hasMonthly ? monthsToReach(assetCents, monthlyCents as number, targetLevel.minCents) : null
    const extraCents = state.extraMonthly == null || state.extraMonthly <= 0 ? 0 : toCents(state.extraMonthly) ?? 0
    const fastMonthly = (monthlyCents ?? 0) + extraCents
    const fast = fastMonthly > 0 ? monthsToReach(assetCents, fastMonthly, targetLevel.minCents) : null
    return { base, fast, extraCents, fastMonthly }
  }, [assetCents, targetLevel, monthlyCents, hasMonthly, state.extraMonthly])

  /* ---------- 目标倒推 ---------- */

  const goal = useMemo(() => {
    if (assetCents == null || targetLevel == null || state.goalYear == null || state.goalMonth == null) return null
    const goalYM: YM = { year: state.goalYear, month: state.goalMonth }
    const months = monthsBetweenYM({ year: today.year, month: today.month }, goalYM)
    const required = months > 0 ? requiredMonthlyCents(assetCents, targetLevel.minCents, months) : null
    return { goalYM, months, required }
  }, [assetCents, targetLevel, state.goalYear, state.goalMonth, today])

  const goalQuick = (nMonths: number) => {
    const ym = addMonthsYM({ year: today.year, month: today.month }, nMonths)
    patch({ goalYear: ym.year, goalMonth: ym.month })
  }

  const switchUnit = (u: 'yuan' | 'wan') => {
    if (u === state.unit) return
    const converted = state.asset == null ? null : u === 'yuan' ? state.asset * 10000 : state.asset / 10000
    patch({ unit: u, asset: converted })
  }

  const handleMeasure = () => {
    if (assetError != null) return
    patch({ measured: true })
    setLadderIdx(curIdx)
  }

  const ladderDetail = ladderIdx != null ? levelByIndex(ladderIdx) : null

  /* ================= 渲染 ================= */

  return (
    <ToolShell
      icon="🏆"
      title="财富 A 级测算"
      desc="测测你的财富段位，看看多久能升级。"
      onReset={handleReset}
    >
      <div className="space-y-4">
        {/* 第一步：资产输入 */}
        <div className="tb-card space-y-3.5 p-4">
          <Field label="统计对象">
            <Segmented<Scope>
              value={state.scope}
              onChange={(v) => patch({ scope: v })}
              options={[
                { value: 'personal', label: '个人' },
                { value: 'family', label: '家庭' },
              ]}
            />
          </Field>
          <Field
            label="当前可用资产"
            hint="现金、存款、基金、股票等可支配金融净资产（扣除相关负债），不含自住房、汽车等非流动资产"
          >
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <NumberField
                  value={state.asset}
                  onChange={(v) => patch({ asset: v })}
                  placeholder={state.unit === 'wan' ? '如 18' : '如 180000'}
                  invalid={state.asset != null && assetError != null}
                  suffix={state.unit === 'wan' ? '万元' : '元'}
                />
              </div>
              <Segmented<'yuan' | 'wan'>
                value={state.unit}
                onChange={switchUnit}
                options={[
                  { value: 'wan', label: '万元' },
                  { value: 'yuan', label: '元' },
                ]}
              />
            </div>
            {state.asset != null && assetError != null && (
              <p className="mt-1.5 text-xs text-tb-neg">{assetError}</p>
            )}
          </Field>
          <button
            type="button"
            disabled={state.asset == null || assetError != null}
            className="tb-btn-primary w-full rounded-xl py-3 text-[15px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleMeasure}
          >
            测测我的财富等级
          </button>
        </div>

        {/* 第二步：等级 + 进度 + 阶梯 */}
        {state.measured && progress && curLevel && assetCents != null && (
          <>
            <div className="tb-card tb-pop p-5">
              <div className="flex items-center gap-4">
                <LevelBadge level={curLevel} size="lg" />
                <div className="min-w-0">
                  <div className="text-xs text-tb-sub">我的财富段位</div>
                  <div className="num mt-0.5 text-[28px] font-bold leading-tight tracking-tight text-tb-ink">
                    {curLevel.code}
                    <span className="ml-2 text-sm font-medium text-tb-sub">{viewAsset(assetCents)}</span>
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-tb-faint">
                    {state.scope === 'family' ? '家庭' : '个人'}口径 · {curLevel.label}
                  </div>
                </div>
              </div>

              {progress.next && progress.progress != null ? (
                <div className="mt-4 border-t border-[#F0EEF6] pt-4">
                  <div className="flex items-center justify-between text-xs text-tb-sub">
                    <span>升级进度（{curLevel.code} → {progress.next.code}）</span>
                    <span className="num font-semibold" style={{ color: curLevel.color }}>
                      {(progress.progress * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#F1EFF8]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(progress.progress * 100, 1.5)}%`,
                        background: `linear-gradient(90deg, ${curLevel.color}99, ${curLevel.color})`,
                      }}
                    />
                  </div>
                  <div className="num mt-2.5 grid grid-cols-3 gap-2 text-center text-xs text-tb-faint">
                    <div>
                      <div className="text-tb-sub">{curLevel.code} 起点</div>
                      <div className="mt-0.5 font-medium text-tb-ink">{viewAsset(curLevel.minCents)}</div>
                    </div>
                    <div>
                      <div className="text-tb-sub">{progress.next.code} 门槛</div>
                      <div className="mt-0.5 font-medium text-tb-ink">{viewAsset(progress.next.minCents)}</div>
                    </div>
                    <div>
                      <div className="text-tb-sub">距离 {progress.next.code}</div>
                      <div className="mt-0.5 font-medium text-tb-ink">{viewAsset(progress.gapCents)}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-[#C9A23C55] bg-gradient-to-br from-[#FBF6E8] to-[#FDFBF4] px-3.5 py-3 text-center text-[13px] font-semibold text-[#8A6D14]">
                  🏆 已解锁最高财富段位 {curLevel.code}（{curLevel.label}）
                </div>
              )}
            </div>

            {/* 财富阶梯 */}
            <div className="tb-card p-4">
              <div className="mb-3 text-[13px] font-medium text-tb-ink">财富阶梯（点击查看门槛）</div>
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {WEALTH_LEVELS.map((lv) => {
                  const reached = curIdx != null && lv.index < curIdx
                  const isCur = curIdx === lv.index
                  const selected = ladderIdx === lv.index
                  return (
                    <button
                      key={lv.code}
                      type="button"
                      onClick={() => setLadderIdx(lv.index)}
                      className={`relative flex flex-col items-center gap-1 rounded-xl border px-1 py-2 transition ${
                        isCur
                          ? 'border-transparent bg-gradient-to-b from-white to-[#F7F5FF] shadow-md ring-2'
                          : selected
                            ? 'border-[#B9AEF3] bg-white'
                            : 'border-[#ECEAF2] bg-white hover:border-[#D8D2F5]'
                      }`}
                      style={isCur ? ({ '--tw-ring-color': lv.color } as CSSProperties) : undefined}
                      aria-pressed={selected}
                    >
                      <LevelBadge level={lv} size="sm" />
                      <span className="num text-[10px] leading-none text-tb-faint sm:text-[11px]">{lv.code}</span>
                      <span className="absolute right-0.5 top-0.5 text-[9px] leading-none">
                        {isCur ? '⭐' : reached ? '✅' : '🔒'}
                      </span>
                    </button>
                  )
                })}
              </div>
              {ladderDetail && (
                <div className="fade-in mt-3 rounded-xl border border-[#ECEAF2] bg-[#FBFAFF] px-3.5 py-2.5 text-xs leading-relaxed text-tb-sub">
                  <span className="font-semibold text-tb-ink">{ladderDetail.code} · {ladderDetail.label}</span>
                  <span className="num ml-2">
                    {viewAsset(ladderDetail.minCents)} — {ladderDetail.maxCents != null ? viewAsset(ladderDetail.maxCents) : '无上限'}
                  </span>
                  {curIdx != null && (
                    <span className="ml-2">
                      {ladderDetail.index < curIdx ? '（已解锁）' : ladderDetail.index === curIdx ? '（当前所在）' : '（未解锁）'}
                    </span>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* 第三步：升级时间轴 */}
        {state.measured && curIdx != null && assetCents != null && (
          <div className="tb-card p-4">
            <div className="mb-3 text-[13px] font-medium text-tb-ink">财富升级时间轴</div>
            {curIdx >= MAX_LEVEL_INDEX ? (
              <NoteBlock>你已站在 A10 之巅，这条时间轴只属于下一个挑战者 🎉</NoteBlock>
            ) : (
              <>
                <div className="space-y-3">
                  <Field label="每月可存金额" hint="扣除生活开支、贷款还款等支出后的实际结余">
                    <NumberField
                      value={state.monthly}
                      onChange={(v) => patch({ monthly: v })}
                      placeholder="如 5000"
                      invalid={monthlyInvalid}
                      suffix="元 / 月"
                    />
                  </Field>
                  {monthlyInvalid && (
                    <p className="text-xs text-tb-neg">月储蓄金额超出测算范围（上限 10 亿元 / 月），请检查</p>
                  )}
                  <Field label="起始月份" hint="第一笔新增储蓄发生在下一个月底">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className="tb-input num"
                        value={state.startYear}
                        onChange={(e) => patch({ startYear: Number(e.target.value) })}
                        aria-label="起始年份"
                      >
                        {Array.from({ length: 81 }, (_, i) => today.year + i).map((y) => (
                          <option key={y} value={y}>{y} 年</option>
                        ))}
                      </select>
                      <select
                        className="tb-input num"
                        value={state.startMonth}
                        onChange={(e) => patch({ startMonth: Number(e.target.value) })}
                        aria-label="起始月份"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <option key={m} value={m}>{m} 月</option>
                        ))}
                      </select>
                    </div>
                  </Field>
                  {!showTimeline && (
                    <button
                      type="button"
                      className="tb-btn-primary w-full rounded-xl py-3 text-[15px] font-semibold transition"
                      onClick={() => setShowTimeline(true)}
                    >
                      生成我的财富升级路线
                    </button>
                  )}
                </div>

                {showTimeline && (
                  state.monthly == null ? (
                    <NoteBlock tone="warn" key="need-monthly">请先填写每月可存金额，才能生成升级路线</NoteBlock>
                  ) : monthlyCents == null || monthlyCents <= 0 ? (
                    <NoteBlock tone="warn" key="zero-monthly">
                      {monthlyInvalid
                        ? '月储蓄金额超出测算范围，请修改后重试'
                        : '每月可存 0 元，无法通过当前储蓄方式升级——先攒出第一笔结余吧'}
                    </NoteBlock>
                  ) : (
                    <ul key="timeline" className="mt-4 list-none">
                      {timelineNodes.map((node, i) => (
                        <TimelineRow key={`${node.kind}-${node.cents}-${i}`} node={node} index={i} />
                      ))}
                    </ul>
                  )
                )}
              </>
            )}
          </div>
        )}

        {/* 第四步：加速器 / 目标倒推（Tab） */}
        {state.measured && targetLevel && assetCents != null && (
          <div className="tb-card p-4">
            <Segmented<'accel' | 'goal'>
              value={tab}
              onChange={setTab}
              options={[
                { value: 'accel', label: '⚡ 升级加速器' },
                { value: 'goal', label: '🎯 目标倒推' },
              ]}
            />

            {targetAdjusted && (
              <NoteBlock>你之前选择的目标等级已经达成，已自动切换到下一个未达成等级（{targetLevel.code}）</NoteBlock>
            )}

            <div className="mt-3 space-y-3">
              <Field label="目标等级">
                <select
                  className="tb-input"
                  value={targetIdx ?? ''}
                  onChange={(e) => patch({ targetIdx: Number(e.target.value) })}
                >
                  {WEALTH_LEVELS.filter((lv) => curIdx != null && lv.index > curIdx).map((lv) => (
                    <option key={lv.code} value={lv.index}>
                      {lv.code} · {lv.label}（{formatMoneyCents(lv.minCents)}）
                    </option>
                  ))}
                </select>
              </Field>

              {tab === 'accel' ? (
                <>
                  <Field label="每月额外储蓄" hint="滑块快捷刻度 0 / 500 / 1000 / 2000 / 3000 / 5000 / 10000，也可手动输入其他金额">
                    <input
                      type="range"
                      min={0}
                      max={10000}
                      step={500}
                      value={Math.min(state.extraMonthly ?? 0, 10000)}
                      onChange={(e) => patch({ extraMonthly: Number(e.target.value) })}
                      className="w-full accent-[#6D5BF6]"
                      aria-label="每月额外储蓄（元）"
                    />
                    <div className="mt-2">
                      <NumberField
                        value={state.extraMonthly}
                        onChange={(v) => patch({ extraMonthly: v })}
                        placeholder="额外每月多存多少"
                        suffix="元 / 月"
                      />
                    </div>
                  </Field>

                  {accel == null || (accel.base == null && accel.fast == null) ? (
                    <NoteBlock tone="warn">请先填写每月可存金额，或设置每月额外储蓄金额</NoteBlock>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <MiniResult
                          label="原计划"
                          value={accel.base == null ? '—' : isBeyondHorizon(accel.base) ? '超过 50 年' : formatDurationCN(accel.base)}
                          sub={`每月存 ${fmtNum((monthlyCents ?? 0) / 100, 0)} 元`}
                        />
                        <MiniResult
                          label="加速计划"
                          value={accel.fast == null ? '—' : isBeyondHorizon(accel.fast) ? '超过 50 年' : formatDurationCN(accel.fast)}
                          sub={`每月存 ${fmtNum(accel.fastMonthly / 100, 0)} 元`}
                        />
                      </div>
                      {(accel.extraCents ?? 0) <= 0 ? (
                        <NoteBlock>拖动滑块或输入每月额外储蓄，看看能提前多久升级</NoteBlock>
                      ) : accel.base != null && accel.fast != null && !isBeyondHorizon(accel.base) && !isBeyondHorizon(accel.fast) ? (
                        <div className="tb-pop rounded-xl border border-[#C9A23C55] bg-gradient-to-br from-[#FBF6E8] to-[#FDFBF4] px-3.5 py-3 text-center text-[13px] font-semibold text-[#8A6D14]">
                          每月多存 {fmtNum(accel.extraCents / 100, 0)} 元，预计提前 {formatDurationCN(accel.base - accel.fast)} 升级 {targetLevel.code}
                        </div>
                      ) : accel.base != null && isBeyondHorizon(accel.base) && accel.fast != null && !isBeyondHorizon(accel.fast) ? (
                        <div className="tb-pop rounded-xl border border-[#C9A23C55] bg-gradient-to-br from-[#FBF6E8] to-[#FDFBF4] px-3.5 py-3 text-center text-[13px] font-semibold text-[#8A6D14]">
                          原计划超过 50 年；加速后预计 {formatDurationCN(accel.fast)} 可达成 {targetLevel.code}
                        </div>
                      ) : (
                        <NoteBlock tone="warn">
                          {accel.fast != null && isBeyondHorizon(accel.fast)
                            ? `按每月 ${fmtNum(accel.fastMonthly / 100, 0)} 元仍超过 50 年，建议继续提高每月储蓄`
                            : '请先填写原计划的每月可存金额，才能对比提前时间'}
                        </NoteBlock>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <Field label="目标达成日期" hint="想在什么时候站上这个门槛">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className="tb-input num"
                        value={state.goalYear ?? ''}
                        onChange={(e) => patch({ goalYear: Number(e.target.value) })}
                        aria-label="目标年份"
                      >
                        <option value="" disabled>选择年份</option>
                        {Array.from({ length: 61 }, (_, i) => today.year + i).map((y) => (
                          <option key={y} value={y}>{y} 年</option>
                        ))}
                      </select>
                      <select
                        className="tb-input num"
                        value={state.goalMonth ?? ''}
                        onChange={(e) => patch({ goalMonth: Number(e.target.value) })}
                        aria-label="目标月份"
                      >
                        <option value="" disabled>选择月份</option>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <option key={m} value={m}>{m} 月</option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        { label: '3 年后', m: 36 },
                        { label: '5 年后', m: 60 },
                        { label: '10 年后', m: 120 },
                      ].map((q) => (
                        <button
                          key={q.label}
                          type="button"
                          onClick={() => goalQuick(q.m)}
                          className="rounded-full border border-[#E4E1EE] bg-white px-3 py-1 text-xs text-tb-sub transition hover:border-[#C9C2F2] hover:text-tb-primary"
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {goal == null ? (
                    <NoteBlock>选择目标年月后，算算每月需要存多少钱</NoteBlock>
                  ) : goal.months <= 0 || goal.required == null ? (
                    <NoteBlock tone="warn">目标日期无效或已过去，请重新选择一个晚于本月的日期</NoteBlock>
                  ) : (
                    <>
                      <div className="tb-card tb-pop -mx-0.5 space-y-0 border-0 bg-transparent p-0 shadow-none">
                        <div className="grid grid-cols-2 gap-3">
                          <MiniResult label="目标门槛" value={formatMoneyCents(targetLevel.minCents)} sub={`${targetLevel.code} · ${targetLevel.label}`} />
                          <MiniResult label="资产差额" value={formatMoneyCents(Math.max(targetLevel.minCents - assetCents, 0))} sub={`当前 ${formatMoneyCents(assetCents)}`} />
                          <MiniResult label="目标达成" value={formatYM(goal.goalYM)} sub={`距今 ${formatDurationCN(goal.months)}`} />
                          <MiniResult
                            label="每月最低需存"
                            value={`${fmtNum(goal.required / 100, 0)} 元`}
                            sub={`按 ${goal.months} 个月向上取整至元`}
                          />
                        </div>
                      </div>
                      <div className="tb-pop rounded-xl border border-[#E2DDFB] bg-[#F4F2FF] px-3.5 py-3 text-center text-[13px] font-semibold text-[#4C3FD0]">
                        {(() => {
                          const cur = monthlyCents ?? 0
                          const diff = Math.max(goal.required - cur, 0)
                          return diff > 0
                            ? `比目前每月需多存 ${fmtNum(diff / 100, 0)} 元`
                            : '按目前的月储蓄计划，届时可以达标'
                        })()}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* 隐私与保存 */}
        <div className="tb-card space-y-3 p-4">
          <CheckRow
            checked={state.saveLocal}
            onClick={() => patch({ saveLocal: !state.saveLocal })}
            label="在本机保存（下次打开自动恢复，仅存浏览器本地）"
          />
          <NoteBlock tone="warn">
            所有金额均在本地计算，不会上传。测算在本地完成，不上传你的资产信息；开启「在本机保存」前，输入仅保存在当前页面会话中。
          </NoteBlock>
        </div>

        {/* 规则说明 */}
        <div className="tb-card space-y-2.5 p-4">
          <div className="text-[13px] font-medium text-tb-ink">规则说明</div>
          <NoteBlock>财富 A 级按照资产数量级划分（左闭右开区间），仅供趣味测算，并非官方财富等级标准。</NoteBlock>
          <NoteBlock>可用资产指现金、存款、基金、股票等可支配金融净资产，不含自住房产等非流动资产。</NoteBlock>
          <NoteBlock>
            升级时间按照当前资产及每月固定储蓄计算（每月底存入一次，不计投资收益、通货膨胀、收入变化及意外支出），结果仅供参考。
          </NoteBlock>
          <NoteBlock>超过 50 年的预测统一显示「超过 50 年」；中间里程碑不改变正式 A 级等级。</NoteBlock>
        </div>
      </div>
    </ToolShell>
  )
}
