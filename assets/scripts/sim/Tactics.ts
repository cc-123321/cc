import { FactionId } from '../data/ConfigTypes';

/**
 * 战术指令槽（3 格，冷却制）。每个指令都有对称代价 —— 用它在做取舍，不是领福利。
 */

export const enum TacticId {
    FIRE_PREP = 'firePrep',
    EWAR = 'ewar',
    FORTIFY = 'fortify',
}

export interface TacticState {
    /** 每个战术的剩余冷却 tick */
    cooldown: number[];
    /** 火力准备剩余 tick（炮射速提升，但阵地暴露） */
    firePrepUntil: number;
    /** 电子压制剩余 tick（敌我雷达/无人机失效） */
    ewarUntil: number;
    /** 己方暴露剩余 tick（火力准备期间敌方获得视野） */
    exposedUntil: number;
}

export const TACTIC_IDS: TacticId[] = [TacticId.FIRE_PREP, TacticId.EWAR, TacticId.FORTIFY];
export const TACTIC_COOLDOWN_TICKS = 240;    // 8 秒冷却
export const FIRE_PREP_DURATION = 90;        // 3 秒
export const EWAR_DURATION = 60;             // 2 秒
export const FORTIFY_HP = 80;

export function createTacticState(): TacticState {
    return { cooldown: [0, 0, 0], firePrepUntil: 0, ewarUntil: 0, exposedUntil: 0 };
}

export function tickTactics(t: TacticState): void {
    for (let i = 0; i < 3; i++) if (t.cooldown[i] > 0) t.cooldown[i]--;
    if (t.firePrepUntil > 0) t.firePrepUntil--;
    if (t.ewarUntil > 0) t.ewarUntil--;
    if (t.exposedUntil > 0) t.exposedUntil--;
}

/** 尝试触发战术；返回是否成功（冷却中则失败） */
export function tryUseTactic(t: TacticState, tactic: TacticId): boolean {
    const idx = TACTIC_IDS.indexOf(tactic);
    if (idx < 0 || t.cooldown[idx] > 0) return false;
    t.cooldown[idx] = TACTIC_COOLDOWN_TICKS;
    switch (tactic) {
        case TacticId.FIRE_PREP:
            t.firePrepUntil = FIRE_PREP_DURATION;
            t.exposedUntil = FIRE_PREP_DURATION; // 对称代价：阵地暴露
            break;
        case TacticId.EWAR:
            t.ewarUntil = EWAR_DURATION;         // 对称代价：己方同样失去雷达视野
            break;
        case TacticId.FORTIFY:
            break;                               // 代价在 World 中扣产能并暴露工兵
    }
    return true;
}

/** 火力准备效果：炮 reload 减半 */
export function isFirePrepActive(t: TacticState): boolean {
    return t.firePrepUntil > 0;
}

/** 电子压制效果：全局雷达/无人机/防空锁定失效 */
export function isEwarActive(t: TacticState): boolean {
    return t.ewarUntil > 0;
}

export function isExposed(t: TacticState): boolean {
    return t.exposedUntil > 0;
}
