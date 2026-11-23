import { TerrainData } from './Terrain';
import { clamp01 } from '../core/MathUtils';
import type { FactionId } from '../data/ConfigTypes';

/**
 * 领土网格：地块归属与占领进度（sim 侧纯数据）。
 * 占领不是"染色"：翻边事件会驱动产能/接触面变化（由 Economy 消费）。
 */

export interface TerritoryGrid {
    size: number;
    /** 0=中立, 1=west, 2=east, 3=south */
    owner: Int8Array;
    /** 占领进度 0..1（向 owner 方向） */
    progress: Float32Array;
    /** 每格是否与异方接壤（接触面） */
    borderMask: Uint8Array;
    counts: [number, number, number];
    dirty: boolean;
}

export function createTerritory(size: number): TerritoryGrid {
    return {
        size,
        owner: new Int8Array(size * size),
        progress: new Float32Array(size * size),
        borderMask: new Uint8Array(size * size),
        counts: [0, 0, 0],
        dirty: true,
    };
}

const FACTION_TO_INDEX: Record<FactionId, number> = { west: 1, east: 2, south: 3 };

export function factionIndex(f: FactionId): number {
    return FACTION_TO_INDEX[f];
}

/** 把出生地周边一圈格设为初始领土（含边界脉冲用 borderMask） */
export function initHomeTerritory(grid: TerritoryGrid, terrain: TerrainData, faction: FactionId, cx0: number, cz0: number, radius: number): void {
    const n = grid.size;
    const fi = FACTION_TO_INDEX[faction];
    for (let cz = cz0 - radius; cz <= cz0 + radius; cz++) {
        for (let cx = cx0 - radius; cx <= cx0 + radius; cx++) {
            if (!terrain.inBounds(cx, cz)) continue;
            const idx = cz * n + cx;
            if (grid.owner[idx] !== 0) continue; // 不覆盖他人
            if ((cx - cx0) ** 2 + (cz - cz0) ** 2 <= radius * radius) {
                grid.owner[idx] = fi;
                grid.progress[idx] = 1;
                grid.counts[fi - 1]++;
            }
        }
    }
    refreshBorder(grid);
    grid.dirty = true;
}

/** 单 tick 影响累加：驻留单位按影响值推进所在格；返回是否发生翻边 */
export function stepTerritory(grid: TerritoryGrid, terrain: TerrainData, samples: { cx: number; cz: number; fi: number; influence: number }[]): boolean {
    const n = grid.size;
    let flipped = false;
    for (const s of samples) {
        const idx = s.cz * n + s.cx;
        const cur = grid.owner[idx];
        if (cur === s.fi) {
            if (grid.progress[idx] < 1) {
                grid.progress[idx] = Math.min(1, grid.progress[idx] + s.influence);
                grid.dirty = true;
            }
            continue;
        }
        // 向新阵营推进：先把进度归零再反向累加
        const newProgress = clamp01(grid.progress[idx] + s.influence);
        if (newProgress >= 1) {
            grid.owner[idx] = s.fi;
            grid.progress[idx] = 1;
            if (cur > 0) grid.counts[cur - 1]--;
            grid.counts[s.fi - 1]++;
            flipped = true;
            grid.dirty = true;
        } else {
            grid.progress[idx] = newProgress;
            grid.dirty = true;
        }
    }
    if (flipped) refreshBorder(grid);
    return flipped;
}

/** 刷新接壤标记（异方邻接格 = 边界，用于渲染亮线与接触面统计） */
export function refreshBorder(grid: TerritoryGrid): void {
    const n = grid.size;
    for (let cz = 0; cz < n; cz++) {
        for (let cx = 0; cx < n; cx++) {
            const idx = cz * n + cx;
            const o = grid.owner[idx];
            if (o === 0) { grid.borderMask[idx] = 0; continue; }
            let b = 0;
            if (cx > 0 && grid.owner[idx - 1] !== o) b = 1;
            else if (cx < n - 1 && grid.owner[idx + 1] !== o) b = 1;
            else if (cz > 0 && grid.owner[idx - n] !== o) b = 1;
            else if (cz < n - 1 && grid.owner[idx + n] !== o) b = 1;
            grid.borderMask[idx] = b;
        }
    }
}

/** 统计各阵营领地占比（0..1） */
export function territoryShare(grid: TerritoryGrid): [number, number, number] {
    const total = grid.size * grid.size;
    return [grid.counts[0] / total, grid.counts[1] / total, grid.counts[2] / total];
}

/** 总领地格数 */
export function totalOwned(grid: TerritoryGrid): number {
    return grid.counts[0] + grid.counts[1] + grid.counts[2];
}
