"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupMatch = setupMatch;
const Territory_1 = require("../sim/Territory");
/**
 * 单局初始化：三方初始建筑与单位、出生地领土。
 * 玩家（west）在布阵阶段可调整部署；AI 直接使用初始编成。
 */
function setupMatch(world, config) {
    const spawns = config.map.spawns;
    const factions = ['west', 'east', 'south'];
    for (const f of factions) {
        const s = spawns[f];
        if (!s)
            continue;
        // 核心建筑
        world.placeBuilding(f, 'commandCenter', s.x, s.z);
        world.placeBuilding(f, 'barracks', s.x + 3, s.z + 3);
        world.placeBuilding(f, 'factory', s.x - 3, s.z + 3);
        world.placeBuilding(f, 'radar', s.x + 3, s.z - 3);
        // 初始编成（布阵阶段玩家可调整）
        world.deployUnit(f, 'infantry', s.x + 2, s.z + 2);
        world.deployUnit(f, 'infantry', s.x + 2, s.z + 4);
        world.deployUnit(f, 'tank', s.x - 2, s.z + 2);
        world.deployUnit(f, 'artillery', s.x - 4, s.z + 1);
        // 出生地领土
        const { cx, cz } = world.terrain.cellOf(s.x, s.z);
        (0, Territory_1.initHomeTerritory)(world.territory, world.terrain, f, cx, cz, 7);
    }
}
