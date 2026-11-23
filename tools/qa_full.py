"""完整一局验收：开始 → 3× → 设编成 → 周期推进 → 直到结算并截图。"""
import json
from playwright.sync_api import sync_playwright

STATE = r"""
() => {
  const w = window.__saWorld;
  if (!w) return { missing: true };
  const units = w.units.filter(u => !u.dead);
  return {
    tick: w.tick, phase: w.phase, t: Math.round(w.timeSec),
    units: units.length,
    west: units.filter(u => u.faction === 'west').length,
    shares: w.shares.map(s => Math.round(s * 1000) / 10),
    supply: Math.round(w.supply[0]),
    endReason: w.endReason, winner: w.winner, stalemate: w.isStalemate ? w.isStalemate() : null,
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
    page.on('console', lambda m: logs.append(f'[console.error] {m.text}') if m.type == 'error' else None)
    page.goto('http://127.0.0.1:8899/index.html', wait_until='load')
    page.wait_for_timeout(6000)
    page.mouse.click(640, 540)      # 开始作战
    page.wait_for_timeout(1500)
    page.mouse.click(1237, 660)     # 3×
    page.wait_for_timeout(800)
    page.mouse.click(500, 606)      # 步兵 → 设为持续生产
    page.wait_for_timeout(800)

    for i in range(14):
        # 交替推进方向，模拟玩家不断改指令
        page.mouse.click(700 + (i % 4) * 60, 260 + (i % 3) * 70)
        page.wait_for_timeout(5000)
        st = page.evaluate(STATE)
        print(f'r{i}:', json.dumps(st, ensure_ascii=False))
        if st.get('phase') == 'over':
            break

    page.wait_for_timeout(2000)
    final = page.evaluate(STATE)
    print('final:', json.dumps(final, ensure_ascii=False))
    page.screenshot(path=r'd:\Cocos游戏源码合集\风暴行动\tools\qg_final.png')
    b.close()

print('--- errors ---')
for line in logs[:8]:
    print(line)
