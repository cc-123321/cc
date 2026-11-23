import { Node, MeshRenderer, Material, utils, Layers, Color, Mesh } from 'cc';
import { TerrainData, CellKind } from '../sim/Terrain';
import { TerrainPalette } from './Palette';
import { clamp01 } from '../core/MathUtils';

/**
 * 地形渲染：把 sim 高度场一次性烘焙成顶点网格（1 draw call）。
 * 顶点色按地块类型做双线性混合（草/土/岩/河/沙），配合主光+阴影+雾营造电影感。
 */

const KIND_COLOR: Record<number, { r: number; g: number; b: number }> = {
    [CellKind.PLAIN]: TerrainPalette.grass,
    [CellKind.HILL]: TerrainPalette.hillRock,
    [CellKind.FOREST]: { r: 64, g: 86, b: 52 },
    [CellKind.RIVER]: TerrainPalette.river,
    [CellKind.BRIDGE]: TerrainPalette.sand,
    [CellKind.MINE]: TerrainPalette.rock,
};

export class TerrainRenderer {
    public readonly node: Node;

    constructor(parent: Node, terrain: TerrainData) {
        this.node = new Node('Terrain');
        this.node.layer = Layers.Enum.DEFAULT;
        parent.addChild(this.node);

        const mesh = this.buildMesh(terrain);
        const mat = new Material();
        mat.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
        mat.setProperty('mainColor', new Color(255, 255, 255, 255));

        const mr = this.node.addComponent(MeshRenderer);
        mr.mesh = mesh;
        mr.setMaterial(mat, 0);
        mr.shadowCastingMode = 0;   // 地形不投阴影（性能）
        mr.receiveShadow = true;
    }

    public dispose(): void {
        this.node.destroy();
    }

    private buildMesh(terrain: TerrainData): Mesh {
        const n = terrain.size;
        const cs = terrain.cellSize;
        const vertCount = (n + 1) * (n + 1);
        const positions = new Float32Array(vertCount * 3);
        const normals = new Float32Array(vertCount * 3);
        const colors = new Float32Array(vertCount * 4);

        for (let j = 0; j <= n; j++) {
            for (let i = 0; i <= n; i++) {
                const idx = j * (n + 1) + i;
                const x = i * cs, z = j * cs;
                const h = terrain.heights[idx];
                positions[idx * 3] = x;
                positions[idx * 3 + 1] = h;
                positions[idx * 3 + 2] = z;

                // 法线（中心差分）
                const hl = terrain.heightAt(x - cs * 0.5, z);
                const hr = terrain.heightAt(x + cs * 0.5, z);
                const hd = terrain.heightAt(x, z - cs * 0.5);
                const hu = terrain.heightAt(x, z + cs * 0.5);
                let nx = -(hr - hl);
                let nz = -(hu - hd);
                let ny = 2 * cs;
                const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
                normals[idx * 3] = nx * inv;
                normals[idx * 3 + 1] = ny * inv;
                normals[idx * 3 + 2] = nz * inv;

                // 顶点色：按周边 4 格类型双线性混合
                const c = this.sampleColor(terrain, x, z);
                colors[idx * 4] = c.r / 255;
                colors[idx * 4 + 1] = c.g / 255;
                colors[idx * 4 + 2] = c.b / 255;
                colors[idx * 4 + 3] = 1;
            }
        }

        const uvs = new Float32Array(vertCount * 2);
        for (let j = 0; j <= n; j++) {
            for (let i = 0; i <= n; i++) {
                const idx = j * (n + 1) + i;
                uvs[idx * 2] = i / n;
                uvs[idx * 2 + 1] = j / n;
            }
        }

        const indices = new Uint32Array(n * n * 6);
        let k = 0;
        for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
                const a = j * (n + 1) + i;
                const b = a + 1;
                const c = a + (n + 1);
                const d = c + 1;
                indices[k++] = a; indices[k++] = c; indices[k++] = b;
                indices[k++] = b; indices[k++] = c; indices[k++] = d;
            }
        }

        // 烘焙主光到顶点色（unlit 下的明暗层次）
        const lx = -0.42, ly = 0.82, lz = -0.39;
        const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
        for (let vi = 0; vi < vertCount; vi++) {
            const d = (normals[vi * 3] * lx + normals[vi * 3 + 1] * ly + normals[vi * 3 + 2] * lz) / ll;
            const sh = 0.55 + 0.45 * Math.max(0, d);
            colors[vi * 4] *= sh;
            colors[vi * 4 + 1] *= sh;
            colors[vi * 4 + 2] *= sh;
        }

        const mesh = utils.MeshUtils.createMesh({
            positions: positions as unknown as number[],
            normals: normals as unknown as number[],
            uvs: uvs as unknown as number[],
            colors: colors as unknown as number[],
            indices: indices as unknown as number[],
            minPos: { x: 0, y: -1, z: 0 },
            maxPos: { x: n * cs, y: 4, z: n * cs },
        } as never);
        return mesh as Mesh;
    }

    private sampleColor(terrain: TerrainData, wx: number, wz: number): { r: number; g: number; b: number } {
        const n = terrain.size;
        const fx = clamp01(wx / terrain.cellSize);
        const fz = clamp01(wz / terrain.cellSize);
        const x0 = Math.min(n - 1, Math.floor(fx * n));
        const z0 = Math.min(n - 1, Math.floor(fz * n));
        const tx = clamp01(fx * n - x0);
        const tz = clamp01(fz * n - z0);
        const c00 = KIND_COLOR[terrain.kinds[z0 * n + x0]];
        const c10 = KIND_COLOR[terrain.kinds[z0 * n + Math.min(n - 1, x0 + 1)]];
        const c01 = KIND_COLOR[terrain.kinds[Math.min(n - 1, z0 + 1) * n + x0]];
        const c11 = KIND_COLOR[terrain.kinds[Math.min(n - 1, z0 + 1) * n + Math.min(n - 1, x0 + 1)]];
        const r = (c00.r * (1 - tx) + c10.r * tx) * (1 - tz) + (c01.r * (1 - tx) + c11.r * tx) * tz;
        const g = (c00.g * (1 - tx) + c10.g * tx) * (1 - tz) + (c01.g * (1 - tx) + c11.g * tx) * tz;
        const b = (c00.b * (1 - tx) + c10.b * tx) * (1 - tz) + (c01.b * (1 - tx) + c11.b * tx) * tz;
        return { r, g, b };
    }
}
