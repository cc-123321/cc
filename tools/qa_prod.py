"""产兵链路诊断：点击兵种按钮前后，读取 west 建筑的 autoType / produceType / 供应。"""
import json
from playwright.sync_api import sync_playwright

DUMP = r"""
() => {
  const w = window.__saWorld;
  if (!w) return { missing: true };
  const west = w.buildings.filter(b => b.faction === 'west' && !b.dead)
    .map(b => ({ id: b.id, def: b.def.id, produces: b.def.produces, auto: b.autoType, prod: b.produceType, ticks: b.produceTicks }));
  return {
    phase: w.phase, supply: Math.round(w.supply[0]),
    cap: w.economy.armyCap(w.ownedCells('west')),
    army: w.units.filter(u => !u.dead && u.faction === 'west').length,
    cmds: w._commands ? w._commands.length : 'n/a',
    west,
  };
}
"""

with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    )
    page = b.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: print('[pageerror]', str(e)[:300]))
    page.goto('http://127.0.0.1:8899/index.html', wait_until='load')
    page.wait_for_timeout(6000)
    page.mouse.click(640, 540)
    page.wait_for_timeout(16000)   # 等布阵结束进入战斗
    print('before:', json.dumps(page.evaluate(DUMP), ensure_ascii=False))
    page.mouse.click(500, 606)     # 步兵按钮
    page.wait_for_timeout(1500)
    print('after1:', json.dumps(page.evaluate(DUMP), ensure_ascii=False))
    page.wait_for_timeout(4000)
    print('after2:', json.dumps(page.evaluate(DUMP), ensure_ascii=False))
    b.close()
