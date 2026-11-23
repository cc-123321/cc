import { FactionId } from '../data/ConfigTypes';
import { SimUnit } from './Unit';
import { SimBuilding } from './Building';

/**
 * 视野与"空军需要眼睛"规则：
 * - hasEye：雷达站存活 或 预警机在场 → 导弹能锁定、飞机能打后排
 * - 预警机被击落 / 雷达被拆 → 空军立刻失效（rule 4）
 * - 低空无人机可被轻武器打（rule 5）：由 ceiling 判定
 */

export interface FactionVision {
    hasEye: boolean;
    visionMult: number;
}

export function updateVision(
    units: readonly SimUnit[],
    buildings: readonly SimBuilding[],
    difficultyVisionMult: number,
    weather: string,
): Record<FactionId, FactionVision> {
    const vision: Record<FactionId, FactionVision> = {
        west: { hasEye: false, visionMult: 1 },
        east: { hasEye: false, visionMult: 1 },
        south: { hasEye: false, visionMult: 1 },
    };
    const weatherMult = (weather === 'fog' || weather === 'sandstorm') ? 0.55 : 1;

    for (const f of ['west', 'east', 'south'] as FactionId[]) {
        vision[f].visionMult = difficultyVisionMult * weatherMult;
    }
    for (const b of buildings) {
        if (b.dead) continue;
        if (b.def.id === 'radar') vision[b.faction].hasEye = true;
    }
    for (const u of units) {
        if (u.dead) continue;
        if (u.def.air?.isAWACS) vision[u.faction].hasEye = true;
    }
    return vision;
}

/** 攻击方能否命中空中目标（按升限） */
export function ceilingLimit(u: SimUnit): number {
    const tags = u.def.tags;
    if (tags.includes('aa')) return 1.2;       // 防空导弹车：战斗机及以下
    if (u.def.domain === 'ground') return 0.3; // 轻武器：低空无人机
    return 0;
}

/** 能否看到并锁定目标（空军需要眼睛；防空需要锁定） */
export function canEngage(
    attacker: SimUnit,
    vision: FactionVision,
    targetDomain: 'ground' | 'air',
): boolean {
    if (targetDomain === 'air') {
        // 防空需要雷达锁定
        if (attacker.def.tags.includes('needsLock') || attacker.def.tags.includes('aa')) {
            return vision.hasEye;
        }
        return true;
    }
    // 空军打地面需要眼睛
    if (attacker.def.tags.includes('needsEye')) {
        return vision.hasEye;
    }
    return true;
}
