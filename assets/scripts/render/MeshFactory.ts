import { utils, Mesh } from 'cc';

/**
 * 程序化低模工厂：11 兵种剪影 + 建筑 + 装饰。
 * 零贴图、零骨骼：所有几何由代码拼装，顶点色区分部件明暗，材质按阵营色统一着色。
 * 剪影语言（一眼可辨）：
 *   步兵=矮小成排 / 外骨骼=高宽肩 / 炮兵=长管上扬 / 坦克=扁宽厚重
 *   突击车=低伏前倾 / 机器狗=四腿低矮 / 战斗机=三角翼 / 无人机=小成云
 *   防空车=全场唯一竖线 / 预警机=大盘慢飞 / 工兵=小卡车
 */

type RGB = [number, number, number];

const C = {
    armor: [0.92, 0.95, 0.92] as RGB,
    armorMid: [0.62, 0.66, 0.62] as RGB,
    dark: [0.26, 0.29, 0.28] as RGB,
    darker: [0.16, 0.18, 0.18] as RGB,
    metal: [0.78, 0.8, 0.82] as RGB,
    glass: [0.45, 0.7, 0.8] as RGB,
    accent: [1.0, 0.86, 0.45] as RGB,
    track: [0.22, 0.24, 0.24] as RGB,
};

/** 可增长的几何缓冲 */
class GeoBuf {
    positions: number[] = [];
    normals: number[] = [];
    uvs: number[] = [];
    colors: number[] = [];
    indices: number[] = [];

    /** 轴对齐盒（中心点 + 三轴尺寸），可选绕 Y 轴旋转（弧度） */
    box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: RGB, rotY = 0): void {
        const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
        const cos = Math.cos(rotY), sin = Math.sin(rotY);
        const corners: [number, number, number][] = [
            [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
            [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
        ];
        const verts = corners.map(([x, y, z]) => {
            const rx = x * cos - z * sin;
            const rz = x * sin + z * cos;
            return [cx + rx, cy + y, cz + rz] as [number, number, number];
        });
        const faces: [number, number, number, number][] = [
            [4, 5, 6, 7], [1, 0, 3, 2], [0, 4, 7, 3], [5, 1, 2, 6], [7, 6, 2, 3], [0, 1, 5, 4],
        ];
        const normals: [number, number, number][] = [
            [0, 0, 1], [0, 0, -1], [-1, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0],
        ];
        for (let f = 0; f < faces.length; f++) {
            const [a, b, c2, d] = faces[f];
            const base = this.positions.length / 3;
            for (const vi of [a, b, c2, d]) {
                const v = verts[vi];
                this.positions.push(v[0], v[1], v[2]);
                const n = normals[f];
                const nx = n[0] * cos - n[2] * sin;
                const nz = n[0] * sin + n[2] * cos;
                this.normals.push(nx, n[1], nz);
                this.colors.push(color[0], color[1], color[2], 1);
                this.uvs.push(0, 0);
            }
            this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
    }

    /** 简易圆柱（8 边形） */
    cyl(cx: number, cy: number, cz: number, r: number, h: number, color: RGB, segments = 8, rotZ = 0): void {
        const base = this.positions.length / 3;
        const cosR = Math.cos(rotZ), sinR = Math.sin(rotZ);
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            const x = Math.cos(a) * r;
            const z = Math.sin(a) * r;
            for (const y of [-h * 0.5, h * 0.5]) {
                const px = x;
                const py = y * cosR - z * sinR;
                const pz = y * sinR + z * cosR;
                this.positions.push(cx + px, cy + py, cz + pz);
                this.normals.push(Math.cos(a), 0, Math.sin(a));
                this.colors.push(color[0], color[1], color[2], 1);
                this.uvs.push(0, 0);
            }
        }
        for (let i = 0; i < segments; i++) {
            const a0 = base + i * 2;
            this.indices.push(a0, a0 + 1, a0 + 3, a0, a0 + 3, a0 + 2);
        }
        void this.indices.length;
    }

    /** 四棱锥（尖顶） */
    pyramid(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: RGB): void {
        const hx = sx * 0.5, hz = sz * 0.5;
        const base = this.positions.length / 3;
        const bottom: [number, number, number][] = [
            [cx - hx, cy, cz - hz], [cx + hx, cy, cz - hz], [cx + hx, cy, cz + hz], [cx - hx, cy, cz + hz],
        ];
        const apex: [number, number, number] = [cx, cy + sy, cz];
        for (const b of bottom) {
            this.positions.push(b[0], b[1], b[2]);
            this.normals.push(0, -1, 0);
            this.colors.push(color[0], color[1], color[2], 1);
            this.uvs.push(0, 0);
        }
        for (let i = 0; i < 4; i++) {
            const p0 = bottom[i];
            const p1 = bottom[(i + 1) % 4];
            const vBase = this.positions.length / 3;
            const nx = (p0[0] + p1[0]) * 0.5 - cx;
            const nz = (p0[2] + p1[2]) * 0.5 - cz;
            const len = Math.hypot(nx, 1, nz) || 1;
            for (const p of [p0, p1, apex]) {
                this.positions.push(p[0], p[1], p[2]);
                this.normals.push(nx / len, 0.6, nz / len);
                this.colors.push(color[0], color[1], color[2], 1);
                this.uvs.push(0, 0);
            }
            this.indices.push(vBase, vBase + 1, vBase + 2);
        }
        this.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }

    /** 烘焙主光方向到顶点色：unlit 材质下也能看出体积与明暗 */
    bakeShading(): void {
        const lx = -0.42, ly = 0.82, lz = -0.39;
        const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
        for (let i = 0; i < this.colors.length / 4; i++) {
            const nx = this.normals[i * 3], ny = this.normals[i * 3 + 1], nz = this.normals[i * 3 + 2];
            const d = (nx * lx + ny * ly + nz * lz) / ll;
            const s = 0.52 + 0.48 * Math.max(0, d);
            this.colors[i * 4] *= s;
            this.colors[i * 4 + 1] *= s;
            this.colors[i * 4 + 2] *= s;
        }
    }

    toMesh(name: string): Mesh {
        this.bakeShading();
        const geo = {
            positions: this.positions,
            normals: this.normals,
            uvs: this.uvs,
            colors: this.colors,
            indices: this.indices,
        };
        const mesh = utils.createMesh(geo as never);
        mesh.name = name;
        return mesh;
    }
}

// ------------------------------------------------------------------ 兵种

function buildInfantry(g: GeoBuf): void {
    // 4 人小队：矮小、成排、有起伏
    for (let i = 0; i < 4; i++) {
        const ox = (i % 2) * 0.34 - 0.17;
        const oz = Math.floor(i / 2) * 0.34 - 0.17;
        g.box(ox, 0.24, oz, 0.2, 0.44, 0.16, C.armorMid);
        g.box(ox, 0.52, oz, 0.16, 0.14, 0.14, C.dark);       // 头/钢盔
        g.box(ox + 0.13, 0.34, oz, 0.1, 0.3, 0.1, C.darker);  // 枪
    }
}

function buildExo(g: GeoBuf): void {
    for (let i = 0; i < 2; i++) {
        const ox = i * 0.5 - 0.25;
        g.box(ox, 0.55, 0, 0.34, 0.6, 0.26, C.armorMid);
        g.box(ox, 0.98, 0, 0.5, 0.16, 0.3, C.armor);    // 宽肩
        g.box(ox, 1.14, 0, 0.18, 0.16, 0.18, C.dark);   // 头
        g.box(ox, 0.22, 0, 0.12, 0.34, 0.12, C.darker); // 腿
        g.box(ox + 0.26, 0.72, 0.02, 0.1, 0.5, 0.1, C.darker); // 武器
    }
}

function buildArtillery(g: GeoBuf): void {
    g.box(0, 0.22, 0, 0.5, 0.2, 0.9, C.armorMid);      // 车架
    g.box(0, 0.5, -0.15, 0.44, 0.18, 0.5, C.armor);     // 炮座
    // 长炮管上扬 30°
    const barrel = new GeoBuf();
    g.cyl(0, 0.62, 0.1, 0.06, 1.1, C.metal, 6, -0.5);
    g.box(0, 0.28, 0.05, 0.34, 0.3, 0.34, C.darker);
    void barrel;
    // 轮
    g.cyl(-0.3, 0.24, 0.22, 0.24, 0.16, C.track, 8, Math.PI / 2);
    g.cyl(0.3, 0.24, 0.22, 0.24, 0.16, C.track, 8, Math.PI / 2);
}

function buildTank(g: GeoBuf): void {
    g.box(0, 0.28, 0, 0.95, 0.32, 1.5, C.armorMid);      // 宽车体
    g.box(0, 0.2, 0, 1.05, 0.16, 1.6, C.track);          // 履带
    g.box(0, 0.56, -0.1, 0.72, 0.3, 0.9, C.armor);       // 炮塔
    g.box(0, 0.62, 0.62, 0.13, 0.12, 0.85, C.metal);     // 炮管
    g.box(0, 0.6, -0.5, 0.4, 0.16, 0.3, C.dark);         // 后舱
}

function buildAssaultCar(g: GeoBuf): void {
    g.box(0, 0.3, 0.05, 0.72, 0.2, 1.3, C.armorMid);   // 低伏车身
    g.box(0, 0.48, -0.28, 0.5, 0.26, 0.5, C.glass);    // 前倾车厢
    g.box(0, 0.42, 0.55, 0.3, 0.12, 0.4, C.dark);      // 车头
    for (const ox of [-0.38, 0.38]) {
        for (const oz of [-0.42, 0.42]) {
            g.cyl(ox, 0.22, oz, 0.22, 0.14, C.track, 8, Math.PI / 2);
        }
    }
}

function buildRoboDog(g: GeoBuf): void {
    g.box(0, 0.42, 0, 0.4, 0.22, 0.85, C.armorMid);      // 低矮机体
    g.box(0, 0.5, 0.42, 0.22, 0.18, 0.2, C.dark);        // 头部传感器
    for (const ox of [-0.18, 0.18]) {
        for (const oz of [-0.3, 0.3]) {
            g.box(ox, 0.2, oz, 0.06, 0.34, 0.06, C.darker); // 四条腿
        }
    }
    g.box(0, 0.6, -0.3, 0.1, 0.1, 0.28, C.accent);        // 背部天线
}

function buildFighter(g: GeoBuf): void {
    g.box(0, 0, 0, 0.34, 0.18, 1.5, C.armor);           // 细长机身
    // 三角翼
    g.box(-0.55, 0, 0.15, 0.9, 0.08, 0.5, C.armorMid, -0.5);
    g.box(0.55, 0, 0.15, 0.9, 0.08, 0.5, C.armorMid, 0.5);
    g.box(0, 0.16, -0.62, 0.16, 0.24, 0.34, C.dark);    // 尾翼
    g.box(0, -0.02, 0.85, 0.12, 0.12, 0.4, C.glass);    // 机首
}

function buildDrone(g: GeoBuf): void {
    g.box(0, 0, 0, 0.3, 0.14, 0.3, C.armorMid);
    for (const ox of [-0.22, 0.22]) {
        for (const oz of [-0.22, 0.22]) {
            g.cyl(ox, 0, oz, 0.14, 0.03, C.glass, 6);
            g.box(ox, 0.01, oz, 0.02, 0.16, 0.02, C.darker);
        }
    }
}

function buildAAVehicle(g: GeoBuf): void {
    g.box(0, 0.26, 0, 0.62, 0.22, 1.15, C.armorMid);
    g.box(0, 0.5, -0.25, 0.5, 0.28, 0.45, C.dark);
    // 全场唯一竖线：竖起的发射架
    g.box(0, 1.0, 0.25, 0.34, 1.0, 0.12, C.armor);
    g.box(-0.12, 1.15, 0.25, 0.08, 0.5, 0.08, C.metal);
    g.box(0.12, 1.15, 0.25, 0.08, 0.5, 0.08, C.metal);
    for (const ox of [-0.32, 0.32]) {
        for (const oz of [-0.36, 0.36]) {
            g.cyl(ox, 0.2, oz, 0.24, 0.14, C.track, 8, Math.PI / 2);
        }
    }
}

function buildAwacs(g: GeoBuf): void {
    g.box(0, 0, 0, 0.4, 0.2, 2.2, C.armor);      // 大盘子机身
    g.cyl(0, 0.3, 0.1, 0.9, 0.12, C.armorMid, 12); // 预警雷达盘
    g.box(0, 0.12, -0.9, 0.7, 0.06, 0.4, C.armorMid);
    g.box(0, -0.05, 0.9, 0.16, 0.16, 0.4, C.glass);
}

function buildEngineer(g: GeoBuf): void {
    g.box(0, 0.3, 0, 0.6, 0.24, 0.9, C.armorMid);
    g.box(0, 0.5, -0.2, 0.44, 0.2, 0.4, C.dark);
    g.box(0, 0.44, 0.42, 0.4, 0.18, 0.3, C.accent); // 推土铲
    for (const ox of [-0.3, 0.3]) {
        for (const oz of [-0.28, 0.28]) {
            g.cyl(ox, 0.2, oz, 0.2, 0.12, C.track, 6, Math.PI / 2);
        }
    }
}

const UNIT_BUILDERS: Record<string, (g: GeoBuf) => void> = {
    infantry: buildInfantry,
    exo: buildExo,
    artillery: buildArtillery,
    tank: buildTank,
    assaultCar: buildAssaultCar,
    roboDog: buildRoboDog,
    fighter: buildFighter,
    drone: buildDrone,
    aaVehicle: buildAAVehicle,
    awacs: buildAwacs,
    engineer: buildEngineer,
};

/** 单位模型缓存（每种兵种一个合并网格，1 draw call） */
export class UnitMeshLibrary {
    private _meshes = new Map<string, Mesh>();

    public get(unitType: string): Mesh | null {
        const cached = this._meshes.get(unitType);
        if (cached) return cached;
        const builder = UNIT_BUILDERS[unitType];
        if (!builder) return null;
        const g = new GeoBuf();
        builder(g);
        const mesh = g.toMesh(`unit_${unitType}`);
        this._meshes.set(unitType, mesh);
        return mesh;
    }
}

// ------------------------------------------------------------------ 建筑

const BUILDING_BUILDERS: Record<string, (g: GeoBuf) => void> = {
    commandCenter: (g) => {
        g.box(0, 1.0, 0, 2.4, 2.0, 2.4, C.armorMid);
        g.box(0, 2.15, 0, 1.6, 0.3, 1.6, C.armor);
        g.box(0, 3.0, 0.6, 0.12, 1.8, 0.12, C.metal);   // 天线
        g.box(0, 3.9, 0.6, 0.5, 0.1, 0.5, C.accent);
        g.box(1.0, 1.4, 1.1, 0.7, 0.7, 0.12, C.glass);  // 窗
    },
    barracks: (g) => {
        g.box(0, 0.7, 0, 2.2, 1.4, 1.5, C.armorMid);
        g.box(0, 1.5, 0, 2.4, 0.16, 1.7, C.dark);
        g.box(-0.7, 0.9, 0.78, 0.4, 0.5, 0.06, C.glass);
        g.box(0.7, 0.9, 0.78, 0.4, 0.5, 0.06, C.glass);
    },
    factory: (g) => {
        g.box(0, 1.0, 0, 2.8, 2.0, 2.0, C.armorMid);
        g.box(0, 2.1, 0, 2.9, 0.2, 2.1, C.dark);
        g.cyl(1.0, 2.7, -0.6, 0.28, 1.2, C.darker, 8);   // 烟囱
        g.box(0, 0.5, 1.05, 1.4, 1.0, 0.08, C.glass);
    },
    airport: (g) => {
        g.box(0, 0.5, 0, 3.2, 0.9, 2.2, C.armorMid);
        g.box(0, 1.3, 0, 1.4, 0.8, 1.2, C.armor);
        g.box(0, 1.85, 0, 1.8, 0.12, 1.5, C.dark);
    },
    radar: (g) => {
        g.box(0, 0.6, 0, 0.7, 1.2, 0.7, C.armorMid);
        g.cyl(0, 1.5, 0, 0.9, 0.1, C.armor, 12, -0.5);   // 雷达盘
        g.box(0, 1.9, 0, 0.1, 0.6, 0.1, C.metal);
    },
    mine: (g) => {
        g.box(0, 0.5, 0, 1.6, 0.6, 1.6, C.darker);
        g.box(-0.5, 1.4, -0.5, 0.1, 1.6, 0.1, C.metal);   // 井架
        g.box(0.5, 1.4, 0.5, 0.1, 1.6, 0.1, C.metal);
        g.box(0, 2.2, 0, 0.7, 0.1, 0.7, C.accent);
    },
    turret: (g) => {
        g.cyl(0, 0.3, 0, 0.6, 0.6, C.armorMid, 8);
        g.box(0, 0.85, 0, 0.7, 0.5, 0.7, C.armor);
        g.box(0, 0.95, 0.55, 0.1, 0.1, 0.8, C.metal);
    },
    missileDefense: (g) => {
        g.cyl(0, 0.35, 0, 0.65, 0.7, C.armorMid, 8);
        g.box(0, 1.05, 0, 0.5, 0.7, 0.5, C.dark);
        g.box(0, 1.55, 0, 0.12, 0.55, 0.12, C.metal);
        g.box(0, 1.85, 0, 0.4, 0.08, 0.4, C.accent);
    },
    fortification: (g) => {
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            g.box(Math.cos(a) * 0.8, 0.3, Math.sin(a) * 0.8, 0.45, 0.5, 0.3, C.armorMid, a);
        }
        g.box(0, 0.16, 0, 1.7, 0.22, 1.7, C.darker);
    },
};

export class BuildingMeshLibrary {
    private _meshes = new Map<string, Mesh>();

    public get(type: string): Mesh | null {
        const cached = this._meshes.get(type);
        if (cached) return cached;
        const builder = BUILDING_BUILDERS[type];
        if (!builder) return null;
        const g = new GeoBuf();
        builder(g);
        const mesh = g.toMesh(`bld_${type}`);
        this._meshes.set(type, mesh);
        return mesh;
    }
}

// ------------------------------------------------------------------ 装饰/弹道

export function createTreeMesh(): Mesh {
    const g = new GeoBuf();
    g.cyl(0, 0.5, 0, 0.12, 1.0, C.darker, 5);
    g.pyramid(0, 1.0, 0, 1.0, 1.5, 1.0, [0.22, 0.34, 0.2]);
    return g.toMesh('deco_tree');
}

export function createRockMesh(): Mesh {
    const g = new GeoBuf();
    g.box(0, 0.3, 0, 0.8, 0.6, 0.7, C.armorMid, 0.4);
    g.box(0.25, 0.5, 0.1, 0.45, 0.35, 0.4, C.dark, 0.9);
    return g.toMesh('deco_rock');
}

export function createFlagMesh(): Mesh {
    const g = new GeoBuf();
    g.box(0, 1.1, 0, 0.06, 2.2, 0.06, C.metal);
    g.box(0.32, 1.9, 0, 0.6, 0.4, 0.03, C.accent);
    return g.toMesh('deco_flag');
}

/** 曳光弹（细长四边形朝向速度方向） */
export function createTracerMesh(): Mesh {
    const g = new GeoBuf();
    g.box(0, 0, 0.5, 0.08, 0.08, 1.0, [1, 0.9, 0.6]);
    return g.toMesh('fx_tracer');
}

/** 烟尘球（低模面片球） */
export function createSmokeMesh(): Mesh {
    const g = new GeoBuf();
    g.cyl(0, 0, 0, 0.5, 0.5, [0.7, 0.7, 0.7], 6);
    return g.toMesh('fx_smoke');
}
