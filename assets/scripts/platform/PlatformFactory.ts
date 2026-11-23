import { sys } from 'cc';
import { IPlatform, AdScene, SafeInsets, AD_UNITS } from './IPlatform';

declare const wx: any;
declare const tt: any;

/**
 * PC 预览：模拟 2.5 秒广告，直接发奖（不阻塞开发调试）。
 */
export class MockPlatform implements IPlatform {
    public readonly name = 'mock' as const;
    public async init(): Promise<void> { /* noop */ }
    public getSafeInsets(): SafeInsets { return { top: 0, right: 0, bottom: 0, left: 0 }; }
    public async showRewardedVideo(_scene: AdScene): Promise<boolean> {
        await new Promise<void>((r) => setTimeout(r, 2500));
        return true;
    }
    public async showInterstitial(): Promise<boolean> {
        await new Promise<void>((r) => setTimeout(r, 800));
        return true;
    }
    public startRecord(): void { /* noop */ }
    public async stopRecordAndShare(_title: string): Promise<boolean> { return false; }
    public vibrate(_strong: boolean): void { /* noop */ }
    public getStorage(key: string): string | null { return sys.localStorage.getItem(key); }
    public setStorage(key: string, value: string): void { sys.localStorage.setItem(key, value); }
}

/**
 * 微信小游戏：激励视频 / 插屏 / 录屏分享 / 震动。
 * 注意：adUnitId 必须与后台申请一致，否则 show() 会 reject。
 */
export class WxPlatform implements IPlatform {
    public readonly name = 'wx' as const;
    private _rewarded: any = null;
    private _interstitial: any = null;
    private _recorder: any = null;

    public async init(): Promise<void> {
        try {
            if (AD_UNITS.rewarded && wx.createRewardedVideoAd) {
                this._rewarded = wx.createRewardedVideoAd({ adUnitId: AD_UNITS.rewarded });
                this._rewarded.onError(() => { this._rewarded = null; });
            }
            if (AD_UNITS.interstitial && wx.createInterstitialAd) {
                this._interstitial = wx.createInterstitialAd({ adUnitId: AD_UNITS.interstitial });
            }
            if (wx.getGameRecorderManager) this._recorder = wx.getGameRecorderManager();
            wx.showShareMenu?.({ withShareTicket: true, menus: ['shareAppMessage'] });
        } catch (e) {
            console.warn('[Ad] wx init failed', e);
        }
    }

    public getSafeInsets(): SafeInsets {
        try {
            const r = sys.getSafeAreaRect();
            const v = sys.getVisibleSize();
            void v;
            return { top: v.height - r.y - r.height, right: r.x, bottom: r.y, left: 0 };
        } catch { return { top: 0, right: 0, bottom: 0, left: 0 }; }
    }

    public showRewardedVideo(_scene: AdScene): Promise<boolean> {
        return this._showRewarded(this._rewarded, () => {
            if (wx.createRewardedVideoAd && AD_UNITS.rewarded) {
                this._rewarded = wx.createRewardedVideoAd({ adUnitId: AD_UNITS.rewarded });
                return this._rewarded;
            }
            return null;
        });
    }

    private _showRewarded(ad: any, recreate: () => any): Promise<boolean> {
        if (!ad) return Promise.resolve(false);
        return new Promise<boolean>((resolve) => {
            let settled = false;
            const finish = (v: boolean) => { if (!settled) { settled = true; resolve(v); } };
            const onClose = (res: { isEnded?: boolean }) => {
                ad.offClose?.(onClose);
                finish(!!(res && res.isEnded));
            };
            ad.onClose?.(onClose);
            const tryShow = () => ad.show().catch(() => ad.load?.().then(() => ad.show()).catch(() => finish(false)));
            tryShow();
            setTimeout(() => {
                if (!settled) {
                    ad.offClose?.(onClose);
                    const re = recreate();
                    if (re) { re.load?.(); }
                    finish(false);
                }
            }, 15000);
        });
    }

    public async showInterstitial(): Promise<boolean> {
        if (!this._interstitial) return false;
        try {
            await this._interstitial.show();
            return true;
        } catch {
            return false;
        }
    }

    public startRecord(): void {
        try { this._recorder?.start({ duration: 30 }); } catch { /* 录制不可用时静默降级 */ }
    }

    public async stopRecordAndShare(title: string): Promise<boolean> {
        if (!this._recorder) return false;
        return new Promise<boolean>((resolve) => {
            try {
                this._recorder.onStop((res: { videoPath: string }) => {
                    wx.shareAppMessage({
                        title,
                        imageUrl: '',
                        query: '',
                        extra: { videoPath: res.videoPath, videoPath: res.videoPath, videoWithCocos: true },
                    });
                    resolve(true);
                });
                this._recorder.stop();
            } catch {
                resolve(false);
            }
        });
    }

    public vibrate(strong: boolean): void {
        try {
            if (strong) wx.vibrateLong?.(); else wx.vibrateShort?.({ type: 'light' });
        } catch { /* noop */ }
    }

    public getStorage(key: string): string | null { try { return wx.getStorageSync(key) || null; } catch { return null; } }
    public setStorage(key: string, value: string): void { try { wx.setStorageSync(key, value); } catch { /* noop */ } }
}

/** 抖音小游戏：与微信 API 高度同构，差异在录屏与分享路径 */
export class TtPlatform implements IPlatform {
    public readonly name = 'tt' as const;
    private _rewarded: any = null;
    private _interstitial: any = null;
    private _recorder: any = null;

    public async init(): Promise<void> {
        try {
            if (AD_UNITS.rewarded && tt.createRewardedVideoAd) {
                this._rewarded = tt.createRewardedVideoAd({ adUnitId: AD_UNITS.rewarded });
                this._rewarded.onError(() => { this._rewarded = null; });
            }
            if (AD_UNITS.interstitial && tt.createInterstitialAd) {
                this._interstitial = tt.createInterstitialAd({ adUnitId: AD_UNITS.interstitial });
            }
            if (tt.getGameRecorderManager) this._recorder = tt.getGameRecorderManager();
        } catch (e) {
            console.warn('[Ad] tt init failed', e);
        }
    }

    public getSafeInsets(): SafeInsets {
        try {
            const r = sys.getSafeAreaRect();
            const v = sys.getVisibleSize();
            return { top: v.height - r.y - r.height, right: r.x, bottom: r.y, left: 0 };
        } catch { return { top: 0, right: 0, bottom: 0, left: 0 }; }
    }

    public showRewardedVideo(_scene: AdScene): Promise<boolean> {
        if (!this._rewarded) return Promise.resolve(false);
        const ad = this._rewarded;
        return new Promise<boolean>((resolve) => {
            let settled = false;
            const finish = (v: boolean) => { if (!settled) { settled = true; resolve(v); } };
            const onClose = (res: { isEnded?: boolean }) => {
                ad.offClose?.(onClose);
                finish(!!(res && res.isEnded));
            };
            ad.onClose?.(onClose);
            ad.show().catch(() => ad.load?.().then(() => ad.show()).catch(() => finish(false)));
            setTimeout(() => finish(false), 15000);
        });
    }

    public async showInterstitial(): Promise<boolean> {
        if (!this._interstitial) return false;
        try { await this._interstitial.show(); return true; } catch { return false; }
    }

    public startRecord(): void {
        try { this._recorder?.start({ duration: 30 }); } catch { /* noop */ }
    }

    public async stopRecordAndShare(title: string): Promise<boolean> {
        if (!this._recorder) return false;
        return new Promise<boolean>((resolve) => {
            try {
                this._recorder.onStop((res: { videoPath: string }) => {
                    tt.shareAppMessage({ title, channel: 'video', extra: { videoPath: res.videoPath } });
                    resolve(true);
                });
                this._recorder.stop();
            } catch { resolve(false); }
        });
    }

    public vibrate(strong: boolean): void {
        try { if (strong) tt.vibrateLong?.(); else tt.vibrateShort?.(); } catch { /* noop */ }
    }

    public getStorage(key: string): string | null { try { return tt.getStorageSync(key) || null; } catch { return null; } }
    public setStorage(key: string, value: string): void { try { tt.setStorageSync(key, value); } catch { /* noop */ } }
}

/** 运行时探测平台（PC 预览 → mock） */
export function createPlatform(): IPlatform {
    if (typeof tt !== 'undefined' && tt?.createRewardedVideoAd) return new TtPlatform();
    if (typeof wx !== 'undefined' && wx?.createRewardedVideoAd) return new WxPlatform();
    return new MockPlatform();
}
