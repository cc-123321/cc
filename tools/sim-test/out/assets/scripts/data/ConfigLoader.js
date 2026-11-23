"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const cc_1 = require("cc");
const FALLBACK_UNITS = {};
const FALLBACK_BUILDINGS = {};
const FALLBACK_ECONOMY = {
    supplyPerCell: 0.06, mineMultiplier: 3, startSupply: 60,
    armyCapPerCell: 3, queueLength: 3, deploySkipSupplyPerSec: 8, productionQueueLength: 3,
};
const FALLBACK_AI = {
    decideIntervalTicks: 30, coalitionThreshold: 0.55, grudgeDecay: 0.1, difficulty: 3,
    difficultyVisionMult: [0.8, 0.9, 1.0, 1.1, 1.2],
    difficultyDecideTicks: [60, 45, 30, 20, 15],
    weights: { expand: 1.0, defend: 0.8, raid: 0.6, contestMine: 0.9, revenge: 0.5, upgrade: 0.4 },
};
const FALLBACK_ADS = {
    bannedDuringBattle: true,
    slots: [
        { id: 'doubleMerit', type: 'rewarded', reward: 2, perMatchLimit: 1, perDayLimit: 3, minIntervalMs: 30000 },
        { id: 'revive', type: 'rewarded', reward: 1, perMatchLimit: 1, perDayLimit: 3, minIntervalMs: 30000 },
        { id: 'speedUp', type: 'rewarded', reward: 30, perMatchLimit: 1, perDayLimit: 6, minIntervalMs: 30000 },
        { id: 'supply', type: 'rewarded', reward: 1, perMatchLimit: 0, perDayLimit: 2, minIntervalMs: 60000 },
        { id: 'interstitial', type: 'interstitial', reward: 0, perMatchLimit: 1, perDayLimit: 6, minIntervalMs: 90000 },
    ],
};
function loadJson(path) {
    return new Promise((resolve, reject) => {
        cc_1.resources.load(path, cc_1.JsonAsset, (err, asset) => {
            if (err || !asset)
                reject(err !== null && err !== void 0 ? err : new Error(`load ${path} failed`));
            else
                resolve(asset);
        });
    });
}
async function loadConfig() {
    const [mapA, unitsA, buildingsA, ecoA, aiA, adsA] = await Promise.allSettled([
        loadJson('config/map'), loadJson('config/units'), loadJson('config/buildings'),
        loadJson('config/economy'), loadJson('config/ai'), loadJson('config/ads'),
    ]);
    const map = (mapA.status === 'fulfilled' ? mapA.value.json : null);
    const units = (unitsA.status === 'fulfilled' ? unitsA.value.json : null);
    const buildings = (buildingsA.status === 'fulfilled' ? buildingsA.value.json : null);
    const eco = (ecoA.status === 'fulfilled' ? ecoA.value.json : null);
    const ai = (aiA.status === 'fulfilled' ? aiA.value.json : null);
    const ads = (adsA.status === 'fulfilled' ? adsA.value.json : null);
    return {
        map: map !== null && map !== void 0 ? map : { terrain: { size: 128, cellSize: 1, seed: 1 }, spawns: {} },
        units: units !== null && units !== void 0 ? units : FALLBACK_UNITS,
        buildings: buildings !== null && buildings !== void 0 ? buildings : FALLBACK_BUILDINGS,
        economy: eco !== null && eco !== void 0 ? eco : FALLBACK_ECONOMY,
        ai: ai !== null && ai !== void 0 ? ai : FALLBACK_AI,
        ads: ads !== null && ads !== void 0 ? ads : FALLBACK_ADS,
    };
}
