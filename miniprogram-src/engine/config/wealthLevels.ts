/**
 * 财富 A 级等级标准（单一配置来源：页面阶梯、进度、时间轴全部从这里取数）。
 *
 * 口径：
 *  - 可用资产 = 现金、存款、基金、股票等可支配金融净资产（扣除相关负债），
 *    不含自住房、汽车等非流动资产；
 *  - 左闭右开区间，A10 不设上限；
 *  - 自定义娱乐分级，并非官方财富等级标准。
 *
 * 单位约定：金额内部统一用「分」的整数（integer cents），避免 JS 浮点误差。
 */

export const CENTS_PER_YUAN = 100

export interface WealthLevel {
  /** 等级序号 1..10 */
  index: number
  /** 段位代号，如 'A6' */
  code: string
  /** 通俗理解，如 '十万元级资产' */
  label: string
  /** 下限（分，含） */
  minCents: number
  /** 上限（分，不含）；A10 为 null（不设上限） */
  maxCents: number | null
  /** 徽章主色 */
  color: string
  /** 徽章浅底色（用于阶梯/时间轴的柔和背景） */
  soft: string
}

const YUAN_THRESHOLDS = [10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000]

/** 徽章配色按需求文档：蓝→青→青绿→草绿→金黄→橙→红→玫红→紫→深蓝金属 */
const LEVEL_COLORS: { color: string; soft: string }[] = [
  { color: '#3B82F6', soft: '#E8F1FE' }, // A1 蓝
  { color: '#06B6D4', soft: '#E1F7FB' }, // A2 青
  { color: '#14B8A6', soft: '#E1F6F2' }, // A3 青绿
  { color: '#65A30D', soft: '#EFF7E1' }, // A4 草绿
  { color: '#CA8A04', soft: '#FBF3DC' }, // A5 金黄
  { color: '#EA580C', soft: '#FDEEE1' }, // A6 橙
  { color: '#DC2626', soft: '#FDE5E5' }, // A7 红
  { color: '#E11D48', soft: '#FCE3EA' }, // A8 玫红
  { color: '#9333EA', soft: '#F3E8FD' }, // A9 紫
  { color: '#1E3A8A', soft: '#E4EAFB' }, // A10 深蓝
]

const LEVEL_LABELS = [
  '起步阶段',
  '十元级资产',
  '百元级资产',
  '千元级资产',
  '万元级资产',
  '十万元级资产',
  '百万元级资产',
  '千万元级资产',
  '亿元级资产',
  '十亿元级资产',
]

function buildLevels(): WealthLevel[] {
  return LEVEL_LABELS.map((label, i) => {
    const minCents = i === 0 ? 0 : YUAN_THRESHOLDS[i - 1] * CENTS_PER_YUAN
    const maxCents = i < 9 ? YUAN_THRESHOLDS[i] * CENTS_PER_YUAN : null
    return {
      index: i + 1,
      code: `A${i + 1}`,
      label,
      minCents,
      maxCents,
      color: LEVEL_COLORS[i].color,
      soft: LEVEL_COLORS[i].soft,
    }
  })
}

export const WEALTH_LEVELS: WealthLevel[] = buildLevels()

export const MAX_LEVEL_INDEX = 10

/** 中间里程碑比例（相对下一级门槛）：如 A6（门槛 100 万）→ 20/30/50/80 万 */
export const MILESTONE_FACTORS = [0.2, 0.3, 0.5, 0.8]

/** 从该等级起展示中间里程碑（A1–A4 跨度小，不展示） */
export const MILESTONE_FROM_INDEX = 5

/** 超过 50 年（600 个月）统一显示「超过 50 年」 */
export const HORIZON_MONTHS = 600

/** 输入上限：资产 10 万亿元、月储蓄 10 亿元，超出按非法处理 */
export const MAX_ASSET_YUAN = 1e13
export const MAX_MONTHLY_YUAN = 1e9

/** 段位称号（与 docs/wealth.html 设计稿一致） */
export const RANK_NAMES = [
  '起步冒险者',
  '微光收集者',
  '初阶探索者',
  '积累学徒',
  '财富新秀',
  '进阶积累者',
  '百万领航者',
  '千万征服者',
  '亿元传奇',
  '财富巅峰',
]

/** 段位简称（设计稿 small 标签） */
export const RANK_SHORT_LABELS = [
  '起步阶段',
  '十元级',
  '百元级',
  '千元级',
  '万元级',
  '十万元级',
  '百万元级',
  '千万元级',
  '亿元级',
  '十亿元级',
]

/** 段位主色（设计稿 rank-path 徽章色，1:1 对应 A1–A10） */
export const RANK_COLORS = [
  '#71a8fa',
  '#4fc8ec',
  '#56d1c5',
  '#8fc563',
  '#e6b65a',
  '#ff9258',
  '#ef677b',
  '#db69be',
  '#ad79f7',
  '#6fa4ff',
]
