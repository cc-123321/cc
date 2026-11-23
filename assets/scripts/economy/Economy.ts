import { FactionId } from '../data/ConfigTypes';
import type { EconomyDef } from '../data/ConfigTypes';

/**
 * 产能经济：地块产能 + 矿点乘区（sim 纯数据）。
 * 占的地越多 → 出得起的东西越多；同时接触面越长（张力在 Territory/World 表达）。
 */

export class Economy {
    public supply: [number, number, number] = [0, 0, 0];
    private readonly _def: EconomyDef;

    constructor(def: EconomyDef) {
        this._def = def;
        this.supply = [def.startSupply, def.startSupply, def.startSupply];
    }

    public def(): EconomyDef {
        return this._def;
    }

    /** 每 tick 入账：地块 + 矿点 */
    public step(
        ownerGrid: Int8Array,
        mineCells: { cx: number; cz: number }[],
        size: number,
    ): void {
        const base = this._def.supplyPerCell;
        const cells = [0, 0, 0];
        const n = ownerGrid.length;
        for (let i = 0; i < n; i++) {
            const o = ownerGrid[i];
            if (o > 0) cells[o - 1]++;
        }
        // 矿点归属
        const mines = [0, 0, 0];
        for (const m of mineCells) {
            const o = ownerGrid[m.cz * size + m.cx];
            if (o > 0) mines[o - 1]++;
        }
        for (let f = 0; f < 3; f++) {
            this.supply[f] += cells[f] * base + mines[f] * base * this._def.mineMultiplier;
        }
    }

    public canAfford(faction: FactionId, cost: number): boolean {
        return this.supply[this._idx(faction)] >= cost;
    }

    public spend(faction: FactionId, cost: number): boolean {
        const i = this._idx(faction);
        if (this.supply[i] < cost) return false;
        this.supply[i] -= cost;
        return true;
    }

    /** 兵力上限 = 占领格数 * armyCapPerCell */
    public armyCap(ownedCells: number): number {
        return Math.floor(ownedCells * this._def.armyCapPerCell) + 6;
    }

    private _idx(f: FactionId): number {
        return f === 'west' ? 0 : f === 'east' ? 1 : 2;
    }
}
