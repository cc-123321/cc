/**
 * 诊断：三方在外部同节奏模式下的成长曲线 + 交换出生点对照实验。
 */
declare const require: (m: string) => any;
declare const __dirname: string;
declare const console: any;

import { World } from '../../assets/scripts/sim/World';
import type { MapDef, UnitDef, BuildingDef, EconomyDef, AiDef, AdsDef, FactionId } from '../../assets/scripts/data/ConfigTypes';
import { setupMatch } from '../../assets/scripts/game/MatchSetup';
import { territoryShare } from '../../assets/scripts/sim/Territory';

const fs = require('fs');
const path = require('path');

interface GameConfig { map: MapDef; units: Record<string, UnitDef>; buildings: Record<string, BuildingDef>; economy: EconomyDef; ai: AiDef; ads: AdsDef; }

function findRoot(): string {
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
        if (fs.existsSync(path.join(dir, 'assets', 'resources', 'config', 'map.json'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('no root');
}
const ROOT = findRoot();
function loadConfig(): GameConfig {
    const read = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf-8'));
    return {
        map: read('assets/resources/config/map.json'),
        units: read('assets/resources/config/units.json'),
        buildings: read('assets/resources/config/buildings.json'),
        economy: read('assets/resources/config/economy.json'),
        ai: read('assets/resources/config/ai.json'),
        ads: read('assets/resources/config/ads.json'),
    };
}

function run(config: GameConfig, seed: number, label: string): void {
    const world = new World({ config, seed, externalAI: true });
    setupMatch(world, config);
    world.startBattle();
    const marks = [300, 900, 1800, 3000, 4500, 6000];
    let done = false;
    for (let t = 1; t <= 6300 && !done; t++) {
        world.step();
        if (marks.includes(t) || world.phase === 'over') {
            const share = territoryShare(world.territory);
            const cnt = (f: FactionId) => world.units.filter((u) => u.faction === f && !u.dead).length;
            const ds = world.debugStats;
            console.log(`[${label}] t=${t} cells=${world.ownedCells('west')}/${world.ownedCells('east')}/${world.ownedCells('south')} share=${share.map((s) => (s * 100).toFixed(1))} units=${cnt('west')}/${cnt('east')}/${cnt('south')} spawn=${ds.west.spawned}/${ds.east.spawned}/${ds.south.spawned} deaths=${ds.west.deaths}/${ds.east.deaths}/${ds.south.deaths} qf=${ds.west.queueFails}/${ds.east.queueFails}/${ds.south.queueFails}`);
            if (world.phase === 'over') {
                console.log(`[${label}] OVER t=${t} winner=${world.winner} reason=${world.endReason}`);
                done = true;
            }
        }
    }
}

const base = loadConfig();
run(base, 1000, 'normal');

// 交换 west 与 east 的出生点，检验"是出生点/地形导致"还是"阵营代码不对称"
const swapped = JSON.parse(JSON.stringify(base)) as GameConfig;
const s = swapped.map.spawns;
const tmp = s.west;
s.west = { ...s.east, name: s.west.name };
s.east = { ...tmp, name: s.east.name };
run(swapped, 1000, 'swapped');
