import { Node, Camera, UITransform, Layers, Input, input, EventTouch, EventMouse, view, Vec2 } from 'cc';
import { DEBUG } from 'cc/env';
import { loadConfig, GameConfig } from '../data/ConfigLoader';
import { World } from '../sim/World';
import { setupMatch } from './MatchSetup';
import { CameraRig } from '../render/CameraRig';
import { TerrainRenderer } from '../render/TerrainRenderer';
import { TerritoryOverlay } from '../render/TerritoryOverlay';
import { WorldView } from '../render/WorldView';
import { HUD } from '../ui/HUD';
import { TacticId } from '../sim/Tactics';
import { createPlatform } from '../platform/PlatformFactory';
import { AdService } from '../platform/AdService';
import { IPlatform } from '../platform/IPlatform';
import { FactionId } from '../data/ConfigTypes';

/**
 * 局内流程状态机：布阵(12s) → 战斗(30Hz 定步长) → 结算 → 重打。
 * 输入：单指拖动=平移镜头，单指点地面=画线推进（全军向该点推进），双指=缩放。
 * 布阵阶段：点己方单位选中，再点地面=部署到位；提前开战把剩余秒数换成产能。
 */

const STEP = 1 / 30;
const DEPLOY_SECONDS = 12;

export class GameDirector {
    private readonly _root: Node;
    private readonly _camNode: Node;
    private readonly _cam: Camera;
    private readonly _canvas: Node;

    private _config: GameConfig = null as unknown as GameConfig;
    private _world: World = null as unknown as World;
    private _rig: CameraRig = null as unknown as CameraRig;
    private _overlay: TerritoryOverlay = null as unknown as TerritoryOverlay;
    private _view: WorldView = null as unknown as WorldView;
    private _hud: HUD = null as unknown as HUD;
    private _terrainRenderer: TerrainRenderer | null = null;

    private _platform: IPlatform = null as unknown as IPlatform;
    private _ads: AdService = null as unknown as AdService;

    private _acc = 0;
    private _speed = 1;
    private _paused = false;
    private _deployLeft = DEPLOY_SECONDS;
    private _seed = 1;
    private _matchIndex = 0;
    private _resultShown = false;
    private _time = 0;
    private _fps = 60;
    private _dbgAcc = 0;

    // 触摸状态
    private _touches = new Map<number, Vec2>();
    private _touchStart: Vec2 | null = null;
    private _dragging = false;
    private _lastPanPos: Vec2 | null = null;
    private _lastPinch = 0;
    private _deploySelected: number | null = null;

    constructor(root: Node, camNode: Node, cam: Camera, canvas: Node) {
        this._root = root;
        this._camNode = camNode;
        this._cam = cam;
        this._canvas = canvas;
    }

    public async init(): Promise<void> {
        this._config = await loadConfig();
        this._platform = createPlatform();
        await this._platform.init();
        this._ads = new AdService(this._platform);

        const visible = view.getVisibleSize();
        this._rig = new CameraRig(this._camNode, this._cam, this._config.map.terrain.size, visible.width, visible.height);

        this._hud = new HUD(this._canvas, {
            queueUnit: (t) => this._queueUnit(t),
            useTactic: (t) => this._useTactic(t),
            setSpeed: (s) => this._setSpeed(s),
            skipDeploy: () => this._skipDeploy(),
            restart: (m) => this._restart(m),
            watchAd: (k) => this._ads.rewarded(k),
            minimapTap: (x, z) => this._rig.panTo(x, z),
        });

        this._setupInput();
        // 出战准备屏 → 点「开始作战」进入第一局
        this._hud.showStart(() => this._startMatch(false));

        if (DEBUG) console.log('[StormAction] ready');
    }

    // ---------------------------------------------------------------- 单局

    private _startMatch(replay: boolean): void {
        if (this._view) this._view.dispose();
        if (this._terrainRenderer) { this._terrainRenderer.dispose(); this._terrainRenderer = null; }
        if (this._overlay) { this._overlay.dispose(); this._overlay = null; }

        if (!replay) {
            this._matchIndex++;
            this._seed = 20261122 + this._matchIndex * 97;
        }
        const world = new World({ config: this._config, seed: this._seed });
        setupMatch(world, this._config);
        this._world = world;

        if (DEBUG) (globalThis as unknown as Record<string, unknown>).__saWorld = world;
        this._terrainRenderer = new TerrainRenderer(this._root, world.terrain);
        this._overlay = new TerritoryOverlay(this._root, world.terrain.size);
        this._view = new WorldView(this._root, this._rig);

        const spawn = this._config.map.spawns['west'];
        if (spawn) this._rig.panTo(spawn.x, spawn.z);

        this._deployLeft = DEPLOY_SECONDS;
        this._acc = 0;
        this._speed = 1;
        this._paused = false;
        this._resultShown = false;
        this._deploySelected = null;
        this._ads.setBattleActive(false);
        this._hud.hideResult();
        this._hud.showDeploy(this._deployLeft);
        this._hud.showHint('布阵：点己方单位选中，再点地面部署；也可直接点地面推进', 3.4);
        this._platform.startRecord();
    }

    private _restart(mode: 'new' | 'replay'): void {
        // 局间插屏：只在结算后、由频控决定是否展示
        void this._ads.interstitial();
        this._startMatch(mode === 'replay');
    }

    // ---------------------------------------------------------------- 主循环

    public update(dt: number): void {
        if (!this._world) return;
        this._time += dt;
        this._rig.update(dt);

        const w = this._world;
        if (w.phase === 'deploy') {
            this._deployLeft -= dt;
            this._hud.showDeploy(Math.max(0, this._deployLeft));
            if (this._deployLeft <= 0) this._beginBattle(0);
            this._world.deployStep(); // 只处理部署命令，不推进战斗时间轴
        } else if (w.phase === 'battle' && !this._paused) {
            this._acc += dt * this._speed;
            let steps = 0;
            while (this._acc >= STEP && steps < 6) {
                this._world.step();
                this._acc -= STEP;
                steps++;
                if (this._world.phase !== 'battle') break;
            }
            if (this._acc > STEP * 6) this._acc = 0;
        }

        const alpha = this._paused ? 1 : Math.min(1, this._acc / STEP);
        this._view.sync(this._world, alpha);
        this._overlay.sync(this._world.territory, this._time);
        this._hud.update(this._world, dt);

        if (DEBUG) {
            this._fps = this._fps * 0.9 + (1 / Math.max(dt, 0.0001)) * 0.1;
            this._dbgAcc += dt;
            if (this._dbgAcc > 0.5) {
                this._dbgAcc = 0;
                const alive = this._world.units.reduce((n, u) => n + (u.dead ? 0 : 1), 0);
                this._hud.setDebugText(
                    `fps ${this._fps.toFixed(0)} | tick ${this._world.tick} | 单位 ${alive} | dc≈${this._view.nodeCount()} | ${this._world.phase} | ${this._world.weather}`,
                );
            }
        }

        if (this._world.phase === 'over' && !this._resultShown) {
            this._resultShown = true;
            this._onMatchOver();
        }
    }

    private _onMatchOver(): void {
        const w = this._world;
        this._ads.setBattleActive(false);
        const merit = w.winner === 'west' ? 120 : w.isStalemate() ? 80 : 50;
        this._hud.hideDeploy();
        this._hud.showResult(w, merit);
        this._addMerit(merit);
        void this._platform.stopRecordAndShare('我在《风暴行动》打了一场三方会战');
    }

    private _addMerit(merit: number): void {
        const raw = this._platform.getStorage('sa_merit');
        const total = (raw ? Number(raw) : 0) + merit;
        this._platform.setStorage('sa_merit', String(total));
    }

    private _beginBattle(skipSeconds: number): void {
        const w = this._world;
        if (skipSeconds > 0) {
            w.enqueue({ kind: 'skipDeploy', faction: 'west', seconds: skipSeconds });
        }
        w.startBattle();
        this._ads.setBattleActive(true); // 战中禁播一切广告
        this._hud.hideDeploy();
        this._deploySelected = null;
        this._hud.showHint('点地面下令推进 · 全军向该点涌出', 2.6);
        this._platform.vibrate(false);
    }

    private _skipDeploy(): void {
        if (this._world.phase !== 'deploy') return;
        const left = Math.max(0, this._deployLeft);
        this._beginBattle(left);
    }

    // ---------------------------------------------------------------- 操作

    /**
     * 玩家点兵种：设定对应建筑的"持续生产偏好"（建筑自动连续产兵），
     * 同时立刻补一队，避免点了没反应。玩家只需决定"出什么、往哪去"。
     */
    private _queueUnit(type: string): void {
        if (!this._world || this._world.phase !== 'battle') return;
        const producers = this._world.buildings.filter((b) =>
            b.faction === 'west' && !b.dead && b.def.produces.includes(type));
        if (producers.length === 0) {
            this._hud.showHint(`没有能生产「${this._world.config.units[type]?.name ?? type}」的建筑`);
            return;
        }
        // 优先选已经在产该兵种的，其次选空闲的
        const target = producers.find((b) => b.autoType === type)
            ?? producers.find((b) => !b.produceType)
            ?? producers[0];
        this._world.enqueue({ kind: 'autoProduce', faction: 'west', buildingId: target.id, unitType: type });
        if (!target.produceType) {
            this._world.enqueue({ kind: 'queueUnit', faction: 'west', buildingId: target.id, unitType: type });
        }
        const def = this._world.config.units[type];
        this._hud.showHint(`${target.def.name} 转为持续生产：${def?.name ?? type}`);
    }

    private _useTactic(t: TacticId): void {
        if (!this._world || this._world.phase !== 'battle') return;
        const p = this._rig.screenToGround(640, 360);
        this._world.enqueue({ kind: 'tactic', faction: 'west', tactic: t, x: p.x, z: p.z });
    }

    private _setSpeed(s: number): void {
        this._paused = s === 0;
        this._speed = s === 0 ? 1 : s;
    }

    private _pushToward(x: number, z: number): void {
        this._world.enqueue({ kind: 'rally', faction: 'west', x, z, weight: 1 });
        this._view.spawnImpactFx(x, z, false);
    }

    // ---------------------------------------------------------------- 输入

    private _setupInput(): void {
        // 全屏输入层（位于 HUD 之下：按钮优先命中，空白处才到这里）
        const layer = new Node('BattleInput');
        layer.layer = Layers.Enum.UI_2D;
        this._canvas.insertChild(layer, 0);
        const ut = layer.addComponent(UITransform);
        ut.setContentSize(1280, 720);

        layer.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
            const loc = e.getUILocation();
            this._touches.set(e.getID(), new Vec2(loc.x, loc.y));
            if (this._touches.size === 1) {
                this._touchStart = new Vec2(loc.x, loc.y);
                this._lastPanPos = new Vec2(loc.x, loc.y);
                this._dragging = false;
            }
            this._lastPinch = 0;
        });

        layer.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
            const loc = e.getUILocation();
            const prev = this._touches.get(e.getID());
            if (prev) this._touches.set(e.getID(), new Vec2(loc.x, loc.y));

            if (this._touches.size >= 2) {
                const pts = [...this._touches.values()];
                const d = Vec2.distance(pts[0], pts[1]);
                if (this._lastPinch > 0) this._rig.zoomBy((d / this._lastPinch - 1) * 70);
                this._lastPinch = d;
                this._dragging = true;
                return;
            }
            if (!this._lastPanPos) return;
            const dx = loc.x - this._lastPanPos.x;
            const dy = loc.y - this._lastPanPos.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) this._dragging = true;
            if (this._dragging) this._rig.panByScreen(-dx, -dy);
            this._lastPanPos.set(loc.x, loc.y);
        });

        const end = (e: EventTouch) => {
            const loc = e.getUILocation();
            const id = e.getID();
            const wasSingle = this._touches.size === 1;
            this._touches.delete(id);
            this._lastPinch = 0;
            this._lastPanPos = null;

            if (wasSingle && !this._dragging) this._onTap(loc.x, loc.y);
            this._touchStart = null;
            this._dragging = false;
        };
        layer.on(Node.EventType.TOUCH_END, end);
        layer.on(Node.EventType.TOUCH_CANCEL, end);

        input.on(Input.EventType.MOUSE_WHEEL, (e: EventMouse) => this._rig.zoomBy(-e.getScrollY() * 2), this);
    }

    private _onTap(sx: number, sy: number): void {
        const p = this._rig.screenToGround(sx, sy);
        const w = this._world;
        if (w.phase === 'deploy') {
            // 布阵：先选中己方单位，再点地面部署
            if (this._deploySelected == null) {
                const near = w.units
                    .filter((u) => u.faction === 'west' && !u.dead)
                    .sort((a, b) => Vec2.distance(new Vec2(a.x, a.z), new Vec2(p.x, p.z)) - Vec2.distance(new Vec2(b.x, b.z), new Vec2(p.x, p.z)))[0];
                if (near && Vec2.distance(new Vec2(near.x, near.z), new Vec2(p.x, p.z)) < 12) {
                    this._deploySelected = near.id;
                    this._hud.showHint('已选中部队，点地面部署到位', 2.2);
                    return;
                }
            } else {
                w.enqueue({ kind: 'moveUnit', faction: 'west', unitId: this._deploySelected, x: p.x, z: p.z });
                this._hud.showHint('部署完成', 1.4);
                this._deploySelected = null;
                return;
            }
            this._pushToward(p.x, p.z);
            return;
        }
        if (w.phase === 'battle') this._pushToward(p.x, p.z);
    }
}
