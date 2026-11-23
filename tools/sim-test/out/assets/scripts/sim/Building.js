"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBuilding = createBuilding;
exports.canPlace = canPlace;
function createBuilding(id, faction, def, x, z) {
    return {
        id, faction, def, x, z,
        hp: def.hp,
        cooldown: 0,
        produceType: null,
        produceTicks: 0,
        autoType: null,
        dead: false,
    };
}
/** 建筑占用格是否合法（不能建在河流上） */
function canPlace(terrain, cx, cz) {
    return terrain.inBounds(cx, cz) && terrain.isPassable(cx, cz);
}
