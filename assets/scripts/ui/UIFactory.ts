import { Node, UITransform, Graphics, Label, Color, Layers, UIOpacity, tween } from 'cc';

/**
 * 军事暗色 UI 工厂：全部 Graphics + Label 程序化绘制，零图片资源。
 * 坐标约定：
 *   - HUD 根节点位于 Canvas 中心；
 *   - 屏幕坐标原点左下角，用 SX()/SY() 转成 HUD 根节点局部坐标；
 *   - 面板内部子元素一律使用面板局部坐标（原点=面板中心）。
 */

export const SCREEN_W = 1280;
export const SCREEN_H = 720;

export function SX(x: number): number { return x - SCREEN_W * 0.5; }
export function SY(y: number): number { return y - SCREEN_H * 0.5; }

export const COL = {
    bg: '#0B1015',
    bgSoft: '#121A20',
    panel: '#151E25',
    line: '#4FD1D9',
    text: '#E6EDF3',
    dim: '#9BB0BF',
    good: '#5BD08A',
    bad: '#E23C3C',
    warn: '#E8B33A',
    blue: '#2E7DE1',
    red: '#E23C3C',
    yellow: '#E8B33A',
    accent: '#4FD1D9',
};

export function hex(c: string, a = 255): Color {
    const s = c.replace('#', '');
    return new Color(
        parseInt(s.substring(0, 2), 16),
        parseInt(s.substring(2, 4), 16),
        parseInt(s.substring(4, 6), 16),
        a,
    );
}

export function makeNode(parent: Node, name: string, x: number, y: number, w = 0, h = 0): Node {
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    parent.addChild(n);
    n.setPosition(x, y, 0);
    if (w > 0 || h > 0) {
        const ut = n.addComponent(UITransform);
        ut.setContentSize(w, h);
        ut.setAnchorPoint(0.5, 0.5);
    }
    return n;
}

export function makeLabel(
    parent: Node, text: string, x: number, y: number,
    fontSize = 16, color = COL.text, bold = false,
): Label {
    const n = makeNode(parent, 'label', x, y);
    const lb = n.addComponent(Label);
    lb.string = text;
    lb.fontSize = fontSize;
    lb.lineHeight = fontSize + 6;
    lb.color = hex(color);
    lb.isBold = bold;
    lb.useSystemFont = true;
    lb.fontFamily = 'PingFang SC, Microsoft YaHei, sans-serif';
    lb.horizontalAlign = Label.HorizontalAlign.CENTER;
    lb.verticalAlign = Label.VerticalAlign.CENTER;
    lb.overflow = Label.Overflow.NONE;
    return lb;
}

/** 左对齐标签（用于面板标题/说明） */
export function makeLabelLeft(
    parent: Node, text: string, x: number, y: number,
    fontSize = 16, color = COL.text, bold = false,
): Label {
    const lb = makeLabel(parent, text, x, y, fontSize, color, bold);
    lb.horizontalAlign = Label.HorizontalAlign.LEFT;
    lb.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    lb.node.setPosition(x, y);
    return lb;
}

export function drawPanel(g: Graphics, w: number, h: number, opts: { fill?: string; alpha?: number; stroke?: string; radius?: number } = {}): void {
    const a = opts.alpha ?? 220;
    const r = opts.radius ?? 4;
    g.clear();
    g.fillColor = hex(opts.fill ?? COL.panel, a);
    g.strokeColor = hex(opts.stroke ?? COL.line, 90);
    g.lineWidth = 1.5;
    g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
    g.fill();
    g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
    g.stroke();
}

export interface ButtonHandle {
    node: Node;
    label: Label;
    bg: Graphics;
    setEnabled(enabled: boolean): void;
    setText(text: string): void;
    setActive(active: boolean): void;
    destroy(): void;
}

export function makeButton(
    parent: Node, x: number, y: number, w: number, h: number, text: string,
    onClick: () => void, opts: { fontSize?: number; fill?: string; stroke?: string; textColor?: string; radius?: number } = {},
): ButtonHandle {
    const node = makeNode(parent, 'btn', x, y, w, h);
    const g = node.addComponent(Graphics);
    const label = makeLabel(node, text, 0, 0, opts.fontSize ?? 15, opts.textColor ?? COL.text, true);
    let enabled = true;
    let hover = false;

    const paint = () => {
        g.clear();
        g.fillColor = hex(opts.fill ?? COL.bgSoft, enabled ? 235 : 110);
        g.strokeColor = hex(opts.stroke ?? COL.line, enabled ? 110 : 35);
        g.lineWidth = 1.4;
        g.roundRect(-w * 0.5, -h * 0.5, w, h, opts.radius ?? 4);
        g.fill();
        g.roundRect(-w * 0.5, -h * 0.5, w, h, opts.radius ?? 4);
        g.stroke();
        if (hover && enabled) {
            g.fillColor = hex(COL.line, 45);
            g.roundRect(-w * 0.5, -h * 0.5, w, h, opts.radius ?? 4);
            g.fill();
        }
        label.color = hex(enabled ? (opts.textColor ?? COL.text) : '#54646F');
    };
    paint();

    node.on(Node.EventType.TOUCH_START, () => { hover = true; paint(); });
    node.on(Node.EventType.TOUCH_END, () => { hover = false; paint(); if (enabled) onClick(); });
    node.on(Node.EventType.TOUCH_CANCEL, () => { hover = false; paint(); });

    return {
        node,
        label,
        bg: g,
        setEnabled(e: boolean) { enabled = e; paint(); },
        setText(t: string) { label.string = t; },
        setActive(a: boolean) { node.active = a; },
        destroy() { node.destroy(); },
    };
}

/** 阵营占比条 */
export function drawBar(g: Graphics, w: number, h: number, pct: number, color: string): void {
    g.clear();
    g.fillColor = hex('#000000', 150);
    g.rect(-w * 0.5, -h * 0.5, w, h);
    g.fill();
    g.fillColor = hex(color, 235);
    g.rect(-w * 0.5, -h * 0.5, Math.max(0, Math.min(1, pct)) * w, h);
    g.fill();
    g.strokeColor = hex(COL.line, 55);
    g.lineWidth = 1;
    g.rect(-w * 0.5, -h * 0.5, w, h);
    g.stroke();
}

export function fadeIn(node: Node, dur = 0.25): void {
    const op = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    op.opacity = 0;
    tween(op).to(dur, { opacity: 255 }).start();
}

export function fadeOut(node: Node, dur = 0.2, destroyAfter = true): void {
    const op = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    tween(op).to(dur, { opacity: 0 }).call(() => { if (destroyAfter && node.isValid) node.destroy(); }).start();
}
