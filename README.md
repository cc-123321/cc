# 风暴行动 · 三方战线

现代战争题材的**三方实时战线策略**小游戏。Cocos Creator 3.8.8，横屏 16:9，纯单机（玩家 + 两方 Utility AI），一套代码可构建微信小游戏与抖音小游戏，纯广告变现。

**核心一句话**：你占的地盘就是你的进度条 —— 占格同时改变产能与接触面，推进是收益也是负债。

---

## 一、怎么打开与运行

1. 用 **Cocos Dashboard / Cocos Creator 3.8.8** 打开本目录（`d:/Cocos游戏源码合集/风暴行动`）。
2. 打开场景 `assets/scenes/main.scene`，点编辑器右上角 **预览（Preview）** 即可开始一局。
3. 命令行构建（本机无 node，用编辑器自带工具链）：

```powershell
powershell -ExecutionPolicy Bypass -File tools/build.ps1 -Platform web-mobile
# 产物：build/web-mobile/index.html（可用任意静态服务器打开）
```

```powershell
# 双端构建（需要先在平台后台申请 appid，见第三节）
powershell -ExecutionPolicy Bypass -File tools/build.ps1 -Platform wechatgame
powershell -ExecutionPolicy Bypass -File tools/build.ps1 -Platform bytedance-minigame
```

---

## 二、玩法与操作（单手 / 横屏）

### 一局怎么打

| 阶段 | 时间 | 你在做什么 |
|---|---|---|
| 布阵 | 0–12s | 点己方单位选中 → 点地面部署；也可点「提前开战」，剩余秒数换成产能 |
| 铺地 | 12–45s | 点地面下令推进：全军向该点涌出，边界逐格点亮 |
| 接触 | 45–90s | 首个交火点出现，用产兵面板补兵、用战术槽改变战场条件 |
| 爆点 | 90s–180s | 兵群对冲、抢矿点、端掉敌方指挥中心 |

**操作（全部拇指可达）**

- **单指拖动**：平移镜头（地图 128×128，比屏幕大得多）
- **单指点地面**：下令推进（全军向该点推进）
- **双指捏合 / 滚轮**：缩放
- **底部产兵面板**：点兵种卡片 → 对应建筑排产（建筑自动产兵，你只决定出什么）
- **右侧战术槽**：火力准备 / 电子压制 / 工兵筑垒（冷却制，都有对称代价）
- **右下时间控制**：暂停 / 1× / 2× / 3×
- **左下小地图**：点击直接跳转镜头

### 胜负判定

1. 打掉敌方**指挥中心** → 该阵营直接崩盘；
2. 占领全图 **45%** 并维持 5 秒 → 直接胜利；
3. 到 **180 秒**按领地占比定名次，差距小于 2% 判**僵持**。

### 三条资源与张力

- **产能**：地块 + 矿点（矿点产能 ×4）。占得越多，出得起的东西越多。
- **兵力**：兵营 / 工厂自动产兵，上限 = 占领格数 ×2.2，扩张才带得动更大的军队。
- **时间**：造兵、筑垒、升级都在花时间，每次都是"现在弱一点、之后强很多"的赌注。

### 兵种物理关系（不用血条与数值表达）

11 兵种：步兵 / 外骨骼 / 炮兵 / 坦克 / 突击车 / 机器狗 / 战斗机 / 无人机 / 防空车 / 预警机 / 工兵。
克制发生在**物理层**：

| 关系 | 实现 |
|---|---|
| 装甲有方向 | 命中角度决定打正面 / 侧面 / 背面（坦克侧后脆、正面硬） |
| 哑区即死区 | 炮兵 `minRange` 内无法开火，被机器狗贴脸就是损失 |
| 空军需要眼睛 | 战斗机/防空导弹必须阵营有雷达站或预警机才可开火，被打掉即"致盲" |
| 低空可被轻武器打 | 无人机升限低，步兵可对空射击；战斗机只能被防空武器打 |
| 视线遮挡 | 直射武器被高地脊线挡住就开不了火 |
| 天气改规则 | 雾/沙尘：视野减半、直射命中下降、炮兵散布加大 |

### 因果战报（解决"输了不知道为什么"）

结算 15 秒内出 3 张卡：**做对了什么 / 本可以怎么做 / 关键转折**，内容全部来自 sim 的 `BattleLog` 真实事件，只讲战场事实（时间 · 位置 · 事件 → 后果），**不出现数字对比**。
支持「改布阵重打」——同一 seed 重开，保留已得战功。

---

## 三、广告与平台接入

### 现在的状态

- `assets/scripts/platform/` 已封装 **wx / tt / mock** 三套实现，接口统一（`IPlatform`）。
- PC 预览走 **MockPlatform**：模拟 2.5 秒广告并直接发奖，方便调试。
- **频控硬规则落在 `AdService` 里**：`battleActive` 战斗中一律拒绝；单局激励 ≤ 2 次；单日上限；最小间隔；插屏仅局间、≥ 90 秒、单日 ≤ 6 次。
- 所有广告入口都有**免费替代路径**（不看广告也能重打、战功照常入账）。

### 上线前要做的三件事

1. 在**微信/抖音小游戏后台**创建小游戏，拿到 appid，填入构建参数（或 Creator 构建面板）。
2. 申请**激励视频 / 插屏广告位**，把 adUnitId 填到
   `assets/scripts/platform/IPlatform.ts` 的 `AD_UNITS.rewarded` / `AD_UNITS.interstitial`。
3. 真机联调：构建 `wechatgame` / `bytedance-minigame`，用平台开发者工具打开 `build/` 目录。

> 未填 adUnitId 时：真机上 `showRewardedVideo` 会返回 false，游戏逻辑**不会卡死**（奖励不发、流程继续）。

### 合规红线（不写代码，但必须核验）

- 含广告变现的小游戏通常需要 **游戏版号 + 软著 + 企业主体与类目资质**，具体以微信/抖音**最新官方规则**为准，上线前逐项核验，**不要按经验假设**。
- 必须接入平台**实名与未成年人保护**能力，不得绕过。
- 广告不得含虚假关闭按钮、诱导点击；激励视频须明确告知"观看可得什么"。
- 首版**不做抽卡/概率类玩法**，规避公示成本；埋点不含个人信息。

---

## 四、工程结构与数据表

```
assets/
├── scenes/main.scene            唯一场景（只挂 Bootstrap，其余全部代码构建）
├── resources/config/            ★ 策划改这里，不改代码
│   ├── units.json               11 兵种：射程/哑区/装填/装甲朝向倍率/升限/速度/视野/成本
│   ├── buildings.json           9 类建筑：产兵表、生命、防御扇区参数
│   ├── economy.json             产能公式、矿点乘区、兵力上限、跳秒换产能
│   ├── map.json                 地图尺寸/地形生成/三方出生点（等距三角）
│   ├── ai.json                  效用权重、联合阈值、难度五档（只改决策频率与视野）
│   └── ads.json                 广告位与频控参数（代码里另有兜底规则）
└── scripts/
    ├── game/                    Bootstrap / GameDirector（流程与输入）/ MatchSetup
    ├── core/                    Clock(30Hz 定步长) / Rng(可复现种子) / MathUtils
    ├── data/                    ConfigTypes / ConfigLoader
    ├── sim/                     ★ 纯数据仿真，不 import 任何 cc 渲染类
    │   ├── World.ts             主循环：经济→AI→建筑→单位→弹道→领土→胜负
    │   ├── Territory.ts         格点归属/翻边/边界自渗
    │   ├── Combat.ts            装甲朝向/视线/命中修正
    │   ├── Vision.ts            空军"眼睛"与防空锁定
    │   ├── Tactics.ts           三战术槽与对称代价
    │   ├── Pathfind.ts          A*（河流不可通行、林地高地减速）
    │   └── BattleLog.ts         因果事件与三卡筛选
    ├── ai/                      FactionAI(Utility) / Diplomacy(联合+记仇)
    ├── economy/                 Economy（产能与兵力上限）
    ├── render/                  MeshFactory(程序化低模) / TerrainRenderer / TerritoryOverlay
    │                            / WorldView(单位/建筑/弹道/烟尘) / CameraRig
    ├── ui/                      UIFactory(Graphics+Label) / HUD(全部界面与结算)
    └── platform/                IPlatform / PlatformFactory(wx,tt,mock) / AdService
```

### 确定性设计（战报归因的前提）

- 逻辑 **30Hz 定步长**，渲染插值；每帧最多补 6 步，避免卡顿后"跳帧雪崩"。
- **种子化 RNG** + 每阵营独立随机流，同一 seed + 同一操作序列 → 同一局结果。
- `sim` 层**不依赖引擎**，可以无头跑（下面的自动对战脚本就是靠这一点）。

### 自动对战（平衡检验）

```powershell
# 编译无头测试（用编辑器自带的 typescript）
$node  = 'C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-6\node.exe'
$tsc   = 'D:\CocosCreator-v3.8.8-win-121518\resources\app.asar.unpacked\node_modules\typescript\lib\tsc.js'
& $node $tsc -p tools/sim-test/tsconfig.json
& $node tools/sim-test/out/tools/sim-test/run.js 60
```

当前实测（60 局，三方全 AI 同节奏）：领地占比 **16.8% / 16.4% / 16.1%**，僵持 27%，平均 180 秒，兵种产出 步兵 53% / 坦克 20% / 突击车 15% / 炮兵 12%。

---

## 五、性能与降级

- 地形：一次性烘焙网格，**1 draw call**；领土覆盖层：128×128 CPU 纹理 + 全屏四边形，**1 draw call**。
- 单位/建筑：每种一个合并低模（300–800 tri），共享 3 个阵营材质。
- 目标：**同屏 120 单位以上 60fps**（PC 预览实测见左上角调试行 `fps / 单位 / dc≈`）。
- 待办（下一轮）：GPU Instancing 合批（把"每单位 1 draw call"降到"每兵种 1 draw call"）、三级 LOD、性能看门狗自动降级（关阴影→关雾→降同屏单位）。

---

## 六、已知边界（这一版有意没做）

1. **局外系统**未实现：升级树、每日任务、7 日签到、战区赛季地图、离线补给（下一轮）。
2. **战场迷雾**未做视觉化（视野只影响能否开火，不遮挡画面）。
3. **火力扇面 gizmo**：防御建筑参数已就绪（`buildings.json` 的 `defense`），选中显示扇面的交互留待下一轮。
4. **录屏分享**：接口已封装（`startRecord` / `stopRecordAndShare`），真机需平台权限与素材。
5. **性能**：单位未实例化合批，300 单位目标需下一轮优化。

---

## 七、常用调试

- 左上角调试行（DEBUG 构建）：`fps / tick / 单位数 / dc≈ / 阶段 / 天气`。
- 浏览器预览若有异常，屏幕底部会弹出红色错误条（小游戏环境自动关闭该能力）。
- 想固定某局：`GameDirector._seed` 由 `20261122 + 局号 * 97` 生成；改成常量即可复现同一局。
