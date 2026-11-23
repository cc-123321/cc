"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const World_1 = require("../../assets/scripts/sim/World");
const FactionAI_1 = require("../../assets/scripts/ai/FactionAI");
const MatchSetup_1 = require("../../assets/scripts/game/MatchSetup");
const Territory_1 = require("../../assets/scripts/sim/Territory");
const fs = require('fs');
const path = require('path');
function findRoot() {
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
        if (fs.existsSync(path.join(dir, 'assets', 'resources', 'config', 'map.json')))
            return dir;
        dir = path.dirname(dir);
    }
    throw new Error('no root');
}
const ROOT = findRoot();
function loadConfig() {
    const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf-8'));
    return {
        map: read('assets/resources/config/map.json'),
        units: read('assets/resources/config/units.json'),
        buildings: read('assets/resources/config/buildings.json'),
        economy: read('assets/resources/config/economy.json'),
        ai: read('assets/resources/config/ai.json'),
        ads: read('assets/resources/config/ads.json'),
    };
}
const world = new World_1.World({ config: loadConfig(), seed: 1000 });
(0, MatchSetup_1.setupMatch)(world, configGuard());
function configGuard() { return world.config; }
const ai = { west: new FactionAI_1.FactionAI('west'), east: new FactionAI_1.FactionAI('east'), south: new FactionAI_1.FactionAI('south') };
world.startBattle();
for (let t = 0; t < 1500; t++) {
    world.step();
    if (world.isFactionAlive('west'))
        ai.west.step(world);
    if (t === 60 || t === 300 || t === 900 || t === 1499) {
        const share = (0, Territory_1.territoryShare)(world.territory);
        const units = world.units.filter((u) => !u.dead);
        const moving = units.filter((u) => u.state === 1).length;
        const attacking = units.filter((u) => u.state === 2).length;
        const west = units.filter((u) => u.faction === 'west');
        const east = units.filter((u) => u.faction === 'east');
        const south = units.filter((u) => u.faction === 'south');
        console.log(`t=${t} share=${share.map((s) => (s * 100).toFixed(1))} units=${units.length} moving=${moving} attacking=${attacking} west=${west.length} east=${east.length} south=${south.length}`);
        if (t === 300) {
            console.log('west sample units:');
            west.slice(0, 8).forEach((u) => {
                console.log(`  ${u.def.id} pos=(${u.x.toFixed(1)},${u.z.toFixed(1)}) state=${u.state} pathLen=${u.path.length} target=${u.targetId}`);
            });
            // 检查边界格进度
            const g = world.territory;
            for (const [cx, cz] of [[12, 5], [15, 5], [10, 8], [24, 24], [5, 9]]) {
                const idx = cz * g.size + cx;
                console.log(`  cell(${cx},${cz}) owner=${g.owner[idx]} progress=${g.progress[idx].toFixed(2)}`);
            }
            console.log('  counts=', g.counts);
        }
    }
}
const g2 = world.territory;
for (const [cx, cz] of [[12, 5], [15, 5], [10, 8], [24, 24]]) {
    const idx = cz * g2.size + cx;
    console.log(`end cell(${cx},${cz}) owner=${g2.owner[idx]} progress=${g2.progress[idx].toFixed(2)}`);
}
console.log('end: winner=', world.winner, 'reason=', world.endReason, 'share=', (0, Territory_1.territoryShare)(world.territory));
