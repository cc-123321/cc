"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerrainData = void 0;
const Rng_1 = require("../core/Rng");
const MathUtils_1 = require("../core/MathUtils");
class TerrainData {
    constructor(def) {
        this.rivers = [];
        this.bridges = [];
        this.mines = [];
        this.forests = [];
        this.size = def.size;
        this.cellSize = def.cellSize;
        const n = this.size;
        const rng = new Rng_1.Rng(def.seed);
        // ---- 山丘（高斯隆起） ----
        const hills = [];
        for (let i = 0; i < def.hillCount; i++) {
            // 远离三方出生点，避免开局堵路
            const x = rng.range(20, n - 20);
            const z = rng.range(20, n - 20);
            const r = rng.range(def.hillRadiusMin, def.hillRadiusMax);
            const h = rng.range(1.2, def.hillHeightMax);
            hills.push({ x, z, r, h });
        }
        // ---- 河流路径（折线随机游走，从边缘到边缘） ----
        for (let i = 0; i < def.riverCount; i++) {
            const startEdge = rng.int(0, 1);
            const pts = [];
            let x, z;
            if (startEdge === 0) {
                x = rng.range(30, n - 30);
                z = 0;
            }
            else {
                x = 0;
                z = rng.range(30, n - 30);
            }
            pts.push({ x, z });
            const steps = 9;
            let heading = rng.pick([0, 90]);
            if (startEdge === 0)
                heading = 90; // 垂直向下
            else
                heading = 0;
            for (let s = 0; s < steps; s++) {
                heading += rng.range(-35, 35);
                const len = rng.range(8, 16);
                x += Math.cos(heading * Math.PI / 180) * len;
                z += Math.sin(heading * Math.PI / 180) * len;
                x = (0, MathUtils_1.clamp)(x, 4, n - 4);
                z = (0, MathUtils_1.clamp)(z, 4, n - 4);
                pts.push({ x, z });
                if ((startEdge === 0 && z >= n - 6) || (startEdge === 1 && x >= n - 6))
                    break;
            }
            this.rivers.push({ points: pts, width: def.riverWidth });
        }
        // ---- 桥梁（在河流上选点，桥位河床抬高） ----
        for (let i = 0; i < def.bridgeCount && this.rivers.length > 0; i++) {
            const river = this.rivers[i % this.rivers.length];
            const p = river.points[rng.int(1, Math.max(1, river.points.length - 2))];
            const bx = (0, MathUtils_1.clamp)(p.x + rng.range(-6, 6), 6, n - 6);
            const bz = (0, MathUtils_1.clamp)(p.z + rng.range(-6, 6), 6, n - 6);
            this.bridges.push({ x: bx, z: bz });
        }
        // ---- 林地 ----
        for (let i = 0; i < def.forestCount; i++) {
            const x = rng.range(12, n - 12);
            const z = rng.range(12, n - 12);
            const r = rng.range(def.forestRadiusMin, def.forestRadiusMax);
            this.forests.push({ x, z, radius: r });
        }
        // ---- 矿点（通常位于开阔或半遮蔽处，天然必争之地） ----
        for (let i = 0; i < def.mineCount; i++) {
            const x = rng.range(18, n - 18);
            const z = rng.range(18, n - 18);
            this.mines.push({ x, z, value: def.mineValue });
        }
        // ---- 高度场 ----
        this.heights = new Float32Array((n + 1) * (n + 1));
        for (let j = 0; j <= n; j++) {
            for (let i = 0; i <= n; i++) {
                let h = 0;
                for (const hill of hills) {
                    const dx = i - hill.x, dz = j - hill.z;
                    const d2 = dx * dx + dz * dz;
                    const r2 = hill.r * hill.r;
                    if (d2 < r2) {
                        h += hill.h * (1 - Math.sqrt(d2) / hill.r) * (1 - Math.sqrt(d2) / hill.r);
                    }
                }
                this.heights[j * (n + 1) + i] = h;
            }
        }
        // ---- 地块类型（先铺基础，再叠加河流/桥/矿/林/高地） ----
        this.kinds = new Uint8Array(n * n);
        for (let cz = 0; cz < n; cz++) {
            for (let cx = 0; cx < n; cx++) {
                const wx = (cx + 0.5) * this.cellSize;
                const wz = (cz + 0.5) * this.cellSize;
                // 河流：到路径距离 < 宽度 → 河床
                let inRiver = false;
                for (const river of this.rivers) {
                    let minD = Infinity;
                    const pts = river.points;
                    for (let k = 0; k < pts.length - 1; k++) {
                        const d = (0, MathUtils_1.distToSegment)(wx, wz, pts[k].x, pts[k].z, pts[k + 1].x, pts[k + 1].z);
                        if (d < minD)
                            minD = d;
                    }
                    if (minD < river.width * 0.7) {
                        inRiver = true;
                        break;
                    }
                }
                let kind = 0 /* CellKind.PLAIN */;
                if (inRiver)
                    kind = 3 /* CellKind.RIVER */;
                for (const b of this.bridges) {
                    if ((wx - b.x) ** 2 + (wz - b.z) ** 2 < 1.6 * 1.6) {
                        kind = 4 /* CellKind.BRIDGE */;
                        break;
                    }
                }
                if (kind === 0 /* CellKind.PLAIN */ || kind === 3 /* CellKind.RIVER */) {
                    for (const f of this.forests) {
                        if ((wx - f.x) ** 2 + (wz - f.z) ** 2 < f.radius * f.radius) {
                            kind = 2 /* CellKind.FOREST */;
                            break;
                        }
                    }
                }
                for (const m of this.mines) {
                    if ((wx - m.x) ** 2 + (wz - m.z) ** 2 < 1.4 * 1.4) {
                        kind = 5 /* CellKind.MINE */;
                        break;
                    }
                }
                if (kind === 0 /* CellKind.PLAIN */ || kind === 2 /* CellKind.FOREST */) {
                    if (this.heights[(cz + 1) * (n + 1) + cx] > 1.6)
                        kind = 1 /* CellKind.HILL */;
                }
                this.kinds[cz * n + cx] = kind;
            }
        }
        // ---- 河床压低高度；桥位恢复 ----
        for (let j = 0; j <= n; j++) {
            for (let i = 0; i <= n; i++) {
                const wx = i * this.cellSize;
                const wz = j * this.cellSize;
                let dip = 0;
                for (const river of this.rivers) {
                    let minD = Infinity;
                    const pts = river.points;
                    for (let k = 0; k < pts.length - 1; k++) {
                        const d = (0, MathUtils_1.distToSegment)(wx, wz, pts[k].x, pts[k].z, pts[k + 1].x, pts[k + 1].z);
                        if (d < minD)
                            minD = d;
                    }
                    if (minD < river.width) {
                        const f = 1 - (0, MathUtils_1.clamp)(minD / river.width, 0, 1);
                        dip = Math.max(dip, 0.9 * f * f);
                    }
                }
                this.heights[j * (n + 1) + i] -= dip;
                for (const b of this.bridges) {
                    if ((wx - b.x) ** 2 + (wz - b.z) ** 2 < 2.2 * 2.2) {
                        this.heights[j * (n + 1) + i] = 0; // 桥面与平地齐平
                    }
                }
                if (this.heights[j * (n + 1) + i] < 0)
                    this.heights[j * (n + 1) + i] = 0;
            }
        }
    }
    /** 世界坐标 → 格坐标（可能越界） */
    cellOf(wx, wz) {
        return { cx: Math.floor(wx / this.cellSize), cz: Math.floor(wz / this.cellSize) };
    }
    /** 格 → 世界（格中心） */
    worldOf(cx, cz) {
        return { x: (cx + 0.5) * this.cellSize, z: (cz + 0.5) * this.cellSize };
    }
    inBounds(cx, cz) {
        return cx >= 0 && cz >= 0 && cx < this.size && cz < this.size;
    }
    /** 高度（连续，含插值） */
    heightAt(wx, wz) {
        const n = this.size;
        const x = (0, MathUtils_1.clamp)(wx / this.cellSize, 0, n);
        const z = (0, MathUtils_1.clamp)(wz / this.cellSize, 0, n);
        const i0 = Math.floor(x), j0 = Math.floor(z);
        const i1 = Math.min(n, i0 + 1), j1 = Math.min(n, j0 + 1);
        const fx = x - i0, fz = z - j0;
        const h00 = this.heights[j0 * (n + 1) + i0];
        const h10 = this.heights[j0 * (n + 1) + i1];
        const h01 = this.heights[j1 * (n + 1) + i0];
        const h11 = this.heights[j1 * (n + 1) + i1];
        return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
    }
    kindAt(cx, cz) {
        if (!this.inBounds(cx, cz))
            return 0 /* CellKind.PLAIN */;
        return this.kinds[cz * this.size + cx];
    }
    /** 该格是否可通行（河流不可通行，除非有桥；林地/高地可通行但减速） */
    isPassable(cx, cz) {
        const k = this.kindAt(cx, cz);
        return k !== 3 /* CellKind.RIVER */;
    }
}
exports.TerrainData = TerrainData;
