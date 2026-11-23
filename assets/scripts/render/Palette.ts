/**
 * 全局色板：阵营色、地形分级色、UI 主题色。
 * 冷青阴影 + 暖橙高光的电影化军事分级。
 */

export const FactionColor = {
    west:  { r: 46,  g: 125, b: 225, a: 255 },  // 蓝
    east:  { r: 226, g: 60,  b: 60,  a: 255 },  // 红
    south: { r: 232, g: 179, b: 58,  a: 255 },  // 黄
} as const;

export const FactionTint = FactionColor;

export const FactionName = ['west', 'east', 'south'] as const;
export type FactionId = typeof FactionName[number];

/** 地形顶点色：草 / 土 / 岩 / 河床 / 沙 */
export const TerrainPalette = {
    grass:   { r: 96,  g: 116, b: 74,  a: 255 },
    dirt:    { r: 128, g: 110, b: 82,  a: 255 },
    rock:    { r: 110, g: 112, b: 116, a: 255 },
    river:   { r: 44,  g: 92,  b: 112, a: 255 },
    sand:    { r: 148, g: 132, b: 96,  a: 255 },
    hillRock:{ r: 98,  g: 96,  b: 100, a: 255 },
} as const;

/** 领土覆盖层色（低饱和，配合地面渐变） */
export const TerritoryTint = {
    west:  { r: 46,  g: 125, b: 225, a: 110 },
    east:  { r: 226, g: 60,  b: 60,  a: 110 },
    south: { r: 232, g: 179, b: 58,  a: 110 },
    neutral: { r: 0, g: 0, b: 0, a: 0 },
} as const;

/** UI 军事暗色主题 */
export const UITheme = {
    bg:          '#0B1015',
    bgSoft:      '#121A20',
    bgPanel:     '#1A242C',
    line:        '#4FD1D9',
    lineDim:     'rgba(79,209,217,0.33)',
    text:        '#E6EDF3',
    textDim:     '#9BB0BF',
    good:        '#5BD08A',
    bad:         '#E23C3C',
    warn:        '#E8B33A',
    accent:      '#4FD1D9',
} as const;
