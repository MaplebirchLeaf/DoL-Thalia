import type { FaqItem, HomeNotice, Language, PageKey } from './types';

export interface LocalizedSiteCopy {
  backTop: string;
  collapse: string;
  download: string;
  editionStandard: string;
  editionDolp: string;
  expand: string;
  footer: string;
  heroStatement: string;
  heroTitle: string;
  noVersions: string;
  onlinePlay: string;
  viewDoLDownloads: string;
  viewDoLPDownloads: string;
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
    editionStandard: 'DoL',
    editionDolp: 'DoLP',
    expand: '展开',
    footer: 'Powered by Vue & Vite',
    heroStatement: '本站是 <a href="https://github.com/MaplebirchLeaf/DoL-Thalia">DoL-Thalia</a> 的第三方发布页，并非 DoL 或汉化组官方发布网站。',
    heroTitle: 'DoL-Thalia 整合包发布站',
    noVersions: '还没有可用版本。',
    onlinePlay: '在线游玩',
    viewDoLDownloads: '查看 DoL 下载',
    viewDoLPDownloads: '查看 DoLP 下载',
    selectVersion: '展开下载列表',
    showVersions: '查看下载版本',
    versionChoice: '下载配置',
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
      },
      {
        question: '为什么 ModLoader 加载 ZIP 时提示 boot.json 无效？',
        answer: '本仓库分发的是完整游戏本体与内置模组组成的整合包，不是单独的 ModLoader 模组。请解压后直接打开 HTML，或安装 APK；不要把整合包 ZIP 导入 ModLoader。'
      },
      {
        question: 'APK 打开后是英文，左下角也没有 ModLoader？',
        answer: '通常是 Android System WebView 版本过旧。请更新系统 WebView，或改用兼容版 APK；仍无法使用时，请用现代浏览器打开在线版。'
      },
      {
        question: '美化出现错位、黑边或光头？',
        answer: '所用美化可能尚未跟进当前游戏版本的资源或模型改动。请改用对应版本的美化，或等待其作者更新。'
      },
      {
        question: '为什么中英文混杂？',
        answer: '请在 ModLoader 的“旁加载”中卸载额外安装的汉化模组。整合包已经内置与游戏版本对应的汉化，重复加载会互相覆盖。'
      },
      {
        question: '切换版本会共用存档吗？',
        answer: '通常会。存档按网页来源和 IndexedDB 数据库保存，同一 APK 更新或同一在线站点下的不同版本会共用存档。切换版本前请导出 .save 文件；本地 ZIP 的隔离行为因浏览器而异，不能依赖它。'
      }
    ]
  },
  en: {
    backTop: 'Back to top',
    collapse: 'Collapse',
    download: 'Download',
    editionStandard: 'DoL',
    editionDolp: 'DoLP',
    expand: 'Expand',
    footer: 'Powered by Vue & Vite',
    heroStatement:
      'This is an unofficial release page for <a href="https://github.com/MaplebirchLeaf/DoL-Thalia">DoL-Thalia</a>. It is not an official website for DoL or the Chinese localization project.',
    heroTitle: 'DoL-Thalia Release Hub',
    noVersions: 'No release versions are available yet.',
    onlinePlay: 'Play online',
    viewDoLDownloads: 'Browse DoL downloads',
    viewDoLPDownloads: 'Browse DoLP downloads',
    selectVersion: 'Show downloads',
    showVersions: 'Browse downloads',
    versionChoice: 'Package',
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
      },
      {
        question: 'Why does ModLoader say the ZIP has an invalid boot.json?',
        answer:
          'This download is a complete game package with bundled mods, not a standalone ModLoader mod. Extract it and open the HTML file, or install the APK. Do not import the ZIP into ModLoader.'
      },
      {
        question: 'Why is the APK in English with no ModLoader in the corner?',
        answer: 'Your Android System WebView is likely too old. Update it, try the compatibility APK, or use the online build in a modern browser.'
      },
      {
        question: 'Why do visual mods have offsets, black borders, or a bald character?',
        answer: 'The visual mod may not yet support changes in the current game version. Use a compatible version or wait for its author to update it.'
      },
      {
        question: 'Why is the game partly Chinese and partly English?',
        answer: 'Uninstall any side-loaded translation mod in ModLoader. The package already includes the matching translation, and duplicate translation mods overwrite one another.'
      },
      {
        question: 'Do different versions share saves?',
        answer:
          'Usually, yes. Saves are keyed by web origin and IndexedDB database, so APK updates and versions on the same online site share them. Export a .save before switching; local ZIP isolation depends on the browser and is not reliable.'
      }
    ]
  }
};
