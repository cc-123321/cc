import io

ROOT = 'd:/Cocos游戏源码合集/风暴行动/assets/scripts/'

# ---------------- 1) 建筑：自动产兵偏好 ----------------
p = ROOT + 'sim/Building.ts'
s = io.open(p, encoding='utf-8').read()
s = s.replace("""    /** 生产队列：当前在产的兵种 id 与剩余 tick */
    produceType: string | null;
    produceTicks: number;""",
"""    /** 生产队列：当前在产的兵种 id 与剩余 tick */
    produceType: string | null;
    produceTicks: number;
    /** 持续生产偏好：设定后该建筑会自动连续产兵（玩家只决定"出什么"） */
    autoType: string | null;""")
s = s.replace("""        produceType: null,
        produceTicks: 0,""",
"""        produceType: null,
        produceTicks: 0,
        autoType: null,""")
io.open(p, 'w', encoding='utf-8').write(s)

# ---------------- 2) 命令 ----------------
p = ROOT + 'sim/Commands.ts'
s = io.open(p, encoding='utf-8').read()
s = s.replace("    | { kind: 'queueUnit'; faction: FactionId; buildingId: number; unitType: string }",
              "    | { kind: 'queueUnit'; faction: FactionId; buildingId: number; unitType: string }\n"
              "    | { kind: 'autoProduce'; faction: FactionId; buildingId: number; unitType: string | null }")
io.open(p, 'w', encoding='utf-8').write(s)

# ---------------- 3) World：自动续产 ----------------
p = ROOT + 'sim/World.ts'
s = io.open(p, encoding='utf-8').read()

# 3.1 命令分发
s = s.replace("""                case 'queueUnit':
                    this.queueUnit(c.faction, c.buildingId, c.unitType);
                    break;""",
"""                case 'queueUnit':
                    this.queueUnit(c.faction, c.buildingId, c.unitType);
                    break;
                case 'autoProduce': {
                    const b = this.buildings.find((bb) => bb.id === c.buildingId);
                    if (b && !b.dead && b.faction === c.faction) b.autoType = c.unitType;
                    break;
                }""")

# 3.2 生产完成后自动续产
s = s.replace("""                    b.produceType = null;
                }
            }
            // 防御开火""",
"""                    b.produceType = null;
                }
            }
            // 持续生产：建筑自动连续产兵（玩家只决定兵种编成）
            if (!b.produceType && b.autoType && !b.dead) {
                this._tryStartProduction(b, b.autoType);
            }
            // 防御开火""")

# 3.3 抽出"尝试开工"方法（复用成本/上限判断）
s = s.replace("""    // ------------------------------------------------------------ 主循环""",
"""    /** 尝试让建筑开始生产某兵种（成本/上限校验，失败返回 false） */
    private _tryStartProduction(b: SimBuilding, unitType: string): boolean {
        const def = this.config.units[unitType];
        if (!def || !b.def.produces.includes(unitType)) return false;
        if (b.produceType) return false;
        const owned = this.territory.counts[this._factionIdx[b.faction]];
        const cap = this.economy.armyCap(owned);
        const count = this.units.reduce((n, u) => n + (u.faction === b.faction && !u.dead ? 1 : 0), 0);
        if (count >= cap) return false;
        if (!this.economy.spend(b.faction, def.cost)) return false;
        b.produceType = unitType;
        b.produceTicks = def.buildTicks;
        return true;
    }

    // ------------------------------------------------------------ 主循环""")

# 3.4 玩家排队命令也走自动续产（一次点击 = 该建筑持续出这个兵种）
s = s.replace("""        // 成本
        if (!this.economy.spend(faction, def.cost)) return false;
        if (b.produceType) return false; // 已有一队在生产
        b.produceType = unitType;
        b.produceTicks = def.buildTicks;
        return true;""",
"""        // 成本
        if (b.produceType) return false; // 已有一队在生产
        if (!this.economy.spend(faction, def.cost)) return false;
        b.produceType = unitType;
        b.produceTicks = def.buildTicks;
        return true;""")
io.open(p, 'w', encoding='utf-8').write(s)

# ---------------- 4) AI 用持续生产偏好 ----------------
p = ROOT + 'ai/FactionAI.ts'
s = io.open(p, encoding='utf-8').read()
s = s.replace("""        // 找能产出该兵种且空闲的产兵建筑
        const producers = world.buildings.filter((b) =>
            b.faction === me && !b.dead && b.def.produces.includes(want) && !b.produceType);
        if (producers.length === 0) return;
        const producer = producers.find((b) => b.def.id === producerType) ?? producers[0];
        if (!world.economy.canAfford(me, world.config.units[want]?.cost ?? 999)) return;
        world.enqueue({ kind: 'queueUnit', faction: me, buildingId: producer.id, unitType: want });""",
"""        // 找能产出该兵种的建筑，设置持续生产偏好（建筑会自动连续产兵）
        const producers = world.buildings.filter((b) =>
            b.faction === me && !b.dead && b.def.produces.includes(want));
        if (producers.length === 0) return;
        const producer = producers.find((b) => b.def.id === producerType) ?? producers[0];
        if (producer.autoType !== want) {
            world.enqueue({ kind: 'autoProduce', faction: me, buildingId: producer.id, unitType: want });
        }
        // 立刻补一队，避免开局空转
        if (!producer.produceType && world.economy.canAfford(me, world.config.units[want]?.cost ?? 999)) {
            world.enqueue({ kind: 'queueUnit', faction: me, buildingId: producer.id, unitType: want });
        }""")
io.open(p, 'w', encoding='utf-8').write(s)

print('auto-produce patched')
