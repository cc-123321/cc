/**
 * 全部配置表的类型定义。
 * 兵种以"物理参数"描述强弱 —— 禁止 dps / 战力 字段（产品红线）。
 */

export type FactionId = 'west' | 'east' | 'south';

/** 装甲朝向：front 正面 / flank 侧面 / rear 背面 */
export type ArmorFacing = 'front' | 'flank' | 'rear';

/** 兵种领域 */
export type Domain = 'ground' | 'air';

/** 攻击种类 */
export type AttackKind = 'direct' | 'arc' | 'aa' | 'melee' | 'none';

/** 地形类型 */
export type TerrainKind = 'plain' | 'hill' | 'forest' | 'river' | 'bridge' | 'mine' | 'building';

/** 单位剪影（用于渲染网格选择） */
export type Silhouette =
    | 'infantry' | 'exo' | 'artillery' | 'tank' | 'assaultCar' | 'roboDog'
    | 'fighter' | 'drone' | 'aaVehicle' | 'awacs' | 'engineer';

export interface UnitDef {
    id: string;
    name: string;
    domain: Domain;
    silhouette: Silhouette;
    /** 移动物理参数 */
    move: {
        speed: number;            // world units / tick (30Hz)
        turnRateDeg: number;      // deg / tick
        terrainSlow: Record<string, number>; // 地形减速倍率
        canEnterForest: boolean;
        canCrossBridgeOnly: boolean; // 是否只能过桥（装甲/车载）
    };
    /** 攻击物理参数；kind=none 表示无火力（工兵/预警机） */
    attack: {
        kind: AttackKind;
        /** 单发伤害（玩家不可见，仅用于物理结算） */
        damage: number;
        range: number;
        minRange: number;          // 哑区
        reloadTicks: number;
        splash: number;            // 面杀伤半径，0 表示单点
        canHitAir: boolean;
        canHitGround: boolean;
        /** 穿甲：对 front/flank/rear 的伤害倍率（坦克侧后弱） */
        armorMult: Record<ArmorFacing, number>;
        /** 命中概率基础（0-1），地形/天气会修正 */
        accuracy: number;
        /** 直射需要视线（无视线不能开火） */
        requiresLineOfSight: boolean;
    };
    /** 生存物理参数 */
    armor: { front: number; flank: number; rear: number; hp: number; };
    vision: number;
    /** 空中单位额外参数 */
    air?: { ceiling: number; needsAirbase: boolean; fuelTicks: number; isAWACS: boolean; };
    /** 建造/经济参数 */
    cost: number;
    buildTicks: number;
    /** 特殊标签：antiArmor(反甲)、stealth、detector 等（组合效应的数据表达） */
    tags: string[];
}

export interface BuildingDef {
    id: string;
    name: string;
    hp: number;
    cost: number;
    buildTicks: number;
    /** 该建筑产出的兵种队列 */
    produces: string[];
    /** 每 tick 产能 */
    prodTicksPerUnit: number;
    /** 炮塔类：防御参数 */
    defense?: {
        range: number;
        minRange: number;
        reloadTicks: number;
        splash: number;
        canHitAir: boolean;
        canHitGround: boolean;
        arcDeg: number;            // 射界半角
        damage: number;
        armorMult: Record<ArmorFacing, number>;
    };
    /** 防空导弹：拦截参数 */
    missileDefense?: {
        range: number;
        ammo: number;
        reloadTicks: number;
    };
    /** 是否关键建筑（被毁直接判负） */
    isCore: boolean;
    tags: string[];
}

export interface EconomyDef {
    /** 每格地每 tick 基础产能 */
    supplyPerCell: number;
    /** 矿点产能乘区 */
    mineMultiplier: number;
    /** 初始产能 */
    startSupply: number;
    /** 产能上限（兵力维持上限 = 占格数 * supplyCapPerCell） */
    armyCapPerCell: number;
    /** 建造队列长度 */
    queueLength: number;
    /** 布阵阶段跳秒：每秒转化的产能 */
    deploySkipSupplyPerSec: number;
    /** 产兵建筑队列槽 */
    productionQueueLength: number;
}

export interface TerrainGenDef {
    size: number;
    cellSize: number;
    seed: number;
    hillCount: number;
    hillRadiusMin: number;
    hillRadiusMax: number;
    hillHeightMax: number;
    riverCount: number;
    riverWidth: number;
    bridgeCount: number;
    forestCount: number;
    forestRadiusMin: number;
    forestRadiusMax: number;
    mineCount: number;
    mineValue: number;
    weather: string[];
}

export interface SpawnDef {
    x: number;
    z: number;
    name: string;
}

export interface MapDef {
    terrain: TerrainGenDef;
    spawns: Record<FactionId, SpawnDef>;
}

export interface AiDef {
    /** 决策间隔 tick */
    decideIntervalTicks: number;
    /** 反滚雪球：领地占比超过该值触发联合 */
    coalitionThreshold: number;
    /** 复仇记忆衰减 */
    grudgeDecay: number;
    /** 难度 1-5 */
    difficulty: number;
    /** 难度只调决策频率与视野（禁止暗改数值） */
    difficultyVisionMult: number[];
    difficultyDecideTicks: number[];
    /** 效用权重 */
    weights: {
        expand: number;
        defend: number;
        raid: number;
        contestMine: number;
        revenge: number;
        upgrade: number;
    };
}

export interface AdSlotDef {
    id: string;
    type: 'rewarded' | 'interstitial' | 'banner';
    /** 奖励值（发给玩家的资源倍数或数量） */
    reward: number;
    /** 单局上限 */
    perMatchLimit: number;
    /** 单日上限 */
    perDayLimit: number;
    /** 最小间隔毫秒 */
    minIntervalMs: number;
}

export interface AdsDef {
    slots: AdSlotDef[];
    /** 战中广告硬禁止 */
    bannedDuringBattle: boolean;
}
