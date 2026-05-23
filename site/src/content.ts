import type { FaqItem, HomeNotice, PageKey } from './types';

export const visibleNavItems: Array<{ key: Exclude<PageKey, 'mods'>; label: string }> = [
  { key: 'home', label: '首页' },
  { key: 'versions', label: '历史版本' },
  { key: 'help', label: '疑难解答' }
];

export const homeNotices: HomeNotice[] = [
  {
    title: '使用前请注意',
    paragraphs: [
      'DoL-Thalia 是基于 Degrees of Lewdity、汉化仓库与 ModLoader 生态制作的第三方二创整合包，不代表原游戏作者、汉化组或相关模组作者的官方立场。',
      '使用本整合包出现问题时，请先使用 <a href="https://github.com/Eltirosto/Degrees-of-Lewdity-Chinese-Localization">汉化仓库</a> 发布的版本，或 <a href="https://eltirosto.github.io/Degrees-of-Lewdity-Chinese-Localization/">汉化在线版</a> 测试是否同样出现。'
    ]
  },
  {
    title: '免责声明',
    paragraphs: [
      '整合包可能包含第三方模组、美化模组或资源替换内容。相关模组造成的显示错误、兼容问题、资源缺失、加载失败或游戏行为变化，请优先确认对应模组来源与说明。',
      'DoL-Thalia 仅负责整合与发布流程本身，不代表对所有内置或可选模组的内容、稳定性与兼容性作出保证。'
    ]
  }
];

export const faqItems: FaqItem[] = [
  {
    question: '下载 ZIP 后怎么游玩？',
    answer: '解压后打开 HTML 文件即可。浏览器本地游玩时，请保留同目录下的资源文件。'
  },
  {
    question: '清理浏览器缓存会影响存档吗？',
    answer: '会。请定期导出存档文件，尤其是在手机浏览器或 WebView 环境中。'
  },
  {
    question: '模组无法加载怎么办？',
    answer: '先确认模组文件完整，再检查是否缺少前置模组。部分模组可能只适合特定游戏版本。'
  }
];
