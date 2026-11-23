import { FactionId } from '../data/ConfigTypes';
import { World } from '../sim/World';
import { territoryShare } from '../sim/Territory';

/**
 * 暗外交 / 反滚雪球：
 * 任一方领地超过阈值 → 另两方自动"联合"（协同进攻该方）。
 * 三方博弈的物理基础在距离上自然成立，无需 UI 表达。
 */

export interface DiplomacyState {
    /** 当前被联合针对的阵营（无则 null） */
    coalitionTarget: FactionId | null;
    /** 复仇记忆：被谁打过 → 后续优先针对谁 */
    grudges: Record<FactionId, Record<FactionId, number>>;
}

export function createDiplomacy(): DiplomacyState {
    return {
        coalitionTarget: null,
        grudges: { west: { west: 0, east: 0, south: 0 }, east: { west: 0, east: 0, south: 0 }, south: { west: 0, east: 0, south: 0 } },
    };
}

export function updateDiplomacy(world: World, dip: DiplomacyState, threshold: number): void {
    const share = territoryShare(world.territory);
    let leader: FactionId | null = null;
    for (const f of ['west', 'east', 'south'] as FactionId[]) {
        if (world.isFactionAlive(f) && share[world['_factionIdx']?.[f] ?? (f === 'west' ? 0 : f === 'east' ? 1 : 2)] >= threshold) {
            leader = f;
        }
    }
    dip.coalitionTarget = leader;
}

/** 记仇 */
export function addGrudge(dip: DiplomacyState, victim: FactionId, attacker: FactionId, amount: number): void {
    dip.grudges[victim][attacker] = Math.min(1, dip.grudges[victim][attacker] + amount);
}

/** 记仇衰减 */
export function decayGrudges(dip: DiplomacyState, rate: number): void {
    for (const f of ['west', 'east', 'south'] as FactionId[]) {
        for (const g of ['west', 'east', 'south'] as FactionId[]) {
            dip.grudges[f][g] = Math.max(0, dip.grudges[f][g] - rate);
        }
    }
}
