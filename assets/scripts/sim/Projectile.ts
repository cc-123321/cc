import { FactionId } from '../data/ConfigTypes';

/**
 * 弹道：直射/曲射/防空。
 * 命中后按战斗规则结算（Combat 负责伤害解析）。
 */

export interface SimProjectile {
    id: number;
    faction: FactionId;
    kind: 'direct' | 'arc' | 'aa';
    x: number;
    z: number;
    y: number;
    targetX: number;
    targetZ: number;
    /** 速度（单位/tick） */
    speed: number;
    /** 伤害参数（发射时固化，命中目标可能已移动） */
    damage: number;
    splash: number;
    canHitAir: boolean;
    canHitGround: boolean;
    accuracy: number;
    /** 已飞行时长（用于曲射弧线高度插值） */
    t: number;
    tMax: number;
    dead: boolean;
}

let projectileSeq = 0;

export function createProjectile(
    faction: FactionId,
    kind: 'direct' | 'arc' | 'aa',
    sx: number, sz: number,
    tx: number, tz: number,
    speed: number,
    damage: number,
    splash: number,
    canHitAir: boolean,
    canHitGround: boolean,
    accuracy: number,
): SimProjectile {
    const d = Math.sqrt((tx - sx) ** 2 + (tz - sz) ** 2);
    const tMax = Math.max(1, d / Math.max(0.1, speed));
    return {
        id: ++projectileSeq,
        faction, kind,
        x: sx, z: sz, y: 0.6,
        targetX: tx, targetZ: tz,
        speed,
        damage, splash, canHitAir, canHitGround, accuracy,
        t: 0, tMax, dead: false,
    };
}
