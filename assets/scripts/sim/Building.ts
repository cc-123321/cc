import { BuildingDef, FactionId } from '../data/ConfigTypes';
import { TerrainData } from './Terrain';

/**
 * 建筑：自动产兵（玩家只管出什么、往哪去）。
 * 防御类建筑按防御参数开火（射界由渲染层可视化，sim 按 360° 简化）。
 */

export interface SimBuilding {
    id: number;
    faction: FactionId;
    def: BuildingDef;
    x: number;
    z: number;
    hp: number;
    cooldown: number;
    /** 生产队列：当前在产的兵种 id 与剩余 tick */
    produceType: string | null;
    produceTicks: number;
    /** 持续生产偏好：设定后该建筑会自动连续产兵（玩家只决定"出什么"） */
    autoType: string | null;
    dead: boolean;
}

export function createBuilding(id: number, faction: FactionId, def: BuildingDef, x: number, z: number): SimBuilding {
    return {
        id, faction, def, x, z,
        hp: def.hp,
        cooldown: 0,
        produceType: null,
        produceTicks: 0,
        autoType: null,
        dead: false,
    };
}

/** 建筑占用格是否合法（不能建在河流上） */
export function canPlace(terrain: TerrainData, cx: number, cz: number): boolean {
    return terrain.inBounds(cx, cz) && terrain.isPassable(cx, cz);
}
