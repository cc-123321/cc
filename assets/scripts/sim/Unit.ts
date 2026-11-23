import { UnitDef, FactionId } from '../data/ConfigTypes';
import { TerrainData } from './Terrain';
import { clamp, dist, turnTowardDeg } from '../core/MathUtils';

/**
 * 单位（战斗实体）：纯数据状态机。
 * 玩家看不到任何数字：强弱只体现在 谁在退、谁被围、烟尘与剪影。
 */

export const enum UnitState {
    IDLE = 0,
    MOVE = 1,
    ATTACK = 2,
    DEAD = 3,
}

export interface SimUnit {
    id: number;
    faction: FactionId;
    def: UnitDef;
    x: number;
    z: number;
    facing: number;          // 度
    hp: number;
    state: UnitState;
    cooldown: number;        // 开火冷却 tick
    targetId: number;        // -1 = 无
    /** 当前移动命令的路点 */
    path: { x: number; z: number }[];
    pathIdx: number;
    /** 推进权重指令（画线推进） */
    pushX: number;
    pushZ: number;
    pushWeight: number;
    fuel: number;            // 空中单位
    dead: boolean;
    prevX: number;
    prevZ: number;
}

export function createUnit(id: number, faction: FactionId, def: UnitDef, x: number, z: number): SimUnit {
    return {
        id, faction, def,
        x, z, facing: 0,
        hp: def.armor.hp,
        state: UnitState.IDLE,
        cooldown: 0,
        targetId: -1,
        path: [],
        pathIdx: 0,
        pushX: 0, pushZ: 0, pushWeight: 0,
        fuel: def.air ? def.air.fuelTicks : 0,
        dead: false,
        prevX: x, prevZ: z,
    };
}

/** 地形对移动的减速倍率 */
export function terrainMoveMult(u: SimUnit, terrain: TerrainData): number {
    const { cx, cz } = terrain.cellOf(u.x, u.z);
    const k = terrain.kindAt(cx, cz);
    const slow = u.def.move.terrainSlow;
    switch (k) {
        case 2: return slow['forest'] ?? 1;       // FOREST
        case 1: return slow['hill'] ?? 1;         // HILL
        case 3: return slow['river'] ?? 1;        // RIVER
        default: return 1;
    }
}

/** 朝目标方向移动一步（含转向限制与地形减速），返回新坐标 */
export function moveUnit(u: SimUnit, terrain: TerrainData, tx: number, tz: number): void {
    const def = u.def;
    const mult = terrainMoveMult(u, terrain);
    const step = def.move.speed * mult;
    if (step <= 0) return;

    const d = dist(u.x, u.z, tx, tz);
    if (d < 0.01) return;

    const targetFacing = Math.atan2(tz - u.z, tx - u.x) * 180 / Math.PI;
    u.facing = turnTowardDeg(u.facing, targetFacing, def.move.turnRateDeg);
    // 转向受限：转向未完时减速，模拟真实转向代价
    const facingDiff = Math.abs(((targetFacing - u.facing + 540) % 360) - 180);
    const facingFactor = 1 - clamp(facingDiff / 180, 0, 1) * 0.55;

    const nx = u.x + Math.cos(targetFacing * Math.PI / 180) * step * facingFactor;
    const nz = u.z + Math.sin(targetFacing * Math.PI / 180) * step * facingFactor;

    // 落点合法性：越界/河流（无桥）禁止进入；轻微滑移
    const { cx, cz } = terrain.cellOf(nx, nz);
    const passable = terrain.isPassable(cx, cz);
    if (passable) {
        u.x = clamp(nx, 0.5, terrain.size - 0.5);
        u.z = clamp(nz, 0.5, terrain.size - 0.5);
    } else {
        // 沿边界滑行：尝试只移动一个轴
        const nx2 = u.x + Math.cos(targetFacing * Math.PI / 180) * step * facingFactor;
        if (terrain.isPassable(terrain.cellOf(nx2, u.z).cx, terrain.cellOf(nx2, u.z).cz)) {
            u.x = clamp(nx2, 0.5, terrain.size - 0.5);
        }
        const nz2 = u.z + Math.sin(targetFacing * Math.PI / 180) * step * facingFactor;
        if (terrain.isPassable(terrain.cellOf(u.x, nz2).cx, terrain.cellOf(u.x, nz2).cz)) {
            u.z = clamp(nz2, 0.5, terrain.size - 0.5);
        }
    }
}

/** 推进指令：叠加到目标方向（画线推进的权重实现） */
export function applyPush(u: SimUnit, px: number, pz: number, weight: number): void {
    u.pushX = px;
    u.pushZ = pz;
    u.pushWeight = Math.max(u.pushWeight, weight);
}
