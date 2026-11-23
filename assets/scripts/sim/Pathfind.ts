import { TerrainData, CellKind } from './Terrain';

/**
 * A* 网格寻路（128x128）。
 * 河流不可通行（除非桥格）、林地/高地/山丘按减速代价。
 * 仅在玩家/AI 下达移动命令时调用一次，路径以路点数组缓存。
 */

interface OpenNode {
    g: number;
    f: number;
    cx: number;
    cz: number;
}

function cellCost(terrain: TerrainData, cx: number, cz: number): number {
    const k = terrain.kindAt(cx, cz);
    switch (k) {
        case CellKind.RIVER: return -1;          // 不可通行
        case CellKind.FOREST: return 1.6;
        case CellKind.HILL: return 1.25;
        case CellKind.MINE: return 0.9;
        default: return 1.0;
    }
}

export function findPath(
    terrain: TerrainData,
    sx: number, sz: number,
    tx: number, tz: number,
): { x: number; z: number }[] | null {
    const n = terrain.size;
    const sc = terrain.cellOf(sx, sz);
    const tc = terrain.cellOf(tx, tz);
    const start = { cx: Math.max(0, Math.min(n - 1, sc.cx)), cz: Math.max(0, Math.min(n - 1, sc.cz)) };
    const goal = { cx: Math.max(0, Math.min(n - 1, tc.cx)), cz: Math.max(0, Math.min(n - 1, tc.cz)) };
    if (cellCost(terrain, goal.cx, goal.cz) < 0) return null;

    const open: OpenNode[] = [];
    const cameFrom = new Int32Array(n * n).fill(-1);
    const gScore = new Float32Array(n * n).fill(Infinity);
    const closed = new Uint8Array(n * n);

    const startIdx = start.cz * n + start.cx;
    gScore[startIdx] = 0;
    open.push({ g: 0, f: 0, cx: start.cx, cz: start.cz });

    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const dirCost = [1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414];

    const goalIdx = goal.cz * n + goal.cx;
    let found = false;
    let iter = 0;

    while (open.length > 0 && iter < 200000) {
        // 线性取最小 f（128 规模下足够快；避免复杂堆实现）
        let best = 0;
        for (let i = 1; i < open.length; i++) {
            if (open[i].f < open[best].f) best = i;
        }
        const cur = open.splice(best, 1)[0];
        const curIdx = cur.cz * n + cur.cx;
        if (closed[curIdx]) continue;
        closed[curIdx] = 1;
        iter++;
        if (curIdx === goalIdx) { found = true; break; }

        for (let d = 0; d < dirs.length; d++) {
            const nx = cur.cx + dirs[d][0];
            const nz = cur.cz + dirs[d][1];
            if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
            const cost = cellCost(terrain, nx, nz);
            if (cost < 0) continue;
            const nIdx = nz * n + nx;
            if (closed[nIdx]) continue;
            const ng = cur.g + cost * dirCost[d];
            if (ng < gScore[nIdx]) {
                gScore[nIdx] = ng;
                cameFrom[nIdx] = curIdx;
                const h = Math.abs(nx - goal.cx) + Math.abs(nz - goal.cz);
                open.push({ g: ng, f: ng + h, cx: nx, cz: nz });
            }
        }
    }

    if (!found) return null;

    // 回溯路径（简化：每 6 格取一路点）
    const pathCells: { cx: number; cz: number }[] = [];
    let cur = goalIdx;
    while (cur !== startIdx && cameFrom[cur] !== -1) {
        pathCells.push({ cx: cur % n, cz: Math.floor(cur / n) });
        cur = cameFrom[cur];
    }
    pathCells.reverse();

    const waypoints: { x: number; z: number }[] = [];
    const cs = terrain.cellSize;
    for (let i = 0; i < pathCells.length; i += 5) {
        const c = pathCells[i];
        waypoints.push({ x: (c.cx + 0.5) * cs, z: (c.cz + 0.5) * cs });
    }
    waypoints.push({ x: tx, z: tz });
    return waypoints;
}
