"""端到端状态验证：开始作战 → 加速 → 推进 → 读 world 状态 + 截图。"""
import json
from playwright.sync_api import sync_playwright

STATE = r"""
() => {
  const w = window.__saWorld;
  if (!w) return { missing: true };
  const units = w.units.filter(u => !u.dead);
  return {
    tick: w.tick, phase: w.phase, timeSec: Math.round(w.timeSec * 10) / 10,
    weather: w.weather,
    units: units.length,
    unitsWest: units.filter(u => u.faction === 'west').length,
    buildings: w.buildings.filter(b => !b.dead).length,
    shares: w.shares.map(s => Math.round(s * 1000) / 10),
    supplyWest: Math.round(w.supply[0]),
    firstUnit: units[0] ? { id: units[0].id, x: Math.round(units[0].x), z: Math.round(units[0].z), state: units[0].state } : null,
    endReason: w.endReason,
  };
}
"""

logs = []
with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    )
    page = b.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e)[:200]))
    page.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
    page.goto('http://127.0.0.1:8899/index.html', wait_until='load')
    page.wait_for_timeout(6000)

    print('start:', json.dumps(page.evaluate(STATE), ensure_ascii=False))
    page.mouse.click(640, 540)          # 开始作战
    page.wait_for_timeout(1500)
    print('deploy:', json.dumps(page.evaluate(STATE), ensure_ascii=False))

    page.mouse.click(1237, 660)         # 3× 加速
    page.wait_for_timeout(1200)
    page.mouse.click(760, 300)          # 点地面下令推进
    page.wait_for_timeout(6000)
    print('battle1:', json.dumps(page.evaluate(STATE), ensure_ascii=False))
    page.screenshot(path=r'd:\Cocos游戏源码合集\风暴行动\tools\qe_battle1.png')

    page.wait_for_timeout(12000)
    print('battle2:', json.dumps(page.evaluate(STATE), ensure_ascii=False))
    page.screenshot(path=r'd:\Cocos游戏源码合集\风暴行动\tools\qe_battle2.png')

    page.mouse.click(500, 606)          # 出兵
    page.wait_for_timeout(6000)
    print('produce:', json.dumps(page.evaluate(STATE), ensure_ascii=False))
    page.screenshot(path=r'd:\Cocos游戏源码合集\风暴行动\tools\qe_produce.png')
    b.close()

print('--- errors ---')
for line in logs[:12]:
    print(line)
