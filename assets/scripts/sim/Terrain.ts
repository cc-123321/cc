import { Rng } from '../core/Rng';
import { clamp, distToSegment } from '../core/MathUtils';
import type { TerrainGenDef } from '../data/ConfigTypes';

/**
 * 纯数据地形（sim 侧，不依赖 cc）。
 * 高度场 + 地块类型 + 桥梁/矿点/林地/河流路径。
 * 生成规则全部来自 map.json，同一 seed 生成同一张图。
 */

export const enum CellKind {
    PLAIN = 0,
    HILL = 1,
    FOREST = 2,
    RIVER = 3,
    BRIDGE = 4,
    MINE = 5,
}

export interface MineSpot { x: number; z: number; value: number; }
export interface BridgeSpot { x: number; z: number; }
export interface ForestSpot { x: number; z: number; radius: number; }
export interface RiverPath { points: { x: number; z: number }[]; width: number; }

export class TerrainData {
    public readonly size: number;
    public readonly cellSize: number;
    public readonly heights: Float32Array;   // (size+1)*(size+1)
    public readonly kinds: Uint8Array;       // size*size
    public readonly rivers: RiverPath[] = [];
    public readonly bridges: BridgeSpot[] = [];
    public readonly mines: MineSpot[] = [];
    public readonly forests: ForestSpot[] = [];

    constructor(def: TerrainGenDef) {
        this.size = def.size;
        this.cellSize = def.cellSize;
        const n = this.size;
        const rng = new Rng(def.seed);

        // ---- 山丘（高斯隆起） ----
        const hills: { x: number; z: number; r: number; h: number }[] = [];
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
            const pts: { x: number; z: number }[] = [];
            let x: number, z: number;
            if (startEdge === 0) {
                x = rng.range(30, n - 30);
                z = 0;
            } else {
                x = 0;
                z = rng.range(30, n - 30);
            }
            pts.push({ x, z });
            const steps = 9;
            let heading = rng.pick([0, 90]) as number;
            if (startEdge === 0) heading = 90; // 垂直向下
            else heading = 0;
            for (let s = 0; s < steps; s++) {
                heading += rng.range(-35, 35);
                const len = rng.range(8, 16);
                x += Math.cos(heading * Math.PI / 180) * len;
                z += Math.sin(heading * Math.PI / 180) * len;
                x = clamp(x, 4, n - 4);
                z = clamp(z, 4, n - 4);
                pts.push({ x, z });
                if ((startEdge === 0 && z >= n - 6) || (startEdge === 1 && x >= n - 6)) break;
            }
            this.rivers.push({ points: pts, width: def.riverWidth });
        }

        // ---- 桥梁（在河流上选点，桥位河床抬高） ----
        for (let i = 0; i < def.bridgeCount && this.rivers.length > 0; i++) {
            const river = this.rivers[i % this.rivers.length];
            const p = river.points[rng.int(1, Math.max(1, river.points.length - 2))];
            const bx = clamp(p.x + rng.range(-6, 6), 6, n - 6);
            const bz = clamp(p.z + rng.range(-6, 6), 6, n - 6);
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

        // ---- 3 重旋转对称：保证三方出生地地形完全公平（与等距出生点对应） ----
        const center = n * 0.5;
        const rot = (p: { x: number; z: number }, k: number) => {
            const a = (k * 120) * Math.PI / 180;
            const dx = p.x - center, dz = p.z - center;
            return {
                x: clamp(center + dx * Math.cos(a) - dz * Math.sin(a), 2, n - 2),
                z: clamp(center + dx * Math.sin(a) + dz * Math.cos(a), 2, n - 2),
            };
        };
        for (let k = 1; k <= 2; k++) {
            for (const h of hills.slice()) hills.push({ ...rot(h, k), r: h.r, h: h.h });
            for (const f of this.forests.slice()) this.forests.push({ ...rot(f, k), radius: f.radius });
            for (const m of this.mines.slice()) this.mines.push({ ...rot(m, k), value: m.value });
            for (const b of this.bridges.slice()) this.bridges.push(rot(b, k));
            for (const rv of this.rivers.slice()) {
                this.rivers.push({ points: rv.points.map((p) => rot(p, k)), width: rv.width });
            }
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
                        const d = distToSegment(wx, wz, pts[k].x, pts[k].z, pts[k + 1].x, pts[k + 1].z);
                        if (d < minD) minD = d;
                    }
                    if (minD < river.width * 0.7) { inRiver = true; break; }
                }

                let kind = CellKind.PLAIN;
                if (inRiver) kind = CellKind.RIVER;
                for (const b of this.bridges) {
                    if ((wx - b.x) ** 2 + (wz - b.z) ** 2 < 1.6 * 1.6) { kind = CellKind.BRIDGE; break; }
                }
                if (kind === CellKind.PLAIN || kind === CellKind.RIVER) {
                    for (const f of this.forests) {
                        if ((wx - f.x) ** 2 + (wz - f.z) ** 2 < f.radius * f.radius) {
                            kind = CellKind.FOREST; break;
                        }
                    }
                }
                for (const m of this.mines) {
                    if ((wx - m.x) ** 2 + (wz - m.z) ** 2 < 1.4 * 1.4) { kind = CellKind.MINE; break; }
                }
                if (kind === CellKind.PLAIN || kind === CellKind.FOREST) {
                    if (this.heights[(cz + 1) * (n + 1) + cx] > 1.6) kind = CellKind.HILL;
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
                        const d = distToSegment(wx, wz, pts[k].x, pts[k].z, pts[k + 1].x, pts[k + 1].z);
                        if (d < minD) minD = d;
                    }
                    if (minD < river.width) {
                        const f = 1 - clamp(minD / river.width, 0, 1);
                        dip = Math.max(dip, 0.9 * f * f);
                    }
                }
                this.heights[j * (n + 1) + i] -= dip;
                for (const b of this.bridges) {
                    if ((wx - b.x) ** 2 + (wz - b.z) ** 2 < 2.2 * 2.2) {
                        this.heights[j * (n + 1) + i] = 0; // 桥面与平地齐平
                    }
                }
                if (this.heights[j * (n + 1) + i] < 0) this.heights[j * (n + 1) + i] = 0;
            }
        }
    }

    /** 世界坐标 → 格坐标（可能越界） */
    public cellOf(wx: number, wz: number): { cx: number; cz: number } {
        return { cx: Math.floor(wx / this.cellSize), cz: Math.floor(wz / this.cellSize) };
    }

    /** 格 → 世界（格中心） */
    public worldOf(cx: number, cz: number): { x: number; z: number } {
        return { x: (cx + 0.5) * this.cellSize, z: (cz + 0.5) * this.cellSize };
    }

    public inBounds(cx: number, cz: number): boolean {
        return cx >= 0 && cz >= 0 && cx < this.size && cz < this.size;
    }

    /** 高度（连续，含插值） */
    public heightAt(wx: number, wz: number): number {
        const n = this.size;
        const x = clamp(wx / this.cellSize, 0, n);
        const z = clamp(wz / this.cellSize, 0, n);
        const i0 = Math.floor(x), j0 = Math.floor(z);
        const i1 = Math.min(n, i0 + 1), j1 = Math.min(n, j0 + 1);
        const fx = x - i0, fz = z - j0;
        const h00 = this.heights[j0 * (n + 1) + i0];
        const h10 = this.heights[j0 * (n + 1) + i1];
        const h01 = this.heights[j1 * (n + 1) + i0];
        const h11 = this.heights[j1 * (n + 1) + i1];
        return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
    }

    public kindAt(cx: number, cz: number): CellKind {
        if (!this.inBounds(cx, cz)) return CellKind.PLAIN;
        return this.kinds[cz * this.size + cx];
    }

    /** 该格是否可通行（河流不可通行，除非有桥；林地/高地可通行但减速） */
    public isPassable(cx: number, cz: number): boolean {
        const k = this.kindAt(cx, cz);
        return k !== CellKind.RIVER;
    }
}
