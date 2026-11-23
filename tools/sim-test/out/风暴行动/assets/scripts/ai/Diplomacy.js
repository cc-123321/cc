"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDiplomacy = createDiplomacy;
exports.updateDiplomacy = updateDiplomacy;
exports.addGrudge = addGrudge;
exports.decayGrudges = decayGrudges;
const Territory_1 = require("../sim/Territory");
function createDiplomacy() {
    return {
        coalitionTarget: null,
        grudges: { west: { west: 0, east: 0, south: 0 }, east: { west: 0, east: 0, south: 0 }, south: { west: 0, east: 0, south: 0 } },
    };
}
function updateDiplomacy(world, dip, threshold) {
    var _a, _b;
    const share = (0, Territory_1.territoryShare)(world.territory);
    let leader = null;
    for (const f of ['west', 'east', 'south']) {
        if (world.isFactionAlive(f) && share[(_b = (_a = world['_factionIdx']) === null || _a === void 0 ? void 0 : _a[f]) !== null && _b !== void 0 ? _b : (f === 'west' ? 0 : f === 'east' ? 1 : 2)] >= threshold) {
            leader = f;
        }
    }
    dip.coalitionTarget = leader;
}
/** 记仇 */
function addGrudge(dip, victim, attacker, amount) {
    dip.grudges[victim][attacker] = Math.min(1, dip.grudges[victim][attacker] + amount);
}
/** 记仇衰减 */
function decayGrudges(dip, rate) {
    for (const f of ['west', 'east', 'south']) {
        for (const g of ['west', 'east', 'south']) {
            dip.grudges[f][g] = Math.max(0, dip.grudges[f][g] - rate);
        }
    }
}
