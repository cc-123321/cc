import { Node, MeshRenderer, Material, Color, Vec3, Mesh, game } from 'cc';
import { UnitMeshLibrary, BuildingMeshLibrary, createTracerMesh, createSmokeMesh, createTreeMesh, createRockMesh } from './MeshFactory';
import { FactionTint, FactionName } from './Palette';
import type { FactionId } from '../data/ConfigTypes';
import type { World, UnitSnapshot, BuildingSnapshot, ProjectileSnapshot } from '../sim/World';
import { CameraRig } from './CameraRig';

/**
 * 战场视图：只读 sim 快照 → 程序化低模渲染。
 * 单位/建筑/弹道各自池化；位置用 prev→cur 插值（30Hz 逻辑 / 60fps 渲染）。
 */

const _v3 = new Vec3();

export class WorldView {
    public root: Node;
    private _unitMeshes = new UnitMeshLibrary();
    private _buildingMeshes = new BuildingMeshLibrary();
    private _mats = new Map<string, Material>();
    private _unitNodes = new Map<number, Node>();
    private _buildingNodes = new Map<number, Node>();
    private _tracerMesh: Mesh;
    private _smokeMesh: Mesh;
    private _fxNodes: { node: Node; life: number; maxLife: number; vy: number }[] = [];
    private _tracerPool: Node[] = [];
    private _lastProjectiles: { x: number; z: number; y: number; kind: string; faction: FactionId }[] = [];
    private _rig: CameraRig;

    public constructor(parent: Node, rig: CameraRig) {
        this.root = new Node('WorldView');
        parent.addChild(this.root);
        this._rig = rig;
        this._tracerMesh = createTracerMesh();
        this._smokeMesh = createSmokeMesh();
        this._buildDecor();
    }

    /** 地形之上散布装饰（树/岩），纯视觉，不参与碰撞 */
    private _buildDecor(): void {
        const treeMesh = createTreeMesh();
        const rockMesh = createRockMesh();
        const decor = new Node('Decor');
        this.root.addChild(decor);
        // 用固定种子撒点，避免每帧变化
        let seed = 8821;
        const rnd = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };
        const mat = this._getFactionMat('decor', [130, 150, 130], 0.95, 0.05);
        for (let i = 0; i < 120; i++) {
            const isTree = rnd() > 0.35;
            const n = new Node(`decor_${i}`);
            decor.addChild(n);
            const mr = n.addComponent(MeshRenderer);
            mr.mesh = isTree ? treeMesh : rockMesh;
            mr.material = mat;
            mr.shadowCastingMode = 0;
            n.setPosition(rnd() * 126 + 1, 0, rnd() * 126 + 1);
            const s = 0.6 + rnd() * 0.9;
            n.setScale(s, s, s);
        }
    }

    // ------------------------------------------------------------ 材质

    private _getFactionMat(key: string, rgb: [number, number, number], rough = 0.88, metal = 0.1): Material {
        const cached = this._mats.get(key);
        if (cached) return cached;
        const mat = new Material();
        // 本次构建只注册了 builtin-unlit：用顶点色烘焙主光获得体积感（零 shader 依赖）
        mat.initialize({
            effectName: 'builtin-unlit',
            defines: { USE_VERTEX_COLOR: true } as never,
        });
        mat.setProperty('mainColor', new Color(rgb[0], rgb[1], rgb[2], 255));
        this._mats.set(key, mat);
        return mat;
    }

    private _factionMat(f: FactionId): Material {
        const tint = FactionTint[f];
        return this._getFactionMat(`f_${f}`, [tint.r, tint.g, tint.b], 0.86, 0.12);
    }

    // ------------------------------------------------------------ 同步

    public sync(world: World, alpha: number): void {
        this._syncUnits(world, alpha);
        this._syncBuildings(world);
        this._syncProjectiles(world);
        this._updateFx();
    }

    private _syncUnits(world: World, alpha: number): void {
        const alive = new Set<number>();
        for (const u of world.units as unknown as UnitSnapshot[]) {
            if ((u as unknown as { dead: boolean }).dead) continue;
            alive.add(u.id);
            let node = this._unitNodes.get(u.id);
            if (!node) {
                node = this._createUnitNode(u);
                this._unitNodes.set(u.id, node);
            }
            const ix = u.prevX + (u.x - u.prevX) * alpha;
            const iz = u.prevZ + (u.z - u.prevZ) * alpha;
            node.setPosition(ix, u.def.id === 'fighter' || u.def.id === 'awacs' ? 2.2 : (u.def.id === 'drone' ? 1.1 : 0), iz);
            const yaw = -u.facing + 90;
            node.setRotationFromEuler(0, yaw, 0);
        }
        for (const [id, node] of this._unitNodes) {
            if (!alive.has(id)) {
                this._unitNodes.delete(id);
                this._spawnDeathFx(node.position);
                node.destroy();
            }
        }
    }

    private _createUnitNode(u: UnitSnapshot): Node {
        const node = new Node(`u_${u.id}`);
        this.root.addChild(node);
        const mr = node.addComponent(MeshRenderer);
        mr.mesh = this._unitMeshes.get(u.def.id);
        mr.material = this._factionMat(u.faction);
        mr.shadowCastingMode = 1;
        const scale = 1.0;
        node.setScale(scale, scale, scale);
        return node;
    }

    private _syncBuildings(world: World): void {
        const alive = new Set<number>();
        for (const b of world['buildings'] as unknown as (BuildingSnapshot & { dead: boolean; def: { id: string } })[]) {
            if (b.dead) continue;
            alive.add(b.id);
            let node = this._buildingNodes.get(b.id);
            if (!node) {
                node = new Node(`b_${b.id}`);
                this.root.addChild(node);
                const mr = node.addComponent(MeshRenderer);
                mr.mesh = this._buildingMeshes.get(b.def.id);
                mr.material = this._factionMat(b.faction);
                mr.shadowCastingMode = 1;
                node.setPosition(b.x, 0, b.z);
                this._buildingNodes.set(b.id, node);
            }
        }
        for (const [id, node] of this._buildingNodes) {
            if (!alive.has(id)) {
                this._buildingNodes.delete(id);
                this._spawnDeathFx(node.position, true);
                node.destroy();
            }
        }
    }

    private _syncProjectiles(world: World): void {
        // 池化曳光节点
        const list = world.projectiles;
        while (this._tracerPool.length < list.length) {
            const n = new Node('tracer');
            this.root.addChild(n);
            const mr = n.addComponent(MeshRenderer);
            mr.mesh = this._tracerMesh;
            mr.material = this._getFactionMat('tracer', [255, 210, 140], 0.4, 0);
            mr.shadowCastingMode = 0;
            n.active = false;
            this._tracerPool.push(n);
        }
        for (let i = 0; i < this._tracerPool.length; i++) {
            const n = this._tracerPool[i];
            const p = list[i] as ProjectileSnapshot | undefined;
            if (!p) { n.active = false; continue; }
            n.active = true;
            n.setPosition(p.x, p.y, p.z);
            // 朝向飞行方向
            const next = list[i + 1] ?? null;
            void next;
            n.setRotationFromEuler(p.kind === 'arc' ? 0 : 0, 0, p.kind === 'arc' ? 0 : 0);
        }
    }

    // ------------------------------------------------------------ FX

    public spawnImpactFx(x: number, z: number, strong: boolean): void {
        const n = new Node('fx_smoke');
        this.root.addChild(n);
        const mr = n.addComponent(MeshRenderer);
        mr.mesh = this._smokeMesh;
        mr.material = this._getFactionMat('smoke', [200, 190, 170], 1, 0);
        mr.shadowCastingMode = 0;
        n.setPosition(x, 0.4, z);
        const s = strong ? 2.2 : 1.2;
        n.setScale(s, s, s);
        this._fxNodes.push({ node: n, life: 0, maxLife: strong ? 0.9 : 0.5, vy: strong ? 2.4 : 1.2 });
        if (strong) this._rig.shake(0.35, 0.22);
    }

    private _spawnDeathFx(pos: Vec3, building = false): void {
        const n = new Node('fx_death');
        this.root.addChild(n);
        const mr = n.addComponent(MeshRenderer);
        mr.mesh = this._smokeMesh;
        mr.material = this._getFactionMat('smoke', [190, 170, 150], 1, 0);
        mr.shadowCastingMode = 0;
        n.setPosition(pos.x, 0.5, pos.z);
        const s = building ? 3.0 : 1.6;
        n.setScale(s, s, s);
        this._fxNodes.push({ node: n, life: 0, maxLife: building ? 1.2 : 0.6, vy: building ? 3.2 : 1.8 });
        this._rig.shake(building ? 0.5 : 0.18, building ? 0.4 : 0.15);
    }

    private _updateFx(): void {
        const dt = game.deltaTime;
        for (let i = this._fxNodes.length - 1; i >= 0; i--) {
            const fx = this._fxNodes[i];
            fx.life += dt;
            const t = fx.life / fx.maxLife;
            if (t >= 1) {
                fx.node.destroy();
                this._fxNodes.splice(i, 1);
                continue;
            }
            const p = fx.node.position;
            fx.node.setPosition(p.x, p.y + fx.vy * dt, p.z);
            const s = 1 + t * 1.4;
            fx.node.setScale(s, s * 0.8, s);
        }
    }

    /** 当前存活的渲染对象数（调试用） */
    public nodeCount(): number {
        return this._unitNodes.size + this._buildingNodes.size;
    }

    public dispose(): void {
        this._unitNodes.forEach((n) => n.destroy());
        this._buildingNodes.forEach((n) => n.destroy());
        this._unitNodes.clear();
        this._buildingNodes.clear();
        this.root.destroy();
    }
}
