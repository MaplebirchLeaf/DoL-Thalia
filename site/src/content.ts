import type { FaqItem, HomeNotice, Language, PageKey } from './types';

export interface LocalizedSiteCopy {
  backTop: string;
  collapse: string;
  download: string;
  expand: string;
  footer: string;
  heroStatement: string;
  heroTitle: string;
  noVersions: string;
  onlinePlay: string;
  selectVersion: string;
  showVersions: string;
  versionChoice: string;
  navItems: Array<{ key: PageKey; label: string }>;
  homeNotices: HomeNotice[];
  faqIntro: string;
  faqItems: FaqItem[];
}

export const LANGUAGE_LABELS: Record<Language, string> = {
  zh: '中文',
  en: 'English'
};

export const LOCALIZED_SITE_COPY: Record<Language, LocalizedSiteCopy> = {
  zh: {
    backTop: '返回顶部',
    collapse: '收起',
    download: 'GitHub 下载',
    expand: '展开',
    footer: 'Powered by Vue & Vite',
    heroStatement: '本站是 <a href="https://github.com/MaplebirchLeaf/DoL-Thalia">DoL-Thalia</a> 的第三方发布页，并非 DoL 或汉化组官方发布网站。',
    heroTitle: 'DoL-Thalia 整合包发布站',
    noVersions: '还没有可用版本。',
    onlinePlay: '在线游玩',
    selectVersion: '选择此版本',
    showVersions: '进入版本选择',
    versionChoice: '版本选择',
    navItems: [
      { key: 'home', label: '首页' },
      { key: 'versions', label: '历史版本' },
      { key: 'help', label: '疑难解答' }
    ],
    homeNotices: [
      {
        title: '使用前请注意',
        paragraphs: [
          'DoL-Thalia 是基于 Degrees of Lewdity、汉化仓库与 ModLoader 生态制作的第三方二创整合包，不代表原游戏作者、汉化组或相关作者的官方立场。',
          '使用本整合包出现问题时，请先使用 <a href="https://github.com/Eltirosto/Degrees-of-Lewdity-Chinese-Localization">汉化仓库</a> 发布的版本，或 <a href="https://eltirosto.github.io/Degrees-of-Lewdity-Chinese-Localization/">汉化在线版</a> 测试是否同样出现。'
        ]
      },
      {
        title: '免责声明',
        paragraphs: [
          '整合包可能包含第三方模组、美化包或资源替换内容。相关内容造成的显示错误、兼容问题、资源缺失、加载失败或游戏行为变化，请优先确认对应来源与说明。',
          'DoL-Thalia 仅负责整合与发布流程本身，不代表对所有内置或可选内容的稳定性与兼容性作出保证。'
        ]
      }
    ],
    faqIntro: '这里收集下载、存档、整合包加载和移动端常见问题。',
    faqItems: [
      {
        question: '下载 ZIP 后怎么游玩？',
        answer: '解压后打开 HTML 文件即可。浏览器本地游玩时，请保留同目录下的资源文件。'
      },
      {
        question: '清理浏览器缓存会影响存档吗？',
        answer: '会。请定期导出存档文件，尤其是在手机浏览器或 WebView 环境中。'
      },
      {
        question: '整合包无法加载怎么办？',
        answer: '先确认下载文件完整，再尝试使用汉化仓库发布的原版汉化包复现。若只在 DoL-Thalia 出现问题，再向本仓库反馈。'
      }
    ]
  },
  en: {
    backTop: 'Back to top',
    collapse: 'Collapse',
    download: 'Download',
    expand: 'Expand',
    footer: 'Powered by Vue & Vite',
    heroStatement:
      'This is an unofficial release page for <a href="https://github.com/MaplebirchLeaf/DoL-Thalia">DoL-Thalia</a>. It is not an official website for DoL or the Chinese localization project.',
    heroTitle: 'DoL-Thalia Release Hub',
    noVersions: 'No release versions are available yet.',
    onlinePlay: 'Play online',
    selectVersion: 'Select this version',
    showVersions: 'Choose a version',
    versionChoice: 'Variant',
    navItems: [
      { key: 'home', label: 'Home' },
      { key: 'versions', label: 'Versions' },
      { key: 'help', label: 'Help' }
    ],
    homeNotices: [
      {
        title: 'Before You Play',
        paragraphs: [
          'DoL-Thalia is a third-party derivative package built around Degrees of Lewdity, the Chinese localization project, and the ModLoader ecosystem. It does not represent the official position of the original game author, the localization team, or related authors.',
          'If you run into issues, first test with a release from the <a href="https://github.com/Eltirosto/Degrees-of-Lewdity-Chinese-Localization">Chinese localization repository</a> or the <a href="https://eltirosto.github.io/Degrees-of-Lewdity-Chinese-Localization/">online localized build</a>.'
        ]
      },
      {
        title: 'Disclaimer',
        paragraphs: [
          'The package may include third-party mods, visual packs, or resource replacements. Display bugs, compatibility issues, missing assets, load failures, or behavior changes from those contents should be checked against their own sources and notes first.',
          'DoL-Thalia is responsible for the integration and release process only. It does not guarantee the stability or compatibility of every included or optional component.'
        ]
      }
    ],
    faqIntro: 'Common questions about downloads, saves, package loading, and mobile play.',
    faqItems: [
      {
        question: 'How do I play after downloading the ZIP?',
        answer: 'Extract the archive and open the HTML file. When playing locally in a browser, keep the resource files in the same folder.'
      },
      {
        question: 'Will clearing browser cache affect saves?',
        answer: 'Yes. Export your save files regularly, especially on mobile browsers or WebView-based apps.'
      },
      {
        question: 'What should I do if the package does not load?',
        answer: 'First confirm the download is complete, then try reproducing the issue with the original localized package. If it only happens in DoL-Thalia, report it here.'
      }
    ]
  }
};
