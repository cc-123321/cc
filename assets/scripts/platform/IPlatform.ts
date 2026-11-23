/**
 * 平台能力契约：微信 / 抖音 / PC 三套实现的唯一耦合点。
 * 业务层只依赖这个接口，切换平台不影响任何游戏逻辑。
 */

export type AdScene = 'doubleMerit' | 'revive' | 'speedUp' | 'supply' | 'trialUnit';

export interface SafeInsets {
    top: number; right: number; bottom: number; left: number;
}

export interface IPlatform {
    readonly name: 'wx' | 'tt' | 'mock';
    init(): Promise<void>;
    /** 安全区内缩（刘海屏） */
    getSafeInsets(): SafeInsets;
    /** 激励视频：true = 完整观看、应发奖 */
    showRewardedVideo(scene: AdScene): Promise<boolean>;
    /** 插屏：仅在局间结算后调用 */
    showInterstitial(): Promise<boolean>;
    startRecord(): void;
    stopRecordAndShare(title: string): Promise<boolean>;
    vibrate(strong: boolean): void;
    /** 存档读写（平台本地存储） */
    getStorage(key: string): string | null;
    setStorage(key: string, value: string): void;
}

/** 广告位 id 集中配置：上线前填入平台后台申请的 id */
export const AD_UNITS = {
    /** 激励视频（抖音/微信同一套代码，id 各自不同，构建时区分） */
    rewarded: '',
    interstitial: '',
};
