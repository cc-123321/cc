"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Economy = void 0;
/**
 * 产能经济：地块产能 + 矿点乘区（sim 纯数据）。
 * 占的地越多 → 出得起的东西越多；同时接触面越长（张力在 Territory/World 表达）。
 */
class Economy {
    constructor(def) {
        this.supply = [0, 0, 0];
        this._def = def;
        this.supply = [def.startSupply, def.startSupply, def.startSupply];
    }
    def() {
        return this._def;
    }
    /** 每 tick 入账：地块 + 矿点 */
    step(ownerGrid, mineCells, size) {
        const base = this._def.supplyPerCell;
        const cells = [0, 0, 0];
        const n = ownerGrid.length;
        for (let i = 0; i < n; i++) {
            const o = ownerGrid[i];
            if (o > 0)
                cells[o - 1]++;
        }
        // 矿点归属
        const mines = [0, 0, 0];
        for (const m of mineCells) {
            const o = ownerGrid[m.cz * size + m.cx];
            if (o > 0)
                mines[o - 1]++;
        }
        for (let f = 0; f < 3; f++) {
            this.supply[f] += cells[f] * base + mines[f] * base * this._def.mineMultiplier;
        }
    }
    canAfford(faction, cost) {
        return this.supply[this._idx(faction)] >= cost;
    }
    spend(faction, cost) {
        const i = this._idx(faction);
        if (this.supply[i] < cost)
            return false;
        this.supply[i] -= cost;
        return true;
    }
    /** 兵力上限 = 占领格数 * armyCapPerCell */
    armyCap(ownedCells) {
        return Math.floor(ownedCells * this._def.armyCapPerCell) + 6;
    }
    _idx(f) {
        return f === 'west' ? 0 : f === 'east' ? 1 : 2;
    }
}
exports.Economy = Economy;
