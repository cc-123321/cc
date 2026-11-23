import { TerrainData } from './Terrain';
import { ArmorFacing } from '../data/ConfigTypes';
import { angleDiffDeg, clamp01 } from '../core/MathUtils';

/**
 * 伤害解析（物理层克制，玩家看不到数字）：
 * - 装甲朝向：命中角度决定打正面/侧面/背面
 * - 视线：直射武器被高地脊线遮挡即无法开火
 * - 面杀伤：溅射半径内按距离衰减
 */

/** 由攻击方向判定目标装甲朝向 */
export function armorFacing(targetFacingDeg: number, fromX: number, fromZ: number, tx: number, tz: number): ArmorFacing {
    const ang = Math.atan2(fromZ - tz, fromX - tx) * 180 / Math.PI;
    const diff = Math.abs(angleDiffDeg(targetFacingDeg, ang));
    if (diff <= 60) return 'front';
    if (diff <= 120) return 'flank';
    return 'rear';
}

/** 直射视线：沿线采样高度，高地脊线遮挡 */
export function hasLineOfSight(terrain: TerrainData, ax: number, az: number, bx: number, bz: number): boolean {
    const ha = terrain.heightAt(ax, az);
    const hb = terrain.heightAt(bx, bz);
    const maxH = Math.max(ha, hb);
    const d = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
    const steps = Math.max(2, Math.ceil(d / 1.6));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const h = terrain.heightAt(ax + (bx - ax) * t, az + (bz - az) * t);
        if (h > maxH + 0.6) return false;
    }
    return true;
}

/** 命中修正：目标在林地 → 命中下降；天气（雾/沙尘）→ 直射大幅下降 */
export function accuracyFactor(
    terrain: TerrainData,
    targetX: number, targetZ: number,
    weather: string,
): number {
    let f = 1;
    const { cx, cz } = terrain.cellOf(targetX, targetZ);
    if (terrain.kindAt(cx, cz) === 2) f *= 0.8; // FOREST
    if (weather === 'fog' || weather === 'sandstorm') f *= 0.55;
    return clamp01(f);
}

/** 结算单发命中：返回实际造成的伤害（已含装甲朝向与命中概率） */
export function resolveShot(
    rngNext: () => number,
    terrain: TerrainData,
    weather: string,
    baseDamage: number,
    accuracy: number,
    attackerX: number, attackerZ: number,
    targetFacingDeg: number,
    targetX: number, targetZ: number,
    armorMult: Record<ArmorFacing, number>,
): number {
    const acc = accuracy * accuracyFactor(terrain, targetX, targetZ, weather);
    if (rngNext() > acc) return 0;
    const facing = armorFacing(targetFacingDeg, attackerX, attackerZ, targetX, targetZ);
    return Math.round(baseDamage * armorMult[facing]);
}
