import { Node, UITransform, Graphics, Label, Color } from 'cc';
import {
    makeNode, makeLabel, makeLabelLeft, makeButton, drawPanel, drawBar, fadeIn,
    hex, COL, SCREEN_W, SCREEN_H, SX, SY, ButtonHandle,
} from './UIFactory';
import { FactionColor } from '../render/Palette';
import type { World } from '../sim/World';
import type { FactionId } from '../data/ConfigTypes';
import { TACTIC_IDS, TacticId } from '../sim/Tactics';
import { LogType } from '../sim/BattleLog';

/** UI ↔ 游戏流程回调（UI 只发命令，不直接改世界状态） */
export interface HUDCallbacks {
    queueUnit(unitType: string): void;
    useTactic(tactic: TacticId): void;
    setSpeed(speed: number): void;
    skipDeploy(): void;
    restart(mode: 'new' | 'replay'): void;
    watchAd(kind: 'doubleMerit' | 'interstitial'): Promise<boolean>;
    minimapTap(x: number, z: number): void;
}

const UNIT_LABELS: Record<string, string> = {
    infantry: '步兵班', exo: '外骨骼', roboDog: '机器狗', engineer: '工兵',
    tank: '主战坦克', assaultCar: '突击车', artillery: '炮兵', aaVehicle: '防空车',
};
const TACTIC_LABELS: Record<string, string> = {
    firePrep: '火力准备', ewar: '电子压制', fortify: '工兵筑垒',
};
const TACTIC_HINTS: Record<string, string> = {
    firePrep: '炮火更密 / 阵地暴露',
    ewar: '雷达失效 / 敌我同失',
    fortify: '快速筑垒 / 占用产能',
};

const FACTION_SHORT: Record<FactionId, string> = { west: '西方', east: '东方', south: '自由' };

function cssOf(f: FactionId): string {
    const c = FactionColor[f];
    return `#${c.r.toString(16).padStart(2, '0')}${c.g.toString(16).padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`;
}

export class HUD {
    private _canvas: Node;
    private _cb: HUDCallbacks;
    private _root: Node;

    private _shareBars: Record<FactionId, Graphics> = {} as never;
    private _shareLabels: Record<FactionId, Label> = {} as never;
    private _timeLabel: Label = null as unknown as Label;
    private _phaseLabel: Label = null as unknown as Label;
    private _supplyLabel: Label = null as unknown as Label;
    private _armyLabel: Label = null as unknown as Label;
    private _cooldownLabels: Label[] = [];
    private _tacticButtons: ButtonHandle[] = [];
    private _prodButtons: { btn: ButtonHandle; type: string }[] = [];
    private _speedButtons: ButtonHandle[] = [];
    private _miniG: Graphics = null as unknown as Graphics;
    private _miniAcc = 0;
    private _resultRoot: Node | null = null;
    private _deployPanel: Node | null = null;
    private _deployCd: Label | null = null;
    private _hint: Label | null = null;
    private _hintTimer = 0;

    public constructor(canvas: Node, cb: HUDCallbacks) {
        this._canvas = canvas;
        this._cb = cb;
        this._root = makeNode(canvas, 'HUD', 0, 0);
        this._buildTopBar();
        this._buildMiniMap();
        this._buildProduction();
        this._buildTactics();
        this._buildTimeBar();
        this._buildHint();
    }

    // ---------------------------------------------------------------- 顶部条

    private _buildTopBar(): void {
        const w = 1240, h = 56;
        const n = makeNode(this._root, 'topbar', SX(SCREEN_W * 0.5), SY(SCREEN_H - 34), w, h);
        drawPanel(n.addComponent(Graphics), w, h, { fill: '#0A0F14', alpha: 215, radius: 6 });

        const factions: FactionId[] = ['west', 'east', 'south'];
        const xs = [-560, -390, -220];
        for (let i = 0; i < 3; i++) {
            const f = factions[i];
            makeLabelLeft(n, FACTION_SHORT[f], xs[i], 14, 13, COL.dim, true);
            this._shareLabels[f] = makeLabelLeft(n, '0.0%', xs[i], -12, 15, COL.text, true);
            const barNode = makeNode(n, `bar_${f}`, xs[i] + 66, 14, 96, 6);
            this._shareBars[f] = barNode.addComponent(Graphics);
        }

        this._timeLabel = makeLabel(n, '02:00', 24, 4, 26, COL.text, true);
        this._phaseLabel = makeLabel(n, '布阵阶段', 24, -18, 12, COL.accent, true);

        this._supplyLabel = makeLabel(n, '产能 0', 320, 10, 15, COL.warn, true);
        this._armyLabel = makeLabel(n, '兵力 0/0', 320, -12, 13, COL.dim, true);
    }

    // ---------------------------------------------------------------- 小地图

    private _buildMiniMap(): void {
        const size = 172;
        const n = makeNode(this._root, 'minimap', SX(16 + size * 0.5), SY(16 + size * 0.5), size, size);
        const bg = n.addComponent(Graphics);
        bg.fillColor = hex('#080C10', 235);
        bg.roundRect(-size * 0.5, -size * 0.5, size, size, 4);
        bg.fill();
        bg.strokeColor = hex(COL.line, 85);
        bg.lineWidth = 1.5;
        bg.roundRect(-size * 0.5, -size * 0.5, size, size, 4);
        bg.stroke();

        const inner = makeNode(n, 'mini_inner', 0, 0, size, size);
        this._miniG = inner.addComponent(Graphics);

        n.on(Node.EventType.TOUCH_END, (e: { getUILocation(): { x: number; y: number } }) => {
            const loc = e.getUILocation();
            const rx = Math.max(0, Math.min(1, (loc.x - 16) / size));
            const ry = Math.max(0, Math.min(1, (loc.y - 16) / size));
            this._cb.minimapTap(rx * 128, (1 - ry) * 128);
        });
    }

    // ---------------------------------------------------------------- 产兵面板

    private _buildProduction(): void {
        const w = 604, h = 136;
        const panel = makeNode(this._root, 'prod', SX(720), SY(104), w, h);
        drawPanel(panel.addComponent(Graphics), w, h, { fill: '#0A0F14', alpha: 210, radius: 6 });
        makeLabelLeft(panel, '建造 / 出兵', -w * 0.5 + 16, h * 0.5 - 18, 13, COL.accent, true);
        makeLabelLeft(panel, '建筑自动产兵 · 你只管出什么、往哪去', -w * 0.5 + 118, h * 0.5 - 18, 12, COL.dim);

        const rows = [
            ['infantry', 'exo', 'roboDog', 'engineer'],
            ['tank', 'assaultCar', 'artillery', 'aaVehicle'],
        ];
        for (let r = 0; r < rows.length; r++) {
            for (let c = 0; c < rows[r].length; c++) {
                const type = rows[r][c];
                const x = -w * 0.5 + 82 + c * 148;
                const y = h * 0.5 - 58 - r * 52;
                const btn = makeButton(panel, x, y, 138, 42, UNIT_LABELS[type] ?? type, () => this._cb.queueUnit(type), { fontSize: 13 });
                this._prodButtons.push({ btn, type });
            }
        }
    }

    // ---------------------------------------------------------------- 战术槽

    private _buildTactics(): void {
        const w = 196, h = 250;
        const panel = makeNode(this._root, 'tactics', SX(SCREEN_W - 110), SY(300), w, h);
        drawPanel(panel.addComponent(Graphics), w, h, { fill: '#0A0F14', alpha: 210, radius: 6 });
        makeLabelLeft(panel, '战术指令', -w * 0.5 + 14, h * 0.5 - 18, 13, COL.accent, true);

        for (let i = 0; i < TACTIC_IDS.length; i++) {
            const tid = TACTIC_IDS[i];
            const y = h * 0.5 - 62 - i * 72;
            const btn = makeButton(panel, 0, y, 172, 44, TACTIC_LABELS[tid], () => this._cb.useTactic(tid), { fontSize: 14 });
            makeLabel(panel, TACTIC_HINTS[tid], 0, y - 30, 10, COL.dim);
            this._cooldownLabels.push(makeLabel(panel, '就绪', 60, y + 12, 11, COL.warn, true));
            this._tacticButtons.push(btn);
        }
    }

    // ---------------------------------------------------------------- 时间控制

    private _buildTimeBar(): void {
        const w = 236, h = 56;
        const panel = makeNode(this._root, 'timebar', SX(SCREEN_W - 130), SY(52), w, h);
        drawPanel(panel.addComponent(Graphics), w, h, { fill: '#0A0F14', alpha: 210, radius: 6 });
        const speeds = [0, 1, 2, 3];
        const labels = ['I I', '1×', '2×', '3×'];
        for (let i = 0; i < speeds.length; i++) {
            const btn = makeButton(panel, -w * 0.5 + 34 + i * 57, 0, 50, 40, labels[i], () => {
                this._cb.setSpeed(speeds[i]);
                this._refreshSpeed(speeds[i]);
            }, { fontSize: 15 });
            this._speedButtons.push(btn);
        }
        this._refreshSpeed(1);
    }

    private _refreshSpeed(speed: number): void {
        for (let i = 0; i < this._speedButtons.length; i++) {
            const b = this._speedButtons[i];
            b.label.color = hex(i === speed ? COL.accent : COL.dim);
            b.bg.strokeColor = hex(COL.line, i === speed ? 255 : 70);
        }
    }

    private _buildHint(): void {
        this._hint = makeLabel(this._root, '', 0, SY(430), 17, COL.text, true);
        this._hint!.node.active = false;
    }

    /** 调试状态行（仅 DEBUG 构建显示）：帧率 / tick / 单位数，便于真机与预览自检 */
    private _dbg: Label | null = null;
    public setDebugText(text: string): void {
        if (!this._dbg) {
            this._dbg = makeLabelLeft(this._root, '', SX(14), SY(200), 10, '#6E8592', false);
        }
        this._dbg.string = text;
    }

    public showHint(text: string, seconds = 2.4): void {
        if (!this._hint) return;
        this._hint.string = text;
        this._hint.node.active = true;
        this._hintTimer = seconds;
    }

    // ---------------------------------------------------------------- 布阵阶段

    public showDeploy(countdown: number): void {
        if (!this._deployPanel) {
            const p = makeNode(this._root, 'deploy', 0, SY(SCREEN_H - 106), 460, 100);
            drawPanel(p.addComponent(Graphics), 460, 100, { fill: '#0A0F14', alpha: 225, radius: 6 });
            makeLabelLeft(p, '作战会议 · 布阵阶段', -230 + 18, 34, 16, COL.accent, true);
            this._deployCd = makeLabel(p, '', 0, 4, 30, COL.text, true);
            makeButton(p, 0, -32, 290, 30, '提前开战（剩余秒数转化为产能）', () => this._cb.skipDeploy(), { fontSize: 12 });
            this._deployPanel = p;
        }
        this._deployPanel.active = true;
        if (this._deployCd) this._deployCd.string = `${Math.ceil(countdown)}s`;
    }

    public hideDeploy(): void {
        if (this._deployPanel) this._deployPanel.active = false;
    }

    // ---------------------------------------------------------------- 每帧

    public update(world: World, dt: number): void {
        const share = world.shares;
        const factions: FactionId[] = ['west', 'east', 'south'];
        for (let i = 0; i < 3; i++) {
            const f = factions[i];
            drawBar(this._shareBars[f], 96, 6, share[i], cssOf(f));
            this._shareLabels[f].string = `${(share[i] * 100).toFixed(1)}%`;
        }

        const left = Math.max(0, 180 - world.timeSec);
        this._timeLabel.string = `${Math.floor(left / 60).toString().padStart(2, '0')}:${Math.floor(left % 60).toString().padStart(2, '0')}`;
        this._phaseLabel.string = world.phase === 'deploy' ? '布阵'
            : world.phase === 'over' ? '结束'
                : world.timeSec < 45 ? '铺地' : world.timeSec < 90 ? '接触' : '爆点';

        const sup = world.supply[0];
        this._supplyLabel.string = `产能 ${Math.floor(sup)}`;
        const army = world.units.reduce((n, u) => n + (u.faction === 'west' && !u.dead ? 1 : 0), 0);
        const cap = world.economy.armyCap(world.ownedCells('west'));
        this._armyLabel.string = `兵力 ${army}/${cap}`;

        for (const { btn, type } of this._prodButtons) {
            const cost = world.config.units[type]?.cost ?? 0;
            const producers = world.buildings.filter((b) =>
                b.faction === 'west' && !b.dead && b.def.produces.includes(type));
            const auto = producers.some((b) => b.autoType === type);
            const ok = producers.length > 0 && world.phase === 'battle' && (auto || sup >= cost) && army < cap;
            btn.setEnabled(ok);
            // 「持续」表示该兵种已被设为建筑自动产兵，玩家只需决定编成
            const label = UNIT_LABELS[type] ?? type;
            btn.setText(auto ? `${label} · 持续` : `${label} ${cost}`);
        }

        const st = world.factionTacticState('west');
        for (let i = 0; i < TACTIC_IDS.length; i++) {
            const cd = st.cooldown[i];
            this._cooldownLabels[i].string = cd > 0 ? `${(cd / 30).toFixed(1)}s` : '就绪';
            this._cooldownLabels[i].color = hex(cd > 0 ? COL.dim : COL.good);
            this._tacticButtons[i].setEnabled(cd <= 0 && world.phase === 'battle');
        }

        this._miniAcc += dt;
        if (this._miniAcc > 0.35) {
            this._miniAcc = 0;
            this._redrawMiniMap(world);
        }

        if (this._hintTimer > 0) {
            this._hintTimer -= dt;
            if (this._hintTimer <= 0 && this._hint) this._hint.node.active = false;
        }
    }

    private _redrawMiniMap(world: World): void {
        const g = this._miniG;
        const size = 172;
        g.clear();
        g.fillColor = hex('#0E1519', 255);
        g.rect(-size * 0.5, -size * 0.5, size, size);
        g.fill();

        const n = world.territory.size;
        const block = 4;
        const blocks = Math.floor(n / block);
        const cell = size / blocks;
        const colors = [FactionColor.west, FactionColor.east, FactionColor.south];
        for (let bz = 0; bz < blocks; bz++) {
            for (let bx = 0; bx < blocks; bx++) {
                const counts = [0, 0, 0, 0];
                for (let dz = 0; dz < block; dz++) {
                    for (let dx = 0; dx < block; dx++) {
                        counts[world.territory.owner[(bz * block + dz) * n + bx * block + dx]]++;
                    }
                }
                let owner = 0, max = 0;
                for (let i = 1; i <= 3; i++) if (counts[i] > max) { max = counts[i]; owner = i; }
                if (owner === 0) continue;
                const fc = colors[owner - 1];
                g.fillColor = new Color(fc.r, fc.g, fc.b, 215);
                g.rect(-size * 0.5 + bx * cell, size * 0.5 - (bz + 1) * cell, cell + 0.5, cell + 0.5);
                g.fill();
            }
        }

        for (const u of world.units) {
            if (u.dead) continue;
            const fc = FactionColor[u.faction];
            g.fillColor = new Color(fc.r, fc.g, fc.b, 255);
            const px = -size * 0.5 + (u.x / n) * size;
            const py = size * 0.5 - (u.z / n) * size;
            g.rect(px - 1.2, py - 1.2, 3, 3);
            g.fill();
        }
    }

    // ---------------------------------------------------------------- 出战准备屏

    public showStart(onStart: () => void): void {
        const root = makeNode(this._canvas, 'Start', 0, 0, SCREEN_W, SCREEN_H);
        const g = root.addComponent(Graphics);
        // 冷调暗底 + 上下渐变压暗（用多层矩形模拟渐变）
        g.fillColor = hex('#080D11', 255);
        g.rect(-SCREEN_W * 0.5, -SCREEN_H * 0.5, SCREEN_W, SCREEN_H);
        g.fill();
        for (let i = 0; i < 8; i++) {
            g.fillColor = hex('#0E1A21', 14);
            g.rect(-SCREEN_W * 0.5, -SCREEN_H * 0.5 + i * 44, SCREEN_W, 44);
            g.fill();
            g.fillColor = hex('#050809', 10);
            g.rect(-SCREEN_W * 0.5, SCREEN_H * 0.5 - (i + 1) * 44, SCREEN_W, 44);
            g.fill();
        }
        // 冷青描边线
        g.strokeColor = hex(COL.line, 90);
        g.lineWidth = 1;
        g.rect(-SCREEN_W * 0.5 + 24, -SCREEN_H * 0.5 + 24, SCREEN_W - 48, SCREEN_H - 48);
        g.stroke();

        makeLabel(root, '风 暴 行 动', 0, SY(SCREEN_H - 150), 72, COL.text, true);
        makeLabel(root, 'WAR NEVER CHANGES  ·  三方战线', 0, SY(SCREEN_H - 208), 18, COL.dim, true);

        const lines = [
            '你占的地盘就是你的进度条',
            '占格 = 产能 + 接触面 + 地理属性：扩张是收益，也是负债',
            '建筑自动产兵——你只管出什么、往哪去',
        ];
        for (let i = 0; i < lines.length; i++) {
            makeLabel(root, lines[i], 0, SY(SCREEN_H - 290 - i * 34), 16, i === 0 ? COL.text : COL.dim, i === 0);
        }

        // 三阵营色块
        const factions: FactionId[] = ['west', 'east', 'south'];
        for (let i = 0; i < 3; i++) {
            const x = (i - 1) * 190;
            const chip = makeNode(root, `chip${i}`, x, SY(SCREEN_H - 440), 150, 46);
            const cg = chip.addComponent(Graphics);
            cg.fillColor = hex(cssOf(factions[i]), 190);
            cg.roundRect(-75, -8, 150, 16, 3);
            cg.fill();
            makeLabel(chip, FACTION_SHORT[factions[i]] + '阵营', 0, 0, 12, COL.text, true);
        }

        makeButton(root, 0, SY(180), 300, 68, '开始作战', () => {
            root.destroy();
            onStart();
        }, { fontSize: 24 });

        makeLabel(root, '单指拖动看战场 · 点地面下令推进 · 底部出兵 · 右侧战术', 0, SY(96), 13, COL.dim);
        makeLabel(root, '横屏 16:9 · 单局 90-180 秒 · 纯单机三方 AI', 0, SY(64), 12, '#6E8592');

        fadeIn(root, 0.4);
    }

    // ---------------------------------------------------------------- 结算

    public showResult(world: World, merit: number): void {
        this.hideResult();
        const root = makeNode(this._canvas, 'Result', 0, 0, SCREEN_W, SCREEN_H);
        this._resultRoot = root;
        const dim = root.addComponent(Graphics);
        dim.fillColor = hex('#04080B', 215);
        dim.rect(-SCREEN_W * 0.5, -SCREEN_H * 0.5, SCREEN_W, SCREEN_H);
        dim.fill();

        const isWin = world.winner === 'west';
        const stalemate = world.isStalemate();
        const title = stalemate ? '战线僵持' : isWin ? '作战胜利' : '作战失败';
        makeLabel(root, title, 0, SY(SCREEN_H - 86), 46, stalemate ? COL.warn : isWin ? COL.good : COL.bad, true);
        makeLabel(root, world.endReason ?? '', 0, SY(SCREEN_H - 132), 15, COL.dim);

        const cards = world.log.buildReport('west');
        for (let i = 0; i < 3; i++) {
            const e = cards[i];
            const y = SY(SCREEN_H - 200 - i * 104);
            const card = makeNode(root, `card${i}`, 0, y, 900, 92);
            drawPanel(card.addComponent(Graphics), 900, 92, { fill: '#101820', alpha: 240, radius: 5 });
            const tag = !e ? '战场记录'
                : e.type === LogType.KILL ? '本可以做得更好'
                    : e.impact > 0 ? '你做对了什么'
                        : e.type === LogType.FLIP ? '关键转折' : '战场记录';
            const tagColor = e && e.impact > 0 ? COL.good : COL.warn;
            makeLabelLeft(card, tag, -440, 26, 12, tagColor, true);
            const txt = e ? `${timeStr(e.tick)} · ${placeName(e.x, e.z)}｜${e.what} → ${e.effect}` : '战场没有留下更多记录';
            const lb = makeLabelLeft(card, txt, -440, -12, 15, COL.text);
            const ut = lb.node.getComponent(UITransform)!;
            ut.setContentSize(880, 40);
            lb.overflow = Label.Overflow.CLAMP;
        }

        makeLabel(root, `战功 +${merit}     蓝图碎片 +2     指挥经验 +${isWin ? 40 : 25}`, 0, SY(122), 16, COL.warn, true);

        makeButton(root, SX(SCREEN_W * 0.5 - 250), SY(66), 210, 56, '再战一局', () => this._cb.restart('new'), { fontSize: 18 });
        makeButton(root, SX(SCREEN_W * 0.5), SY(66), 210, 56, '改布阵重打', () => this._cb.restart('replay'), { fontSize: 16 });
        makeButton(root, SX(SCREEN_W * 0.5 + 270), SY(66), 250, 56, '看视频 · 战功翻倍', () => {
            void this._cb.watchAd('doubleMerit').then((ok) => {
                if (ok) this.showHint('战功已翻倍入账', 2.4);
            });
        }, { fontSize: 14 });
        makeLabel(root, '不看广告也能继续：战功照常入账，可随时重打', 0, SY(26), 11, COL.dim);

        fadeIn(root, 0.3);
    }

    public hideResult(): void {
        if (this._resultRoot) {
            this._resultRoot.destroy();
            this._resultRoot = null;
        }
    }

    public hasResult(): boolean {
        return this._resultRoot !== null;
    }

    public dispose(): void {
        this.hideResult();
        this._root.destroy();
    }
}

function timeStr(tick: number): string {
    const s = Math.floor(tick / 30);
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

function placeName(x: number, z: number): string {
    const ns = z < 43 ? '北' : z > 85 ? '南' : '中';
    const ew = x < 43 ? '西' : x > 85 ? '东' : '中';
    return `${ew}${ns}线`;
}
