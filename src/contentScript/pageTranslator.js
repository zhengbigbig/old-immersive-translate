"use strict";

/**
 * This mark cannot contain words, like <customskipword>12</customskipword>34
 *
 * Google will reorder as <customskipword>1234</customskipword>
 *
 * Under certain circumstances，Google broken the translation, returned startMark0 in some cases
 * */
// 这些标记不能包含单词，例如 <customskipword>12</customskipword>34
// Google会重新排序为 <customskipword>1234</customskipword>
// 在某些情况下，Google会破坏翻译，在某些情况下返回startMark0
const startMark = '@%';
const endMark = '#$';
const startMark0 = '@ %';
const endMark0 = '# $';

// 当前索引
let currentIndex;
// 压缩映射
let compressionMap;

/**
 *  Convert matching keywords to a string of special numbers to skip translation before sending to the translation engine.
 *
 *  For English words, ignore case when matching.
 *
 *  But for the word "app" , We don't want to "Happy" also matched.
 *
 *  So we match only isolated words, by checking the two characters before and after the keyword.
 *
 *  But this will also cause this method to not work for Chinese, Burmese and other languages without spaces.
 * */
// 在发送到翻译引擎之前，将匹配的关键词转换为特殊数字字符串以跳过翻译。
// 对于英文单词，匹配时忽略大小写。
// 但对于单词"app"，我们不希望"Happy"也被匹配。
// 因此，我们通过检查关键词前后的两个字符来仅匹配孤立的单词。
// 但这也会导致此方法对于没有空格的中文、缅甸语和其他语言不起作用。
function filterKeywordsInText(textContext) {
    let customDictionary = twpConfig.get("customDictionary")
    if (customDictionary.size > 0) {
        // reordering , we want to match the keyword "Spring Boot" first then the keyword "Spring"
        // 重新排序，我们希望先匹配关键词"Spring Boot"，然后再匹配关键词"Spring"
        customDictionary = new Map([...customDictionary.entries()].sort((a, b) => String(b[0]).length - String(a[0]).length))
        for (const keyWord of customDictionary.keys()) {
            while (true) {
                const index = textContext.toLowerCase().indexOf(keyWord)
                if (index === -1) {
                    break
                } else {
                    textContext = removeExtraDelimiter(textContext)
                    const previousIndex = index - 1
                    const nextIndex = index + keyWord.length
                    const previousChar = previousIndex === -1 ? '\n' : textContext.charAt(previousIndex)
                    const nextChar = nextIndex === textContext.length ? '\n' : textContext.charAt(nextIndex)
                    let placeholderText = ''
                    const keyWordWithCase = textContext.substring(index, index + keyWord.length)
                    if (isPunctuationOrDelimiter(previousChar) && isPunctuationOrDelimiter(nextChar)) {
                        // 如果关键词前后都是标点符号或分隔符，则使用标记包装关键词
                        placeholderText = startMark + handleHitKeywords(keyWordWithCase, true) + endMark
                    } else {
                        // 否则在每个字符之间添加特殊标记
                        placeholderText = '#n%o#'
                        for (const c of Array.from(keyWordWithCase)) {
                            placeholderText += c
                            placeholderText += '#n%o#'
                        }
                    }
                    const frontPart = textContext.substring(0, index)
                    const backPart = textContext.substring(index + keyWord.length)
                    textContext = frontPart + placeholderText + backPart
                }
            }
            textContext = textContext.replaceAll('#n%o#', '')
        }
    }
    return textContext
}

/**
 *  handle the keywords in translatedText, replace it if there is a custom replacement value.
 *
 *  When encountering Google Translate reordering, the original text contains our mark, etc. , we will catch these exceptions and call the text translation method to retranslate this section.
 *  */
// 处理翻译文本中的关键词，如果有自定义替换值则替换它。
// 当遇到Google翻译重新排序，原始文本包含我们的标记等情况时，我们会捕获这些异常并调用文本翻译方法重新翻译这部分内容。
async function handleCustomWords(translated, originalText, currentPageTranslatorService, currentTargetLanguage) {
    try {
        const customDictionary = twpConfig.get("customDictionary")
        if (customDictionary.size > 0) {
            translated = removeExtraDelimiter(translated)
            translated = translated.replaceAll(startMark0, startMark)
            translated = translated.replaceAll(endMark0, endMark)

            while (true) {
                const startIndex = translated.indexOf(startMark)
                const endIndex = translated.indexOf(endMark)
                if (startIndex === -1 && endIndex === -1) {
                    break
                } else {
                    const placeholderText = translated.substring(startIndex + startMark.length, endIndex)
                    // At this point placeholderText is actually currentIndex , the real value is in compressionMap
                    // 此时placeholderText实际上是currentIndex，真实值在compressionMap中
                    const keyWord = handleHitKeywords(placeholderText, false)
                    if (keyWord === "undefined") {
                        throw new Error("undefined")
                    }
                    let frontPart = translated.substring(0, startIndex)
                    let backPart = translated.substring(endIndex + endMark.length)
                    let customValue = customDictionary.get(keyWord.toLowerCase())
                    customValue = (customValue === '') ? keyWord : customValue
                    // Highlight custom words, make it have a space before and after it
                    // 高亮自定义词，在其前后添加空格
                    frontPart = isPunctuationOrDelimiter(frontPart.charAt(frontPart.length - 1)) ? frontPart : (frontPart + ' ')
                    backPart = isPunctuationOrDelimiter(backPart.charAt(0)) ? backPart : (' ' + backPart)
                    translated = frontPart + customValue + backPart
                }
            }
        }
    } catch (e) {
        return await backgroundTranslateSingleText(currentPageTranslatorService, currentTargetLanguage, originalText)
    }

    return translated
}

/**
 *
 * True : Store the keyword in the Map and return the index
 *
 * False : Extract keywords by index
 * */
// True：将关键词存储在Map中并返回索引
// False：通过索引提取关键词
function handleHitKeywords(value, mode) {
    if (mode) {
        if (currentIndex === undefined) {
            currentIndex = 1
            compressionMap = new Map()
            compressionMap.set(currentIndex, value)
        } else {
            compressionMap.set(++currentIndex, value)
        }
        return String(currentIndex)
    } else {
        return String(compressionMap.get(Number(value)))
    }
}

/**
 * any kind of punctuation character (including international e.g. Chinese and Spanish punctuation), and spaces, newlines
 *
 * source: https://github.com/slevithan/xregexp/blob/41f4cd3fc0a8540c3c71969a0f81d1f00e9056a9/src/addons/unicode/unicode-categories.js#L142
 *
 * note: XRegExp unicode output taken from http://jsbin.com/uFiNeDOn/3/edit?js,console (see chrome console.log), then converted back to JS escaped unicode here http://rishida.net/tools/conversion/, then tested on http://regexpal.com/
 *
 * suggested by: https://stackoverflow.com/a/7578937
 *
 * added: extra characters like "$", "\uFFE5" [yen symbol], "^", "+", "=" which are not consider punctuation in the XRegExp regex (they are currency or mathmatical characters)
 *
 * added: Chinese Punctuation: \u3002|\uff1f|\uff01|\uff0c|\u3001|\uff1b|\uff1a|\u201c|\u201d|\u2018|\u2019|\uff08|\uff09|\u300a|\u300b|\u3010|\u3011|\u007e
 *
 * added: special html space symbol: &nbsp; &ensp; &emsp; &thinsp; &zwnj; &zwj; -> \u00A0|\u2002|\u2003|\u2009|\u200C|\u200D
 * @see https://stackoverflow.com/a/21396529/19616126
 * */
// 任何类型的标点符号（包括国际标点符号，例如中文和西班牙语标点符号）以及空格、换行符
// 这个函数用于检测字符是否为标点符号或分隔符
function isPunctuationOrDelimiter(str) {
    if (typeof str !== "string") return false
    if (str === '\n' || str === ' ') return true
    const regex = /[\$\uFFE5\^\+=`~<>{}\[\]|\u00A0|\u2002|\u2003|\u2009|\u200C|\u200D|\u3002|\uff1f|\uff01|\uff0c|\u3001|\uff1b|\uff1a|\u201c|\u201d|\u2018|\u2019|\uff08|\uff09|\u300a|\u300b|\u3010|\u3011|\u007e!-#%-\x2A,-/:;\x3F@\x5B-\x5D_\x7B}\u00A1\u00A7\u00AB\u00B6\u00B7\u00BB\u00BF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u0AF0\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166D\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E3B\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]+/g;
    return regex.test(str)
}

/**
 * Remove useless newlines, spaces inside, which may affect our semantics
 * */
// 移除可能影响语义的无用换行符和多余空格
function removeExtraDelimiter(textContext) {
    textContext = textContext.replaceAll('\n', ' ')
    textContext = textContext.replace(/  +/g, ' ')
    return textContext
}


// 向后台发送请求翻译HTML内容
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

// 向后台发送请求翻译文本数组
function backgroundTranslateText(translationService, targetLanguage, sourceArray) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "translateText",
            translationService,
            targetLanguage,
            sourceArray
        }, response => {
            resolve(response)
        })
    })
}

// 向后台发送请求翻译单个文本
function backgroundTranslateSingleText(translationService, targetLanguage, source) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "translateSingleText",
            translationService,
            targetLanguage,
            source
        }, response => {
            resolve(response)
        })
    })
}

const pageTranslator = {}

function getTabHostName() {
    return new Promise(resolve => chrome.runtime.sendMessage({action: "getTabHostName"}, result => resolve(result)))
}

function getTabUrl() {
    return new Promise(resolve => chrome.runtime.sendMessage({action: "getTabUrl"}, result => resolve(result)))
}

Promise.all([twpConfig.onReady(), getTabUrl()])
.then(function (_) {
    // 1.1 获取页面基本信息
    const tabUrl = _[1];
    const tabUrlObj = new URL(tabUrl);
    const tabHostName = tabUrlObj.hostname;
    const tabUrlWithoutSearch = tabUrlObj.origin + tabUrlObj.pathname;

    // 1.2 创建上下文对象，用于在整个翻译过程中传递信息
    const ctx = {
      tabUrl,
      tabHostName,
      tabUrlWithoutSearch,
      twpConfig
    }

    // 1.3 定义HTML标签分类
    // 内联文本标签列表
    const htmlTagsInlineText = ['#text', 'A', 'ABBR', 'ACRONYM', 'B', 'BDO', 'BIG', 'CITE', 'DFN', 'EM', 'I', 'LABEL', 'Q', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'U', 'TT', 'VAR']
    // 需要忽略的内联标签
    const htmlTagsInlineIgnore = ['BR', 'CODE', 'KBD', 'WBR']
    // 不需要翻译的标签
    const htmlTagsNoTranslate = ['TITLE', 'SCRIPT', 'STYLE', 'TEXTAREA', 'SVG', 'svg']

    // 1.4 处理特殊规则配置
    const specialRulesConfigs = twpConfig.get('specialRules');
    if(Array.isArray(specialRulesConfigs) && specialRulesConfigs.length > 0){
      for(const specialRuleString of specialRulesConfigs){
        try{
          const specialRule = JSON.parse(specialRuleString);
          specialRules.unshift(specialRule);
        }catch(e){
          console.warn(`Error parsing special rule: ${specialRuleString}`)
        }
      }
    }

    if (twpConfig.get('translateTag_pre') !== 'yes') {
        htmlTagsInlineIgnore.push('PRE')
    }
    twpConfig.onChanged((name, newvalue) => {
        switch (name) {
            case "translateTag_pre":
                const index = htmlTagsInlineIgnore.indexOf('PRE')
                if (index !== -1) {
                    htmlTagsInlineIgnore.splice(index, 1)
                }
                if (newvalue !== 'yes') {
                    htmlTagsInlineIgnore.push('PRE')
                }
                break
        }
    })

    //TODO FOO
    twpConfig.set("targetLanguage", twpConfig.get("targetLanguages")[0])

    // 2. 状态管理变量初始化
    let piecesToTranslate = [] // 需要翻译的文本片段
    let originalTabLanguage = "und" // 原始标签语言
    let currentPageLanguage = "und" // 当前页面语言
    let pageLanguageState = "original" // 页面语言状态
    let currentTargetLanguage = twpConfig.get("targetLanguage") // 当前目标语言
    let currentPageTranslatorService = twpConfig.get("pageTranslatorService") // 当前翻译服务
    let dontSortResults = twpConfig.get("dontSortResults") == "yes" // 是否不排序结果
    let fooCount = 0 // 翻译状态追踪计数器

    let originalPageTitle

    let attributesToTranslate = []

    let translateNewNodesTimerHandler
    let newNodes = []
    let removedNodes = []

    let nodesToRestore = []

    // 4. 页面可见性管理
    let pageIsVisible = document.visibilityState == "visible"

    // 5. 核心功能函数定义
    // 5.1 动态节点翻译
    async function translateNewNodes() {
        try {
            for(const nn of newNodes) {
                if (removedNodes.indexOf(nn) != -1) continue;

                // let newPiecesToTranslate = getPiecesToTranslate(nn)
                const newPiecesToTranslate = (await getNodesThatNeedToTranslate(nn,ctx)).reduce((acc, node) => {
                  return acc.concat(getPiecesToTranslate(node))
                }, [])

                for (const i in newPiecesToTranslate) {
                    const newNodes = newPiecesToTranslate[i].nodes
                    let finded = false

                    for (const ntt of piecesToTranslate) {
                        if (ntt.nodes.some(n1 => newNodes.some(n2 => n1 === n2))) {
                            finded = true
                        }
                    }

                    if (!finded) {
                        piecesToTranslate.push(newPiecesToTranslate[i])
                    }
                }
            }
        } catch (e) {
            console.error(e)
        } finally {
            newNodes = []
            removedNodes = []
        }
    }

    // 5.2 DOM变化观察器
    const mutationObserver = new MutationObserver(function (mutations) {
        const piecesToTranslate = []

        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(addedNode => {
                if (htmlTagsNoTranslate.indexOf(addedNode.nodeName) == -1) {
                    if (htmlTagsInlineText.indexOf(addedNode.nodeName) == -1) {
                        if (htmlTagsInlineIgnore.indexOf(addedNode.nodeName) == -1) {
                            piecesToTranslate.push(addedNode)
                        }
                    }
                }
            })

            mutation.removedNodes.forEach(removedNode => {
                removedNodes.push(removedNode)
            })
        })

        piecesToTranslate.forEach(ptt => {
            if (newNodes.indexOf(ptt) == -1) {
                newNodes.push(ptt)
            }
        })
    })

    function enableMutatinObserver() {
        disableMutatinObserver()

        if (twpConfig.get("translateDynamicallyCreatedContent") == "yes") {
            translateNewNodesTimerHandler = setInterval(translateNewNodes, 2000)
            mutationObserver.observe(document.body, {
                childList: true,
                subtree: true
            })
        }
    }

    function disableMutatinObserver() {
        clearInterval(translateNewNodesTimerHandler)
        newNodes = []
        removedNodes = []
        mutationObserver.disconnect()
        mutationObserver.takeRecords()
    }

    // 6. 消息处理和事件监听
    // 6.1 监听来自后台的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        // 处理各种类型的消息请求
        if (request.action === "translatePage") {
            // 翻译页面请求
            if (request.targetLanguage === "original") {
                // 如果目标语言是"original"，则恢复页面
                pageTranslator.restorePage()
            } else {
                // 否则翻译页面为目标语言
                pageTranslator.translatePage(request.targetLanguage)
            }
        } else if (request.action === "restorePage") {
            // 恢复页面请求
            pageTranslator.restorePage()
        } else if (request.action === "getOriginalTabLanguage") {
            // 获取原始标签语言请求
            pageTranslator.onGetOriginalTabLanguage(function () {
                sendResponse(originalTabLanguage)
            })
            return true
        } else if (request.action === "getCurrentPageLanguage") {
            // 获取当前页面语言请求
            sendResponse(currentPageLanguage)
        } else if (request.action === "getCurrentPageLanguageState") {
            // 获取当前页面语言状态请求
            sendResponse(pageLanguageState)
        } else if (request.action === "getCurrentPageTranslatorService") {
            // 获取当前使用的翻译服务提供商请求
            sendResponse(currentPageTranslatorService)
        } else if (request.action === "swapTranslationService") {
            // 切换翻译服务提供商请求
            pageTranslator.swapTranslationService()
        } else if (request.action === "toggle-translation") {
            // 切换翻译状态请求
            if (pageLanguageState === "translated") {
                pageTranslator.restorePage()
            } else {
                pageTranslator.translatePage()
            }
        } else if (request.action === "autoTranslateBecauseClickedALink") {
            // 因点击链接自动翻译请求
            if (twpConfig.get("autoTranslateWhenClickingALink") === "yes") {
                pageTranslator.onGetOriginalTabLanguage(function () {
                    // 如果页面是原始状态，原始语言不是目标语言，且原始语言不在不翻译语言列表中，则翻译页面
                    if (pageLanguageState === "original" && originalTabLanguage !== currentTargetLanguage && twpConfig.get("neverTranslateLangs").indexOf(originalTabLanguage) === -1) {
                        pageTranslator.translatePage()
                    }
                })
            }
        }
    })

    // 6.2 页面可见性变化处理
    const handleVisibilityChange = function () {
        if (document.visibilityState == "visible") {
            pageIsVisible = true
        } else {
            pageIsVisible = false
        }

        if (pageIsVisible && pageLanguageState === "translated") {
            enableMutatinObserver()
        } else {
            disableMutatinObserver()
        }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange, false)

    function getPiecesToTranslate(root = document.body) {
        const piecesToTranslate = [{
            isTranslated: false,
            parentElement: null,
            topElement: null,
            bottomElement: null,
            nodes: []
        }]
        let index = 0
        let currentParagraphSize = 0

        const getAllNodes = function (node, lastHTMLElement = null, lastSelectOrDataListElement = null) {
            if (node.nodeType == 1 || node.nodeType == 11) {
                if (node.nodeType == 11) {
                    lastHTMLElement = node.host
                    lastSelectOrDataListElement = null
                } else if (node.nodeType == 1) {
                    lastHTMLElement = node
                    if (node.nodeName === "SELECT" || node.nodeName === "DATALIST") lastSelectOrDataListElement = node;

                    if (htmlTagsInlineIgnore.indexOf(node.nodeName) !== -1 ||
                        htmlTagsNoTranslate.indexOf(node.nodeName) !== -1 ||
                        node.classList.contains("notranslate") ||
                        node.getAttribute("translate") === "no" ||
                        node.isContentEditable) {
                        if (piecesToTranslate[index].nodes.length > 0) {
                            currentParagraphSize = 0
                            piecesToTranslate[index].bottomElement = lastHTMLElement
                            piecesToTranslate.push({
                                isTranslated: false,
                                parentElement: null,
                                topElement: null,
                                bottomElement: null,
                                nodes: []
                            })
                            index++
                        }
                        return
                    }
                }

                function getAllChilds(childNodes) {
                    Array.from(childNodes).forEach(_node => {
                        if (_node.nodeType == 1) {
                            lastHTMLElement = _node
                            if (_node.nodeName === "SELECT" || _node.nodeName === "DATALIST") lastSelectOrDataListElement = _node;
                        }

                        if (htmlTagsInlineText.indexOf(_node.nodeName) == -1) {
                            if (piecesToTranslate[index].nodes.length > 0) {
                                currentParagraphSize = 0
                                piecesToTranslate[index].bottomElement = lastHTMLElement
                                piecesToTranslate.push({
                                    isTranslated: false,
                                    parentElement: null,
                                    topElement: null,
                                    bottomElement: null,
                                    nodes: []
                                })
                                index++

                            }

                            getAllNodes(_node, lastHTMLElement, lastSelectOrDataListElement)

                            if (piecesToTranslate[index].nodes.length > 0) {
                                currentParagraphSize = 0
                                piecesToTranslate[index].bottomElement = lastHTMLElement
                                piecesToTranslate.push({
                                    isTranslated: false,
                                    parentElement: null,
                                    topElement: null,
                                    bottomElement: null,
                                    nodes: []
                                })
                                index++
                            }
                        } else {
                            getAllNodes(_node, lastHTMLElement, lastSelectOrDataListElement)
                        }
                    })
                }

                getAllChilds(node.childNodes)
                if (!piecesToTranslate[index].bottomElement) {
                    piecesToTranslate[index].bottomElement = node
                }
                if (node.shadowRoot) {
                    getAllChilds(node.shadowRoot.childNodes)
                    if (!piecesToTranslate[index].bottomElement) {
                        piecesToTranslate[index].bottomElement = node
                    }
                }
            } else if (node.nodeType == 3) {
                if (node.textContent.trim().length > 0) {
                    if (!piecesToTranslate[index].parentElement) {
                        if (node && node.parentNode && node.parentNode.nodeName === "OPTION" && lastSelectOrDataListElement) {
                            piecesToTranslate[index].parentElement = lastSelectOrDataListElement
                            piecesToTranslate[index].bottomElement = lastSelectOrDataListElement
                            piecesToTranslate[index].topElement = lastSelectOrDataListElement
                        } else {
                            let temp = node.parentNode
                            while (temp && temp != root && (htmlTagsInlineText.indexOf(temp.nodeName) != -1 || htmlTagsInlineIgnore.indexOf(temp.nodeName) != -1)) {
                                temp = temp.parentNode
                            }
                            if (temp && temp.nodeType === 11) {
                                temp = temp.host
                            }
                            piecesToTranslate[index].parentElement = temp
                        }
                    }
                    if (!piecesToTranslate[index].topElement) {
                        piecesToTranslate[index].topElement = lastHTMLElement
                    }
                    if (currentParagraphSize > 1000) {
                        currentParagraphSize = 0
                        piecesToTranslate[index].bottomElement = lastHTMLElement
                        const pieceInfo = {
                            isTranslated: false,
                            parentElement: null,
                            topElement: lastHTMLElement,
                            bottomElement: null,
                            nodes: []
                        }
                        pieceInfo.parentElement = piecesToTranslate[index].parentElement
                        piecesToTranslate.push(pieceInfo)
                        index++
                    }
                    currentParagraphSize += node.textContent.length
                    piecesToTranslate[index].nodes.push(node)
                    piecesToTranslate[index].bottomElement = null
                }
            }
        }
        getAllNodes(root)

        if (piecesToTranslate.length > 0 && piecesToTranslate[piecesToTranslate.length - 1].nodes.length == 0) {
            piecesToTranslate.pop()
        }

        return piecesToTranslate
    }

    function getAttributesToTranslate(root = document.body) {
        const attributesToTranslate = []

        const placeholdersElements = root.querySelectorAll('input[placeholder], textarea[placeholder]')
        const altElements = root.querySelectorAll('area[alt], img[alt], input[type="image"][alt]')
        // const valueElements = root.querySelectorAll('input[type="button"], input[type="submit"], input[type="reset"]')
        const valueElements = [];
        const titleElements = root.querySelectorAll("body [title]")

        function hasNoTranslate(elem) {
            if (elem && (elem.classList.contains("notranslate") || elem.getAttribute("translate") === "no")) {
                return true
            }
        }

        placeholdersElements.forEach(e => {
            if (hasNoTranslate(e)) return;

            const txt = e.getAttribute("placeholder")
            if (txt && txt.trim()) {
                attributesToTranslate.push({
                    node: e,
                    original: txt,
                    attrName: "placeholder"
                })
            }
        })

        altElements.forEach(e => {
            if (hasNoTranslate(e)) return;

            const txt = e.getAttribute("alt")
            if (txt && txt.trim()) {
                attributesToTranslate.push({
                    node: e,
                    original: txt,
                    attrName: "alt"
                })
            }
        })

        valueElements.forEach(e => {
            if (hasNoTranslate(e)) return;

            const txt = e.getAttribute("value")
            if (e.type == "submit" && !txt) {
                attributesToTranslate.push({
                    node: e,
                    original: "Submit Query",
                    attrName: "value"
                })
            } else if (e.type == "reset" && !txt) {
                attributesToTranslate.push({
                    node: e,
                    original: "Reset",
                    attrName: "value"
                })
            } else if (txt && txt.trim()) {
                attributesToTranslate.push({
                    node: e,
                    original: txt,
                    attrName: "value"
                })
            }
        })

        titleElements.forEach(e => {
            if (hasNoTranslate(e)) return;

            const txt = e.getAttribute("title")
            if (txt && txt.trim()) {
                attributesToTranslate.push({
                    node: e,
                    original: txt,
                    attrName: "title"
                })
            }
        })

        return attributesToTranslate
    }

    function encapsulateTextNode(node,ctx) {
        const pageSpecialConfig = getPageSpecialConfig(ctx);
        const isShowDualLanguage = twpConfig.get("isShowDualLanguage")==='no'?false:true;


        const fontNode = document.createElement("font")
        let style = 'vertical-align: inherit;'
        if (isShowDualLanguage && (!pageSpecialConfig || pageSpecialConfig.style!=="none")) {
          const customDualStyle = twpConfig.get("customDualStyle");
          let dualStyle = customDualStyle || twpConfig.get("dualStyle") || 'underline';
          if(pageSpecialConfig && pageSpecialConfig.style){
            dualStyle = pageSpecialConfig.style;
          }
          if(dualStyle==='underline'){
            style+='border-bottom: 2px solid #72ECE9;'
          }else if(dualStyle==='none'){
            // ignore
          }else if(dualStyle==="highlight"){
            style+='background-color: #EAD0B3;padding: 3px 0;'
          }else if(dualStyle==="weakening"){
            style+='opacity: 0.4;'
          }else if(dualStyle==="maskxxxxxxxx"){
            style+="filter: blur(5px);transition: filter 0.5s ease;"
            // add class immersive-translate-mask
            fontNode.classList.add("immersive-translate-mask")
          }else if(dualStyle){
            style+=dualStyle;
          }
        }
        fontNode.setAttribute("style", style)
        // fontNode.setAttribute("_mstmutation", "1")
        // add class name
        fontNode.textContent = node.textContent

        node.replaceWith(fontNode)

        return fontNode
    }

    async function translateResults(piecesToTranslateNow, results,ctx) {
        if (dontSortResults) {
            for (let i = 0; i < results.length; i++) {
                for (let j = 0; j < results[i].length; j++) {
                    if (piecesToTranslateNow[i].nodes[j]) {
                        const nodes = piecesToTranslateNow[i].nodes
                        let translated = results[i][j] + " "
                        // In some case, results items count is over original node count
                        // Rest results append to last node
                        if (piecesToTranslateNow[i].nodes.length - 1 === j && results[i].length > j) {
                            const restResults = results[i].slice(j + 1);
                            translated += restResults.join(" ");
                        }

                        nodes[j] = encapsulateTextNode(nodes[j],ctx)

                        nodesToRestore.push({
                            node: nodes[j],
                            original: nodes[j].textContent
                        })

                       const result = await handleCustomWords(translated, nodes[j].textContent, currentPageTranslatorService, currentTargetLanguage);
                            nodes[j].textContent = result
                    }
                }
            }
        } else {
            for (const i in piecesToTranslateNow) {
                for (const j in piecesToTranslateNow[i].nodes) {
                    if (results[i][j]) {
                        const nodes = piecesToTranslateNow[i].nodes
                        const translated = results[i][j] + " "

                        nodes[j] = encapsulateTextNode(nodes[j],ctx)

                        nodesToRestore.push({
                            node: nodes[j],
                            original: nodes[j].textContent
                        })

                      const result =  await handleCustomWords(translated, nodes[j].textContent, currentPageTranslatorService, currentTargetLanguage);
                      nodes[j].textContent = result

                    }
                }
            }
        }
        mutationObserver.takeRecords()
    }

    function translateAttributes(attributesToTranslateNow, results) {
        for (const i in attributesToTranslateNow) {
            const ati = attributesToTranslateNow[i]
            ati.node.setAttribute(ati.attrName, results[i])
        }
    }

    async function translateDynamically() {
        try {
            if (piecesToTranslate && pageIsVisible) {
                ;
                await (async function () {
                    function isInScreen(element) {
                        const rect = element.getBoundingClientRect()
                        if ((rect.top > 0 && rect.top <= window.innerHeight) || (rect.bottom > 0 && rect.bottom <= window.innerHeight)) {
                            return true
                        }
                        return false
                    }

                    function topIsInScreen(element) {
                        if (!element) {
                            // debugger;
                            return false
                        }
                        const rect = element.getBoundingClientRect()
                        if (rect.top > 0 && rect.top <= window.innerHeight) {
                            return true
                        }
                        return false
                    }

                    function bottomIsInScreen(element) {
                        if (!element) {
                            // debugger;
                            return false
                        }
                        const rect = element.getBoundingClientRect()
                        if (rect.bottom > 0 && rect.bottom <= window.innerHeight) {
                            return true
                        }
                        return false
                    }


                    const currentFooCount = fooCount

                    const piecesToTranslateNow = []
                    piecesToTranslate.forEach(ptt => {
                        if (!ptt.isTranslated) {

                            if (bottomIsInScreen(ptt.topElement) || topIsInScreen(ptt.bottomElement)) {
                                ptt.isTranslated = true
                                piecesToTranslateNow.push(ptt)
                            }
                        }
                    })

                    const attributesToTranslateNow = []
                    attributesToTranslate.forEach(ati => {
                        if (!ati.isTranslated) {
                            if (isInScreen(ati.node)) {
                                ati.isTranslated = true
                                attributesToTranslateNow.push(ati)
                            }
                        }
                    })

                    if (piecesToTranslateNow.length > 0) {
                        const results = await backgroundTranslateHTML(
                                currentPageTranslatorService,
                                currentTargetLanguage,
                                piecesToTranslateNow.map(ptt => ptt.nodes.map(node => filterKeywordsInText(node.textContent))),
                                dontSortResults
                            )
                            if (pageLanguageState === "translated" && currentFooCount === fooCount) {
                                 await translateResults(piecesToTranslateNow, results,ctx)
                            }
                    }

                    if (attributesToTranslateNow.length > 0) {
                        backgroundTranslateText(
                                currentPageTranslatorService,
                                currentTargetLanguage,
                                attributesToTranslateNow.map(ati => ati.original)
                            )
                            .then(results => {
                                if (pageLanguageState === "translated" && currentFooCount === fooCount) {
                                    translateAttributes(attributesToTranslateNow, results)
                                }
                            })
                    }
                })()
            }
        } catch (e) {
            console.error(e)
        }
        setTimeout(translateDynamically, 600)
    }

    translateDynamically()


    // 翻译页面的主函数
    pageTranslator.translatePage = async function (targetLanguage) {
        // 增加计数器，用于追踪翻译状态的变化
        fooCount++
        // 首先恢复页面到原始状态
        pageTranslator.restorePage()

        // 获取是否要排序翻译结果的配置
        dontSortResults = twpConfig.get("dontSortResults") == "yes" ? true : false

        // 如果指定了目标语言，则更新当前目标语言
        if (targetLanguage) {
            currentTargetLanguage = targetLanguage
        }

        try {
            // 获取需要翻译的节点，并从中提取需要翻译的文本片段
            piecesToTranslate = (await getNodesThatNeedToTranslate(document.body, ctx)).reduce((acc, node) => {
                return acc.concat(getPiecesToTranslate(node))
            }, [])
        } catch(e) {
            console.error('获取需要翻译的片段失败', e)
            throw e;
        }

        // 获取需要翻译的属性（如placeholder, alt, title等）
        attributesToTranslate = getAttributesToTranslate()

        // 更新页面语言状态为"已翻译"
        pageLanguageState = "translated"
        // 通知后台页面语言状态已更改
        chrome.runtime.sendMessage({
            action: "setPageLanguageState",
            pageLanguageState
        })
        // 更新当前页面语言为目标语言
        currentPageLanguage = currentTargetLanguage

        // 启用DOM变化监视器，用于检测动态添加的内容
        enableMutatinObserver()

        // 开始动态翻译页面
        translateDynamically()
    }

    // 恢复页面到原始状态的函数
    pageTranslator.restorePage = function () {
        // 增加计数器，用于追踪翻译状态的变化
        fooCount++
        // 清空需要翻译的文本片段
        piecesToTranslate = []

        // 禁用DOM变化监视器
        disableMutatinObserver()

        // 更新页面语言状态为"原始"
        pageLanguageState = "original"
        // 通知后台页面语言状态已更改
        chrome.runtime.sendMessage({
            action: "setPageLanguageState",
            pageLanguageState
        })
        // 恢复当前页面语言为原始标签语言
        currentPageLanguage = originalTabLanguage

        // 恢复原始页面标题
        if (originalPageTitle) {
            document.title = originalPageTitle
        }
        originalPageTitle = null

        // 移除复制的节点（用于双语显示）
        removeCopyiedNodes();

        // 恢复所有被翻译过的节点
        for (const ntr of nodesToRestore) {
            ntr.node.replaceWith(ntr.original)
        }
        nodesToRestore = []

        // 恢复所有被翻译过的属性
        for (const ati of attributesToTranslate) {
            if (ati.isTranslated) {
                ati.node.setAttribute(ati.attrName, ati.original)
            }
        }
        attributesToTranslate = []
    }

    // 切换翻译服务提供商
    pageTranslator.swapTranslationService = function () {
        // 在Google和Yandex之间切换
        if (currentPageTranslatorService === "google") {
            currentPageTranslatorService = "yandex"
        } else {
            currentPageTranslatorService = "google"
        }
        // 如果页面当前已翻译，则使用新的翻译服务重新翻译
        if (pageLanguageState === "translated") {
            pageTranslator.translatePage()
        }
    }

    // 记录是否已获取原始标签语言
    let alreadyGotTheLanguage = false
    // 存储获取原始标签语言的观察者
    const observers = []

    // 注册获取原始标签语言的回调函数
    pageTranslator.onGetOriginalTabLanguage = function (callback) {
        if (alreadyGotTheLanguage) {
            // 如果已经获取到语言，直接调用回调
            callback(originalTabLanguage)
        } else {
            // 否则将回调添加到观察者列表
            observers.push(callback)
        }
    }

    // 7. 初始化流程
    // 7.1 主框架初始化
    if (window.self === window.top) {
        const onTabVisible = function () {
            chrome.runtime.sendMessage({
                action: "detectTabLanguage"
            }, async result => {
                // 如果语言未检测到或为"und"，则手动检测
                if (result === 'und' || !result) {
                    result = await detectPageLanguage()
                }
                result = result || "und"

                // 如果结果仍为"und"
                if (result === "und") {
                    originalTabLanguage = result
                }

                // 如果当前网站在"总是翻译的网站"列表中，则翻译页面
                if (twpConfig.get("alwaysTranslateSites").indexOf(tabHostName) !== -1) {
                    pageTranslator.translatePage()
                } else if (result !== 'und') {
                    // 修正语言代码
                    const langCode = twpLang.fixTLanguageCode(result)
                    if (langCode) {
                        originalTabLanguage = langCode
                    }

                    // 特定情况下的自动翻译逻辑
                    if (location.hostname === "translatewebpages.org" && location.href.indexOf("?autotranslate") !== -1 && twpConfig.get("neverTranslateSites").indexOf(tabHostName) === -1) {
                        pageTranslator.translatePage()
                    } else {
                        // 避免在翻译网站上进行翻译
                        if (location.hostname !== "translate.googleusercontent.com" && location.hostname !== "translate.google.com" && location.hostname !== "translate.yandex.com") {
                            // 如果页面是原始状态且不在隐私浏览模式下
                            if (pageLanguageState === "original" && !chrome.extension.inIncognitoContext) {
                                // 如果当前网站不在"永不翻译的网站"列表中
                                if (twpConfig.get("neverTranslateSites").indexOf(tabHostName) === -1) {
                                    // 如果语言代码有效，且不是目标语言，且在"总是翻译的语言"列表中，则翻译页面
                                    if (langCode && langCode !== currentTargetLanguage && twpConfig.get("alwaysTranslateLangs").indexOf(langCode) !== -1) {
                                        pageTranslator.translatePage()
                                    }
                                }
                            }
                        }
                    }
                }

                // 通知所有观察者原始标签语言
                observers.forEach(callback => callback(originalTabLanguage))
                alreadyGotTheLanguage = true
            })
        }

        // 延迟120ms执行初始化
        setTimeout(function () {
            if (document.visibilityState == "visible") {
                onTabVisible()
            } else {
                // 如果页面不可见，则添加可见性变化监听器
                const handleVisibilityChange = function () {
                    if (document.visibilityState == "visible") {
                        document.removeEventListener("visibilitychange", handleVisibilityChange)
                        onTabVisible()
                    }
                }
                document.addEventListener("visibilitychange", handleVisibilityChange, false)
            }
        }, 120)
    } else {
        // 7.2 iframe框架初始化
        // 获取主框架的标签语言
        chrome.runtime.sendMessage({
            action: "getMainFrameTabLanguage"
        }, result => {
            originalTabLanguage = result || "und"
            observers.forEach(callback => callback(originalTabLanguage))
            alreadyGotTheLanguage = true
        })

        // 获取主框架的页面语言状态
        chrome.runtime.sendMessage({
            action: "getMainFramePageLanguageState"
        }, result => {
            // 如果主框架已翻译但当前框架未翻译，则翻译当前框架
            if (result === "translated" && pageLanguageState === "original") {
                pageTranslator.translatePage()
            }
        })
    }
})

// 检测页面语言的辅助函数
function detectPageLanguage() {
  return new Promise((resolve, reject) => {
    // 首先尝试从HTML元素的lang属性获取
    if (document.documentElement && document.documentElement.lang) {
      resolve(document.documentElement.lang)
    } else {
      // 如果无法从HTML元素获取，则使用语言检测API
      if (document.body && document.body.innerText) {
        chrome.runtime.sendMessage({
            action: "detectLanguage",
            text: document.body.innerText
        }, response => {
            resolve(response)
        })
      } else {
        // 如果没有文本内容，则无法检测
        resolve(undefined)
      }
    }
  })
}
