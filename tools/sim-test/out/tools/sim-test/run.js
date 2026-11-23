"use strict";
/**
 * 无头自动对战测试（balance-check 基础）：
 * 三方全部交给 Utility AI 自动对打，统计胜率 / 平均时长 / 领地占比 / 兵种使用率。
 * 用法：node out/tools/sim-test/run.js [局数]
 */
Object.defineProperty(exports, "__esModule", { value: true });
const World_1 = require("../../assets/scripts/sim/World");
const MatchSetup_1 = require("../../assets/scripts/game/MatchSetup");
const Territory_1 = require("../../assets/scripts/sim/Territory");
const fs = require('fs');
const path = require('path');
// 向上查找工程根（兼容编译后 outDir 路径变化）
function findRoot() {
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
        const cand = path.join(dir, 'assets', 'resources', 'config', 'map.json');
        if (fs.existsSync(cand))
            return dir;
        dir = path.dirname(dir);
    }
    throw new Error('cannot locate project root');
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
const FAC = ['west', 'east', 'south'];
function runMatch(config, seed) {
    var _a, _b, _c;
    // 三方全部交给 AI 同节奏对打（测平衡）
    const world = new World_1.World({ config, seed, externalAI: true });
    (0, MatchSetup_1.setupMatch)(world, config);
    world.startBattle();
    let ticks = 0;
    while (world.phase !== 'over' && ticks < 5400) {
        world.step();
        ticks++;
    }
    const produced = {};
    for (const u of world.units)
        produced[u.def.id] = ((_a = produced[u.def.id]) !== null && _a !== void 0 ? _a : 0) + 1;
    return {
        winner: (_b = world.winner) !== null && _b !== void 0 ? _b : 'draw',
        shares: (0, Territory_1.territoryShare)(world.territory),
        ticks,
        produced,
        reason: (_c = world.endReason) !== null && _c !== void 0 ? _c : 'time',
    };
}
function main() {
    var _a, _b, _c, _d;
    const matches = Number((_a = process.argv[2]) !== null && _a !== void 0 ? _a : 60);
    const config = loadConfig();
    const wins = { west: 0, east: 0, south: 0, draw: 0 };
    const shareSum = { west: 0, east: 0, south: 0 };
    let tickSum = 0;
    const producedSum = {};
    const reasons = {};
    let timeouts = 0;
    for (let i = 0; i < matches; i++) {
        const r = runMatch(config, 1000 + i);
        wins[r.winner] = ((_b = wins[r.winner]) !== null && _b !== void 0 ? _b : 0) + 1;
        shareSum.west += r.shares[0];
        shareSum.east += r.shares[1];
        shareSum.south += r.shares[2];
        tickSum += r.ticks;
        reasons[r.reason] = ((_c = reasons[r.reason]) !== null && _c !== void 0 ? _c : 0) + 1;
        if (r.ticks >= 6300)
            timeouts++;
        for (const k of Object.keys(r.produced)) {
            producedSum[k] = ((_d = producedSum[k]) !== null && _d !== void 0 ? _d : 0) + r.produced[k];
        }
    }
    console.log(`===== ${matches} 局自动对战统计 =====`);
    console.log(`胜率: west ${(wins.west / matches * 100).toFixed(1)}% | east ${(wins.east / matches * 100).toFixed(1)}% | south ${(wins.south / matches * 100).toFixed(1)}% | 僵持 ${(wins.draw / matches * 100).toFixed(1)}% | 超时 ${(timeouts / matches * 100).toFixed(1)}%`);
    console.log(`平均领地占比: west ${(shareSum.west / matches * 100).toFixed(1)}% | east ${(shareSum.east / matches * 100).toFixed(1)}% | south ${(shareSum.south / matches * 100).toFixed(1)}%`);
    console.log(`平均时长: ${(tickSum / matches / 30).toFixed(1)}s | 结束原因: ${JSON.stringify(reasons)}`);
    const totalUnits = Object.values(producedSum).reduce((a, b) => a + b, 0) || 1;
    const usage = Object.entries(producedSum)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${(v / totalUnits * 100).toFixed(1)}%`)
        .join(', ');
    console.log(`兵种产出占比: ${usage}`);
    console.log(`==================================`);
}
main();
