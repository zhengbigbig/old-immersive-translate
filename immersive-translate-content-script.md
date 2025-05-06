# 沉浸式翻译插件内容脚本实现分析

内容脚本（Content Script）是浏览器扩展中直接在网页上下文中运行的JavaScript代码。在沉浸式翻译插件中，内容脚本负责页面的解析、翻译内容的识别和显示。本文将详细分析沉浸式翻译插件中内容脚本的实现原理和核心代码。

## 1. 内容脚本的组成与结构

沉浸式翻译插件的内容脚本主要位于 `src/contentScript` 目录中，主要包括以下几个核心文件：

- `pageTranslator.js`：页面翻译的核心逻辑
- `showOriginal.js`：处理原文显示的逻辑
- `enhance.js`：增强功能
- `popupMobile.js`：移动端弹窗实现
- `css/`：样式相关文件

## 2. 页面翻译核心实现

`pageTranslator.js` 是内容脚本的核心文件，负责页面翻译的全流程。下面对其核心功能进行解析。

### 2.1 文本标记处理

翻译前，插件需要处理原文中的特殊内容，如用户定义的不翻译关键词。这是通过特殊标记实现的：

```js
// 用于标记不翻译内容的特殊标记
const startMark = '@%';
const endMark = '#$';
const startMark0 = '@ %';
const endMark0 = '# $';

function filterKeywordsInText(textContext) {
    let customDictionary = twpConfig.get("customDictionary")
    if (customDictionary.size > 0) {
        // 按关键词长度排序，先匹配长的关键词
        customDictionary = new Map([...customDictionary.entries()].sort((a, b) => String(b[0]).length - String(a[0]).length))
        for (let keyWord of customDictionary.keys()) {
            while (true) {
                let index = textContext.toLowerCase().indexOf(keyWord)
                if (index === -1) {
                    break
                } else {
                    // 用特殊标记替换关键词，防止被翻译
                    textContext = removeExtraDelimiter(textContext)
                    let previousIndex = index - 1
                    let nextIndex = index + keyWord.length
                    let previousChar = previousIndex === -1 ? '\n' : textContext.charAt(previousIndex)
                    let nextChar = nextIndex === textContext.length ? '\n' : textContext.charAt(nextIndex)
                    let placeholderText = ''
                    let keyWordWithCase = textContext.substring(index, index + keyWord.length)
                    if (isPunctuationOrDelimiter(previousChar) && isPunctuationOrDelimiter(nextChar)) {
                        placeholderText = startMark + handleHitKeywords(keyWordWithCase, true) + endMark
                    } else {
                        // 处理单词中间的情况
                        placeholderText = '#n%o#'
                        for (let c of Array.from(keyWordWithCase)) {
                            placeholderText += c
                            placeholderText += '#n%o#'
                        }
                    }
                    let frontPart = textContext.substring(0, index)
                    let backPart = textContext.substring(index + keyWord.length)
                    textContext = frontPart + placeholderText + backPart
                }
            }
            textContext = textContext.replaceAll('#n%o#', '')
        }
    }
    return textContext
}
```

### 2.2 DOM解析与需翻译内容识别

沉浸式翻译的核心特性是只翻译内容区域，这需要精准识别页面中需要翻译的部分：

```js
function getPiecesToTranslate(root = document.body) {
    let piecesToTranslate = []
    let textNodesInfo = []

    const getAllNodes = function (node, lastHTMLElement = null, lastSelectOrDataListElement = null) {
        // 跳过不需要翻译的节点
        if (hasNoTranslate(node)) return;
        
        // 处理不同类型的节点
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim()
            if (text && text.length > 1) {
                // 将文本节点添加到翻译列表
                piecesToTranslate.push({
                    node,
                    parentElement: lastHTMLElement,
                    text
                })
                
                // 记录文本节点信息
                textNodesInfo.push({
                    node,
                    parentElement: lastHTMLElement
                })
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            // 判断元素是否需要翻译
            const isEditableElement = node.isContentEditable || 
                                     (node.tagName === "INPUT" && node.type !== "hidden") || 
                                     node.tagName === "TEXTAREA";

            // 递归遍历子节点
            if (!isEditableElement) {
                // 检查是否是特殊规则定义的需要翻译的元素
                const isContainer = checkIsContainer(node);
                
                // 递归处理子节点
                const childNodes = node.childNodes;
                getAllChilds(childNodes);
            }
        }
    }
    
    // 递归处理根节点的所有子节点
    getAllNodes(root);
    
    return {piecesToTranslate, textNodesInfo}
}
```

### 2.3 特殊规则的应用

沉浸式翻译对常用网站提供了特殊规则，这些规则在内容脚本中得到应用：

```js
function checkIsContainer(node) {
    // 检查节点是否匹配特殊规则中的容器选择器
    if (!currentPageTranslatorSpecialRules) return false;
    
    if (currentPageTranslatorSpecialRules.containerSelectors) {
        for (const selector of currentPageTranslatorSpecialRules.containerSelectors) {
            try {
                if (node.matches(selector)) {
                    return true;
                }
            } catch (e) {
                console.error("Invalid selector", selector, e);
            }
        }
    }
    
    return false;
}

function checkIsToTranslate(node) {
    // 检查节点是否匹配特殊规则中的翻译选择器
    if (!currentPageTranslatorSpecialRules) return false;
    
    if (currentPageTranslatorSpecialRules.selectors) {
        for (const selector of currentPageTranslatorSpecialRules.selectors) {
            try {
                if (node.matches(selector)) {
                    return true;
                }
            } catch (e) {
                console.error("Invalid selector", selector, e);
            }
        }
    }
    
    return false;
}
```

### 2.4 翻译请求的发送与处理

内容脚本负责收集需要翻译的内容，然后发送给后台脚本处理：

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

// 在实际翻译过程中的使用
async function translateDynamically() {
    // 获取需要翻译的内容
    const {piecesToTranslate, textNodesInfo} = getPiecesToTranslate(root);
    
    if (piecesToTranslate.length > 0) {
        // 准备翻译数据
        const sourceArray2d = [];
        for (const piece of piecesToTranslate) {
            // 处理自定义词典和过滤
            const processedText = filterKeywordsInText(piece.text);
            sourceArray2d.push([processedText]);
        }
        
        // 发送翻译请求
        const results = await backgroundTranslateHTML(
            currentPageTranslatorService,
            currentTargetLanguage,
            sourceArray2d,
            false
        );
        
        // 处理翻译结果
        if (results) {
            await translateResults(piecesToTranslate, results);
        }
    }
}
```

### 2.5 翻译结果的呈现

沉浸式翻译最大的特点是双语对照显示，这是在 `translateResults` 函数中实现的：

```js
async function translateResults(piecesToTranslateNow, results, ctx) {
    // 处理每一个翻译片段
    for (let i = 0; i < piecesToTranslateNow.length; i++) {
        const pieceToTranslate = piecesToTranslateNow[i];
        const originalText = pieceToTranslate.node.textContent;
        const translatedText = results[i];
        
        // 检查是否需要处理自定义词典
        const finalTranslatedText = await handleCustomWords(
            translatedText,
            originalText,
            currentPageTranslatorService,
            currentTargetLanguage
        );
        
        // 创建双语显示的元素
        const translatedTextElem = document.createElement('span');
        translatedTextElem.classList.add('translated-text');
        
        const originalTextElem = document.createElement('span');
        originalTextElem.classList.add('original-text');
        originalTextElem.textContent = originalText;
        
        // 应用样式
        if (currentPageTranslatorSpecialRules && currentPageTranslatorSpecialRules.style) {
            applyStyle(translatedTextElem, originalTextElem, currentPageTranslatorSpecialRules.style);
        }
        
        // 替换原来的文本节点
        const wrapperElement = document.createElement('span');
        wrapperElement.classList.add('translated-wrapper');
        wrapperElement.appendChild(originalTextElem);
        wrapperElement.appendChild(translatedTextElem);
        
        pieceToTranslate.node.parentNode.replaceChild(wrapperElement, pieceToTranslate.node);
    }
}
```

### 2.6 动态内容的处理

对于动态加载的内容，如社交媒体的无限滚动，内容脚本使用 MutationObserver 来监听DOM变化：

```js
function enableMutatinObserver() {
    disableMutatinObserver()
    
    mutationObserver = new MutationObserver(async mutations => {
        // 避免对已翻译语言页面进行处理
        if (document.documentElement.lang.toLowerCase().startsWith(twpConfig.get("targetLanguage"))) return;
        
        let translatedNodes = []
        for (const mutation of mutations) {
            if (mutation.type === "childList") {
                for (const addedNode of mutation.addedNodes) {
                    if (addedNode.nodeType === Node.ELEMENT_NODE) {
                        // 检查新添加的节点是否需要翻译
                        if (!addedNode.isContentEditable) {
                            translatedNodes.push(addedNode)
                        }
                    }
                }
            }
        }
        
        // 翻译新添加的节点
        if (translatedNodes.length > 0) {
            await translateNewNodes(translatedNodes);
        }
    })
    
    // 监听整个文档的变化
    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
    })
}

async function translateNewNodes(nodes) {
    for (const node of nodes) {
        // 跳过已翻译的节点
        if (node.classList.contains('translated-node')) continue;
        
        // 获取需要翻译的内容
        const {piecesToTranslate} = getPiecesToTranslate(node);
        
        if (piecesToTranslate.length > 0) {
            // 执行翻译
            await translateDynamically(piecesToTranslate);
            
            // 标记已翻译
            node.classList.add('translated-node');
        }
    }
}
```

## 3. 原文与译文切换

沉浸式翻译支持在原文和译文之间切换，这是通过 `showOriginal.js` 实现的：

```js
function showOriginal() {
    // 显示所有原文
    const translatedWrappers = document.querySelectorAll('.translated-wrapper');
    translatedWrappers.forEach(wrapper => {
        const originalText = wrapper.querySelector('.original-text');
        const translatedText = wrapper.querySelector('.translated-text');
        
        originalText.style.display = 'inline';
        translatedText.style.display = 'none';
    });
    
    // 更新页面状态
    chrome.runtime.sendMessage({
        action: "setPageLanguageState",
        pageLanguageState: "original"
    });
}

function showTranslated() {
    // 显示所有译文
    const translatedWrappers = document.querySelectorAll('.translated-wrapper');
    translatedWrappers.forEach(wrapper => {
        const originalText = wrapper.querySelector('.original-text');
        const translatedText = wrapper.querySelector('.translated-text');
        
        originalText.style.display = 'none';
        translatedText.style.display = 'inline';
    });
    
    // 更新页面状态
    chrome.runtime.sendMessage({
        action: "setPageLanguageState",
        pageLanguageState: "translated"
    });
}
```

## 4. 样式应用与增强

沉浸式翻译支持多种双语显示样式，如下划线、模糊效果等，这部分功能在 `enhance.js` 中实现：

```js
function applyStyle(translatedElem, originalElem, style) {
    // 应用不同的样式
    switch (style) {
        case 'underline':
            // 添加下划线样式
            originalElem.style.borderBottom = '1px dotted #999';
            break;
        case 'mask':
            // 添加模糊效果
            originalElem.style.filter = 'blur(3px)';
            originalElem.addEventListener('mouseenter', () => {
                originalElem.style.filter = 'none';
            });
            originalElem.addEventListener('mouseleave', () => {
                originalElem.style.filter = 'blur(3px)';
            });
            break;
        case 'paper':
            // 纸张样式
            translatedElem.style.backgroundColor = '#f5f5f5';
            translatedElem.style.padding = '0 2px';
            translatedElem.style.borderRadius = '2px';
            break;
        // 其他样式...
    }
}
```

## 5. 移动端适配

沉浸式翻译也针对移动端浏览器做了特殊处理，主要在 `popupMobile.js` 中实现：

```js
function createMobilePopup() {
    // 创建移动端弹窗
    const popupElem = document.createElement('div');
    popupElem.classList.add('immersive-translate-popup-mobile');
    
    // 添加控制按钮
    const translateBtn = document.createElement('button');
    translateBtn.textContent = '翻译';
    translateBtn.addEventListener('click', () => {
        translatePage();
        closePopup();
    });
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭';
    closeBtn.addEventListener('click', closePopup);
    
    popupElem.appendChild(translateBtn);
    popupElem.appendChild(closeBtn);
    
    // 添加到页面
    document.body.appendChild(popupElem);
    
    // 定位弹窗
    positionMobilePopup(popupElem);
}

function positionMobilePopup(popupElem) {
    // 根据设备方向定位弹窗
    if (window.innerHeight > window.innerWidth) {
        // 竖屏
        popupElem.style.bottom = '20px';
        popupElem.style.left = '50%';
        popupElem.style.transform = 'translateX(-50%)';
    } else {
        // 横屏
        popupElem.style.bottom = '20px';
        popupElem.style.right = '20px';
    }
}
```

## 6. 与背景脚本的通信

内容脚本通过 Chrome 扩展的消息机制与背景脚本通信：

```js
// 监听来自后台脚本的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "translatePage") {
        // 翻译整个页面
        translatePage();
        sendResponse({success: true});
    } else if (request.action === "restorePageToOriginal") {
        // 恢复原始页面
        showOriginal();
        sendResponse({success: true});
    } else if (request.action === "getCurrentPageLanguageState") {
        // 获取当前页面语言状态
        sendResponse(pageTranslatorState);
    } else if (request.action === "getOriginalTabLanguage") {
        // 获取原始标签页语言
        detectPageLanguage().then(language => {
            sendResponse(language);
        });
        return true;
    }
});

// 发送消息到后台脚本
function notifyBackgroundAboutLanguageChange(language) {
    chrome.runtime.sendMessage({
        action: "setDetectedLanguage",
        language: language
    });
}
```

## 7. 总结

沉浸式翻译插件的内容脚本实现了以下核心功能：

1. **精准内容识别**：通过DOM分析，确定哪些内容需要翻译
2. **特殊网站适配**：应用预定义的规则优化特定网站的翻译体验
3. **双语对照显示**：创建原文和译文的并排显示
4. **自定义样式应用**：支持多种显示样式，提升阅读体验
5. **动态内容处理**：使用MutationObserver监听DOM变化，处理动态加载的内容
6. **移动端支持**：针对移动设备的特殊适配

内容脚本的实现充分考虑了性能优化和用户体验，通过精细的DOM操作和事件处理，实现了流畅的翻译体验。同时，它与后台脚本保持良好的通信，实现了复杂功能的协作处理。 