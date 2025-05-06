# 沉浸式翻译插件核心流程分析

沉浸式翻译是一个强大的浏览器扩展，它提供了网页双语对照翻译功能，与传统翻译插件不同的是，它专注于只翻译网页的内容区域，保持原有的网站结构和样式，从而提供更好的阅读体验。本文将深入分析该插件的核心流程和关键代码。

## 1. 插件整体架构

沉浸式翻译插件采用典型的浏览器扩展架构，主要包含以下几个部分：

- **Background Scripts**：后台脚本，处理翻译请求、缓存管理等
- **Content Scripts**：内容脚本，负责页面内容的提取、翻译和渲染
- **Popup**：弹出界面，提供用户交互
- **Options**：选项页面，提供设置和配置
- **库文件**：包含配置、语言处理、特殊规则等公共功能

## 2. 核心翻译流程

### 2.1 页面内容识别和处理

页面翻译的第一步是识别页面中需要翻译的内容。插件通过 `pageTranslator.js` 中的 `getPiecesToTranslate` 函数来完成这一步：

```js
function getPiecesToTranslate(root = document.body) {
    let piecesToTranslate = []
    let textNodesInfo = []

    const getAllNodes = function (node, lastHTMLElement = null, lastSelectOrDataListElement = null) {
        // 处理各种节点类型
        // ...
    }
    
    return {piecesToTranslate, textNodesInfo}
}
```

这个函数会递归地遍历文档树，找出所有文本节点。在遍历过程中，它会应用特殊规则来决定哪些内容需要翻译，哪些内容应该保持原样。

### 2.2 特殊网站规则应用

插件为常用的网站（如Twitter、Reddit、Github等）提供了特殊的规则，这些规则定义在 `specialRules.js` 中：

```js
const specialRules = [
  {
    "hostname": [
      "twitter.com",
      "tweetdeck.twitter.com",
      "mobile.twitter.com"
    ],
    "selectors": [
      "[data-testid=\"tweetText\"]",
      ".tweet-text",
      ".js-quoted-tweet-text",
      // ...其他选择器
    ],
    "detectLanguage": true
  },
  // 其他网站的规则
]
```

这些规则定义了哪些DOM元素应当被翻译。例如，对于Twitter，它会选择所有带有特定属性的元素（如推文文本）进行翻译。

### 2.3 发送翻译请求

一旦确定了需要翻译的内容，插件会将这些内容发送到后台进行翻译。这是通过 `backgroundTranslateHTML` 函数完成的：

```js
function backgroundTranslateHTML(translationService, targetLanguage, sourceArray2d, dontSortResults) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "translateHTML",
            translationService,
            targetLanguage,
            sourceArray2d,
            dontSortResults
        }, response => {
            resolve(response)
        })
    })
}
```

### 2.4 自定义关键词处理

在发送翻译请求之前，插件会处理用户定义的自定义词典，确保某些专业术语或特定词汇不会被翻译：

```js
function filterKeywordsInText(textContext) {
    let customDictionary = twpConfig.get("customDictionary")
    if (customDictionary.size > 0) {
        // 按关键词长度排序，先匹配长的关键词
        customDictionary = new Map([...customDictionary.entries()].sort((a, b) => String(b[0]).length - String(a[0]).length))
        for (let keyWord of customDictionary.keys()) {
            // 寻找并处理关键词
            // ...
        }
    }
    return textContext
}
```

### 2.5 翻译服务请求

后台脚本会处理翻译请求，使用配置的翻译服务（如Google、Yandex等）进行翻译。这部分逻辑主要在 `translationService.js` 中：

```js
class Service {
    // ...

    async translate(
      sourceLanguage,
      targetLanguage,
      sourceArray2d,
      dontSaveInPersistentCache = false,
      dontSortResults = false
    ) {
        // 执行翻译请求
        // ...
    }
}

const googleService = new (class extends Service {
    constructor() {
        super(
            "google",
            "https://translate.googleapis.com/translate_a/t?anno=3&client=te&v=1.0&format=html",
            "GET",
            cbTransformRequest,
            cbParseResponse,
            cbTransformResponse,
            cbGetExtraParameters
        )
    }
    // ...
})()
```

这里定义了不同的翻译服务，每个服务都有自己的URL和处理逻辑。

### 2.6 翻译缓存处理

为了提高性能并减少对翻译服务的请求，插件实现了一个复杂的缓存系统，在 `translationCache.js` 中：

```js
class Cache {
    /**
     * 为不同的翻译服务创建翻译缓存的基类
     */
    constructor(translationService, sourceLanguage, targetLanguage) {
        this.translationService = translationService;
        this.sourceLanguage = sourceLanguage;
        this.targetLanguage = targetLanguage;
        this.cache = new Map();
        this.promiseStartingCache = null;
    }

    async query(originalText) {
        // 查询缓存
        // ...
    }

    async add(originalText, translatedText, detectedLanguage = "und") {
        // 添加到缓存
        // ...
    }
    
    // 其他缓存方法
}
```

缓存系统使用IndexedDB存储翻译结果，提高再次访问相同内容时的速度。

### 2.7 呈现翻译结果

一旦得到翻译结果，插件会将其呈现在页面上。这部分逻辑在 `pageTranslator.js` 的 `translateResults` 函数中：

```js
async function translateResults(piecesToTranslateNow, results, ctx) {
    // 处理并展示翻译结果
    // ...
    
    // 对每个翻译段落应用双语显示
    const originalText = pieceToTranslate.node.textContent;
    const translatedText = results[index];
    
    // 创建包含原文和译文的显示
    // ...
}
```

在这个步骤中，插件会根据配置创建双语对照显示，包括可能的样式（如下划线、模糊效果等）。

## 3. 核心功能的实现细节

### 3.1 语言检测

插件能够自动检测页面语言，决定是否需要翻译：

```js
function detectPageLanguage() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "detectTabLanguage"
        }, language => {
            resolve(language)
        })
    })
}
```

### 3.2 动态内容的处理

对于动态加载的内容，插件使用MutationObserver来监听DOM变化：

```js
function enableMutatinObserver() {
    disableMutatinObserver()
    
    mutationObserver = new MutationObserver(async mutations => {
        if (document.documentElement.lang.toLowerCase().startsWith(twpConfig.get("targetLanguage"))) return;
        
        let translatedNodes = []
        for (const mutation of mutations) {
            if (mutation.type === "childList") {
                for (const addedNode of mutation.addedNodes) {
                    if (addedNode.nodeType === Node.ELEMENT_NODE) {
                        translatedNodes.push(addedNode)
                    }
                }
            }
        }
        
        // 翻译新添加的节点
        // ...
    })
    
    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
    })
}
```

### 3.3 Google翻译接口的使用

插件使用Google翻译API进行翻译，这需要特殊的处理：

```js
class GoogleHelper {
    static get googleTranslateTKK() {
        return "448487.932609646";
    }

    static calcHash(query) {
        // 计算Google翻译所需的哈希值
        // ...
    }
    
    // 其他辅助方法
}
```

该类负责计算Google翻译API所需的特殊参数。

### 3.4 上下文菜单的管理

插件添加了浏览器右键菜单项，用于快速翻译：

```js
function updateContextMenu(pageLanguageState = "original") {
    let contextMenuTitle
    if (pageLanguageState === "translated") {
        contextMenuTitle = chrome.i18n.getMessage("btnRestore")
    } else {
        const targetLanguage = twpConfig.get("targetLanguage")
        contextMenuTitle = chrome.i18n.getMessage("msgTranslateFor", twpLang.codeToLanguage(targetLanguage))
    }
    
    if (typeof chrome.contextMenus != 'undefined') {
        chrome.contextMenus.remove("translate-web-page", checkedLastError)
        if (twpConfig.get("showTranslatePageContextMenu") == "yes") {
            chrome.contextMenus.create({
                id: "translate-web-page",
                title: contextMenuTitle,
                contexts: ["page", "frame"]
            })
        }
    }
}
```

## 4. 特殊功能实现

### 4.1 PDF翻译

插件支持PDF文件的翻译，这是通过特殊的PDF处理逻辑实现的：

```js
// PDF处理相关代码
if (tabToMimeType[details.tabId] && tabToMimeType[details.tabId].toLowerCase() === "application/pdf") {
    // 特殊处理PDF文件
    // ...
}
```

### 4.2 双语主题样式

插件支持多种双语显示样式，如下划线、模糊效果等：

```js
// 在specialRules.js中通过style属性定义样式
{
    "hostname": "discord.com",
    "selectors": [
      "div[id^='message-content-']"
    ],
    "style":"underline"
}
```

## 5. 总结

沉浸式翻译插件通过巧妙的页面内容识别和处理、灵活的翻译服务集成、高效的缓存机制以及友好的用户界面，实现了优秀的网页双语对照翻译体验。它的核心优势在于：

1. 只翻译页面的内容区域，保持网站原有的结构和布局
2. 支持多种翻译服务
3. 使用缓存系统提高翻译速度
4. 为常用网站提供特殊优化
5. 支持PDF文件翻译
6. 提供多种双语显示样式

这些特性使得沉浸式翻译成为浏览外文网页和学习外语的理想工具。 