import { resources, JsonAsset } from 'cc';
import type { MapDef, UnitDef, BuildingDef, EconomyDef, AiDef, AdsDef } from './ConfigTypes';

/**
 * 配置加载器：并发加载 resources/config 下全部 JSON。
 * 缺失字段给默认值，缺文件时降级为内置默认（保证开发期不因改表崩掉）。
 */

export interface GameConfig {
    map: MapDef;
    units: Record<string, UnitDef>;
    buildings: Record<string, BuildingDef>;
    economy: EconomyDef;
    ai: AiDef;
    ads: AdsDef;
}

const FALLBACK_UNITS: Record<string, UnitDef> = {};
const FALLBACK_BUILDINGS: Record<string, BuildingDef> = {};
const FALLBACK_ECONOMY: EconomyDef = {
    supplyPerCell: 0.06, mineMultiplier: 3, startSupply: 60,
    armyCapPerCell: 3, queueLength: 3, deploySkipSupplyPerSec: 8, productionQueueLength: 3,
};
const FALLBACK_AI: AiDef = {
    decideIntervalTicks: 30, coalitionThreshold: 0.55, grudgeDecay: 0.1, difficulty: 3,
    difficultyVisionMult: [0.8, 0.9, 1.0, 1.1, 1.2],
    difficultyDecideTicks: [60, 45, 30, 20, 15],
    weights: { expand: 1.0, defend: 0.8, raid: 0.6, contestMine: 0.9, revenge: 0.5, upgrade: 0.4 },
};
const FALLBACK_ADS: AdsDef = {
    bannedDuringBattle: true,
    slots: [
        { id: 'doubleMerit', type: 'rewarded', reward: 2, perMatchLimit: 1, perDayLimit: 3, minIntervalMs: 30000 },
        { id: 'revive', type: 'rewarded', reward: 1, perMatchLimit: 1, perDayLimit: 3, minIntervalMs: 30000 },
        { id: 'speedUp', type: 'rewarded', reward: 30, perMatchLimit: 1, perDayLimit: 6, minIntervalMs: 30000 },
        { id: 'supply', type: 'rewarded', reward: 1, perMatchLimit: 0, perDayLimit: 2, minIntervalMs: 60000 },
        { id: 'interstitial', type: 'interstitial', reward: 0, perMatchLimit: 1, perDayLimit: 6, minIntervalMs: 90000 },
    ],
};

function loadJson(path: string): Promise<JsonAsset> {
    return new Promise((resolve, reject) => {
        resources.load(path, JsonAsset, (err, asset) => {
            if (err || !asset) reject(err ?? new Error(`load ${path} failed`));
            else resolve(asset);
        });
    });
}

export async function loadConfig(): Promise<GameConfig> {
    const [mapA, unitsA, buildingsA, ecoA, aiA, adsA] = await Promise.allSettled([
        loadJson('config/map'), loadJson('config/units'), loadJson('config/buildings'),
        loadJson('config/economy'), loadJson('config/ai'), loadJson('config/ads'),
    ]);

    const map = (mapA.status === 'fulfilled' ? mapA.value.json : null) as MapDef | null;
    const units = (unitsA.status === 'fulfilled' ? unitsA.value.json : null) as Record<string, UnitDef> | null;
    const buildings = (buildingsA.status === 'fulfilled' ? buildingsA.value.json : null) as Record<string, BuildingDef> | null;
    const eco = (ecoA.status === 'fulfilled' ? ecoA.value.json : null) as EconomyDef | null;
    const ai = (aiA.status === 'fulfilled' ? aiA.value.json : null) as AiDef | null;
    const ads = (adsA.status === 'fulfilled' ? adsA.value.json : null) as AdsDef | null;

    return {
        map: map ?? { terrain: { size: 128, cellSize: 1, seed: 1 }, spawns: {} } as unknown as MapDef,
        units: units ?? FALLBACK_UNITS,
        buildings: buildings ?? FALLBACK_BUILDINGS,
        economy: eco ?? FALLBACK_ECONOMY,
        ai: ai ?? FALLBACK_AI,
        ads: ads ?? FALLBACK_ADS,
    };
}
