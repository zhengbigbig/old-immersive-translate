// 翻译标记属性名，用于标记已经被处理过的节点
const enhanceMarkAttributeName = "data-translationmark";

// 原始显示值属性名，用于存储节点原始的display属性值，以便恢复时使用
const enhanceOriginalDisplayValueAttributeName = "data-translationoriginaldisplay";
// 行内忽略的HTML标签，这些标签通常不包含需要翻译的大段文本
const enhanceHtmlTagsInlineIgnore = ['BR', 'CODE', 'KBD', 'WBR'] // and input if type is submit or button, and pre depending on settings
// 不翻译的HTML标签，这些标签的内容不应该被翻译
const enhanceHtmlTagsNoTranslate = ['TITLE', 'SCRIPT', 'STYLE', 'TEXTAREA', 'SVG', 'svg'] //TODO verificar porque 'svg' é com letras minúsculas
// 块级元素标签，这些标签通常包含独立的文本块，适合作为翻译的基本单位
let blockElements = [
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6','TABLE',  'OL', 'P','LI'
  ];
// 根据配置决定是否将PRE标签添加到块级元素列表中
if (twpConfig.get('translateTag_pre') !== 'yes') {
    blockElements.push('PRE')
}

// 标题元素，特殊处理，因为标题通常比较短且重要
const headingElements = ['h1' ];

// PDF选择器配置，用于识别PDF预览页面等特殊情况
const pdfSelectorsConfig =   {
    regex:
      "translatewebpages.org/result/.+$"
};

// 内联元素列表，用于判断节点是否为内联元素
const inlineElements = [
  "a",
  "abbr",
  "acronym",
  "b",
  "bdo",
  "big",
  "br",
  "button",
  "cite",
  "code",
  "dfn",
  "em",
  "i",
  "img",
  "input",
  "kbd",
  "label",
  "map",
  "object",
  "output",
  "q",
  "samp",
  "script",
  "select",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "textarea",
  "time",
  "tt",
  "var",
];


// 为节点添加包装器函数
function addWrapperToNode(node, wrapper){
  try{
    const parent = node.parentNode;
    // 使用包装器替换元素（作为子元素）
    parent.replaceChild(wrapper, node);
    // 将原始元素设置为包装器的子元素
    wrapper.appendChild(node);
  }catch(e){
    console.error('add wrapper error',e);
  }
}

// 获取页面特殊配置函数
function getPageSpecialConfig(ctx){
  const currentUrl = ctx.tabUrl;
  const currentUrlObj = new URL(currentUrl);
  const currentHostname = currentUrlObj.hostname;
  const currentUrlWithoutSearch = currentUrlObj.origin + currentUrlObj.pathname;

  let specialConfig = null;

  // 遍历特殊规则列表，查找匹配的规则
  for(const enhance of specialRules){
    // 通过主机名匹配
    if(enhance.hostname){
      if(!Array.isArray(enhance.hostname)){
        enhance.hostname = [enhance.hostname];
      }
      if(enhance.hostname.indexOf(currentHostname) !== -1){
        return enhance;
      }
    }
    // 通过正则表达式匹配
    if(enhance.regex){
      if(!Array.isArray(enhance.regex)){
        enhance.regex = [enhance.regex];
      }
      const isMatched = false;
      for(const regex of enhance.regex){
        const reg = new RegExp(regex);
        if(reg.test(currentUrlWithoutSearch)){
            return enhance;
        }
      }
    }
  }

  // 处理nitter，由于域名太多，通过元数据和元素检测
  // 如果og:sitename是"Nitter"，并且存在class为tweet-content的元素，则判定为nitter
  const nitterMeta = document.querySelector('meta[property="og:site_name"]');
  if(nitterMeta && nitterMeta.getAttribute('content') === 'Nitter'){
    const nitterTweetContent = document.querySelector('.tweet-content');
    if(nitterTweetContent){
      specialConfig =  {
        name:"nitter",
        selectors:['.tweet-content','.quote-text']
      }
    }
  }

  // 处理mastodon
  const mastodonId = document.querySelector('div#mastodon');
  const mastonText = document.querySelector('div.status__content__text');
  if(mastodonId){
    specialConfig =  {
      name:"mastodon",
      containerSelectors:'div.status__content__text',
      detectLanguage:true
    }
  }
  return specialConfig
}

// 判断节点是否有效（是否需要翻译）函数
function isValidNode(node){
  // 检查节点是否已经被标记为翻译
  if(node.hasAttribute && node.hasAttribute(enhanceMarkAttributeName)){
    return false;
  }
  // 检查节点是否在忽略列表或不翻译列表中，或者有其他禁止翻译的标记
  if(enhanceHtmlTagsInlineIgnore.indexOf(node.nodeName) !== -1 ||
  enhanceHtmlTagsNoTranslate.indexOf(node.nodeName) !== -1 ||
  node.classList.contains("notranslate") ||
  node.getAttribute("translate") === "no" ||
  node.isContentEditable) {
    return false
  }

  // 检查父节点是否有翻译标记
  if(node.parentNode && node.parentNode.hasAttribute && node.parentNode.hasAttribute(enhanceMarkAttributeName)){
    return false;
  }
  // 检查祖先元素是否有copiedNode标记
  if(node.closest && node.closest(`[${enhanceMarkAttributeName}=copiedNode]`)){
    return false;
  }
  // 检查是否为特殊的图片段落节点
  if(node.nodeName==="P"){
    // 检查所有子节点
    const children = node.childNodes;
    const isIncludeImg = node.querySelector('img');
    if(isIncludeImg && node.childNodes.length<3){
      // 将其视为图片节点
      // 检查长度
      const innerText = node.innerText;
      if(innerText.length<80){
        return false;
      }else{
        return true;
      }
    }
  }
  // 检查是否有notranslate类
  return true;
}

// 显示所有复制的节点（用于双语显示）函数
function showCopyiedNodes(){
  const copiedNodes = document.querySelectorAll(`[${enhanceMarkAttributeName}="copiedNode"]`);
  for(const node of copiedNodes){
    // @ts-ignore: its ok
    if(node && node.style && node.style.display === "none"){
       // 删除display属性，恢复原始显示
      const originalDisplay = node.getAttribute(enhanceOriginalDisplayValueAttributeName);
      if(originalDisplay){
        // @ts-ignore: its ok
        node.style.display = originalDisplay;
      } else {
        // 删除display属性
        // @ts-ignore: its ok
        node.style.removeProperty("display");
      }
    }
  }
}

// 移除所有复制的节点函数
function removeCopyiedNodes(){
  const copiedNodes = document.querySelectorAll(`[${enhanceMarkAttributeName}="copiedNode"]`);
  for(const node of copiedNodes){
    node.remove()
  }
}

// 判断是否为body元素
function isBody(el) {
  return document.body === el;
}

// 判断子元素是否已经存在于数组中的某个元素的子孙节点中
function isDuplicatedChild(array,child){
  for(const item of array){
    if(item.contains(child)){
      return true;
    }
  }
  return false;
}

// 获取需要翻译的节点列表函数
async function getNodesThatNeedToTranslate(root,ctx,options){
  options = options || {};
  const pageSpecialConfig = getPageSpecialConfig(ctx);
  const twpConfig = ctx.twpConfig
  const neverTranslateLangs = twpConfig.get('neverTranslateLangs');
  const isShowDualLanguage = twpConfig.get("isShowDualLanguage")==='no'?false:true;
  const allBlocksSelectors = pageSpecialConfig && pageSpecialConfig.selectors || []
  const noTranslateSelectors = pageSpecialConfig && pageSpecialConfig.noTranslateSelectors || []
  if(noTranslateSelectors.length > 0){
    const noTranslateNodes = root.querySelectorAll(noTranslateSelectors.join(","));
    for(const node of noTranslateNodes){
      // add class notranslate
      // node.classList.add("notranslate");
      // add parent placeholder for position
      const placeholder = document.createElement("span");
      placeholder.classList.add("notranslate");
      addWrapperToNode(node,placeholder);
    }
  }

  // all block nodes, nodes should have a order from top to bottom
  let allNodes = [];

  const currentUrl = ctx.tabUrl;
  const currentUrlObj = new URL(currentUrl);
  const currentUrlWithoutSearch = currentUrlObj.origin + currentUrlObj.pathname;
  const currentHostname = currentUrlObj.hostname;
  const currentTargetLanguage = twpConfig.get("targetLanguage")

  // special for mail.google.com, cause there are too many table, we should remove table
  if(pageSpecialConfig && pageSpecialConfig.blockElements){
    blockElements = pageSpecialConfig.blockElements;
  }
  let isIframeContainer = false;
  // check sites
  if(allBlocksSelectors.length>0){
    // check id iframe
    if(pageSpecialConfig && pageSpecialConfig.iframeContainer){
      const iframeContainer = root.querySelector(pageSpecialConfig.iframeContainer);
      if(iframeContainer){
        root = iframeContainer.contentDocument;
        isIframeContainer = true;
      }
    }
    for(const selector of allBlocksSelectors){
      if(root && root.querySelectorAll){
        const nodes = root.querySelectorAll(selector);
        for(const node of nodes){
          // 对于twitter等网站，检查节点语言是否与目标语言或永不翻译语言一致，如果是则跳过翻译
          if(currentHostname==="twitter.com" || currentHostname==="twitterdesk.twitter.com" || currentHostname==="mobile.twitter.com"){
            // check language
            try{
              const lang = node.getAttribute("lang");
              if(lang && checkIsSameLanguage(lang,[currentTargetLanguage,...neverTranslateLangs],ctx)){
                continue;
              }
            }catch(e){
              // ignore
              // console.log("e", e)
            }
          }

          // 检查节点是否有效且未重复
          if(isValidNode(node) && !isDuplicatedChild(allNodes,node)){
            allNodes.push(node);
          }
        }
      }
    }
  }

  // 如果不是iframe容器或有容器选择器或没有块级选择器
  if(!isIframeContainer && ((pageSpecialConfig && pageSpecialConfig.containerSelectors) || allBlocksSelectors.length === 0)){
    const originalRoot = root;
    const contentContainers = getContainers(root,pageSpecialConfig);
    let containers = []
    if(pageSpecialConfig && pageSpecialConfig.containerSelectors){
      if(!Array.isArray(pageSpecialConfig.containerSelectors)){
        pageSpecialConfig.containerSelectors = [pageSpecialConfig.containerSelectors];
      }
      // check length
      if(pageSpecialConfig.containerSelectors.length ===0){
        containers = [root]
      }
    }
    if(contentContainers && Array.isArray(contentContainers)){
      containers = contentContainers;
    }
    // 遍历容器和块级标签，查找需要翻译的段落
    for(const root of containers){
      for(const blockTag of blockElements){
        const paragraphs = root.querySelectorAll(blockTag.toLowerCase());
        for (const paragraph of paragraphs) {
          if(isValidNode(paragraph) && !isDuplicatedChild(allNodes,paragraph)){
            allNodes.push(paragraph);
          }
        }
      }
      // 如果没有指定容器选择器，则添加额外的标题节点
      if(!pageSpecialConfig || !pageSpecialConfig.containerSelectors){
       // add addition heading nodes
        for(const headingTag of headingElements){
          const headings = originalRoot.querySelectorAll(headingTag.toLowerCase());
          for (const heading of headings) {
            if(isValidNode(heading)){
              // check if there is already exist in allNodes
              let isExist = false;
              for(const node of allNodes){
                if(node === heading){
                  isExist = true;
                  break;
                }
              }
              if(!isExist){
               allNodes.push(heading);
              }
            }
          }
        }
      }
    }
  }

  // sort allNodes, from top to bottom
  allNodes.sort(function(a, b) {
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  })

  // 检查节点语言是否为目标语言，如果是则移除
  const newAllNodes = [];
  if((pageSpecialConfig && pageSpecialConfig.detectLanguage===true)){
    // only check when detectLanguage is not false
    if(allNodes.length<500){
      for(const node of allNodes){
        const nodeText = node.innerText;
        if(nodeText && nodeText.trim().length>0){
            // 检测节点文本语言
            const lang = await detectLanguage(nodeText);
            // 如果语言不是目标语言且不在永不翻译语言列表中，则保留该节点
            if(lang && !checkIsSameLanguage(lang,[currentTargetLanguage,...neverTranslateLangs],ctx)){
              // only translate the clearly language
              newAllNodes.push(node);
            }
        }
      }
      allNodes = newAllNodes;
    }
  }

  // 如果不显示双语，则直接返回节点列表
  if(!isShowDualLanguage){
      return allNodes;
  }

  // is pdf, if pdf, then treat it as a special case
  const isPdf = new RegExp(pdfSelectorsConfig.regex).test(currentUrlWithoutSearch);
  if(isPdf){
    // add flex container to div
    for(const node of allNodes){
      const parent = node.parentNode;
      const pdfContainer = document.createElement("div");
      pdfContainer.style.display = "flex";
      addWrapperToNode(node,pdfContainer);
    }
  }

  // 为需要翻译的节点创建复制节点，用于双语显示
  for(const node of allNodes){
    // check if there is a copy already
    const previousSibling = node.previousSibling;
    // console.log("previousSibling.hasAttribute(markAttributeName)", previousSibling.hasAttribute(markAttributeName))
    // 如果前一个兄弟节点没有翻译标记，说明还没有复制节点
    if(!previousSibling || !previousSibling.hasAttribute || !previousSibling.hasAttribute(enhanceMarkAttributeName)){
      // add
      const copyNode = node.cloneNode(true);
      // get original display value
      let originalDisplay = node.style.display;
      // 特殊网站的处理，添加换行符等
      if(ctx.tabHostName==="www.reddit.com"){
        // append child <br>
        if(copyNode.nodeName.toLowerCase() === "h3" || copyNode.nodeName.toLowerCase() === "h1"){
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }
      }else if(pageSpecialConfig && (pageSpecialConfig.name==='oldRedditCompact' || pageSpecialConfig.name==='oldReddit')){
        // if class name includes title
        if(node.parentNode && node.parentNode.className.includes("title")){
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }
      }else if(pageSpecialConfig && pageSpecialConfig.name==='stackoverflow'){
        // if parrent name is h1
        if((node.parentNode && node.parentNode.nodeName.toLowerCase() === "h1") || (node.classList.contains("comment-copy"))){
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }
      }else if(pageSpecialConfig && pageSpecialConfig.name==='ycombinator'){
        if(node.nodeName.toLowerCase() === "a" ){
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }
      }else if(pageSpecialConfig && pageSpecialConfig.name==='google'){
        if(node.nodeName.toLowerCase() === "h3" ){
            // check copy node display to block
            originalDisplay = "block";
        }
      }else if(pageSpecialConfig && pageSpecialConfig.name==='discord'){
        if(node.nodeName.toLowerCase() === "h3" ){
          // check copy node display to block
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }
      }else if(pageSpecialConfig && pageSpecialConfig.selectors){
        // check is inline element
        if(inlineElements.includes(node.nodeName.toLowerCase())){
          // originalDisplay = "block";
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }
      }

      // 如果是内联元素，添加右边距
      if(inlineElements.includes(copyNode.nodeName.toLowerCase())){
        // add a space
        copyNode.style.paddingRight = "8px";
      }else{
        // 如果不是列表元素，添加下边距
        const copiedNodeName = copyNode.nodeName.toLowerCase();
        if(!['p','ul','ol','li'].includes(copiedNodeName)){
          copyNode.style.paddingBottom = "8px";
        }
      }
      // if nitter
      if(pageSpecialConfig && pageSpecialConfig.name && pageSpecialConfig.name === "nitter"){
        // display to block
        originalDisplay = "block";
      }
      // 格式化复制节点
      formatCopiedNode(copyNode,originalDisplay,ctx,pageSpecialConfig);
      // 特殊处理youtube网站
      if(ctx.tabHostName === "www.youtube.com"){
        // special, we need to insert all children of the copied node to node
        const copiedChildren = copyNode.childNodes;
        const firstNode = node.childNodes[0];
        for(let copiedChild of copiedChildren){
          // if copiedChildNode is a text node, add span wrapper
          if(copiedChild.nodeType === Node.TEXT_NODE){
            const span = document.createElement("span");
            span.appendChild(copiedChild);
            copiedChild = span;
          }
          formatCopiedNode(copiedChild,undefined,ctx,pageSpecialConfig);
          node.insertBefore(copiedChild,firstNode);
        }
        // new line span node
        const newLineSpan = document.createElement("span");
        newLineSpan.innerHTML = "\n";
        formatCopiedNode(newLineSpan,undefined,ctx,pageSpecialConfig);
        node.insertBefore(newLineSpan,firstNode);
      }else{
        // 在原始节点前插入复制节点
        node.parentNode.insertBefore(copyNode, node)
      }
    }
  }
  // copy
  return allNodes;
}

// get the main container, copy from: https://github.com/ZachSaucier/Just-Read/blob/master/content_script.js
// 获取主要内容容器函数
function getContainers(root,pageSpecialConfig){
    if(pageSpecialConfig && pageSpecialConfig.containerSelectors){
      // is array
      if(!Array.isArray(pageSpecialConfig.containerSelectors)){
        pageSpecialConfig.containerSelectors = [pageSpecialConfig.containerSelectors];
      }
      if(pageSpecialConfig.containerSelectors.length >0){
        const containers =[];
        for(const selector of pageSpecialConfig.containerSelectors){
            if(root && root.querySelectorAll){
              const allContainer = root.querySelectorAll(pageSpecialConfig.containerSelectors);
              if(allContainer){
                for(const container of allContainer){
                  // check if brToParagraph
                  if(pageSpecialConfig.brToParagraph){
                      // 将连续的<br>标签替换为段落标签
                      const pattern = new RegExp ("<br/?>[ \\r\\n\\s]*<br/?>", "g");
                      container.innerHTML = container.innerHTML.replace(pattern, "</p><p>");
                  }
                  containers.push(container);
                }
              }
            }
        }
        return containers.length>0?containers:null;
      }
    }

    // 如果没有指定容器选择器，则尝试自动检测主要内容区域
    if(!(root && root.innerText)){
      return null
    }
    // role=main
    // const main = root.querySelector("[role=main]");
    // if(main){
    //   return main;
    // }
    let selectedContainer;
    const matched =  root.innerText.match(/\S+/g);
    const numWordsOnPage =matched?matched.length:0;
    let ps = root.querySelectorAll("p");

    // Find the paragraphs with the most words in it
    let pWithMostWords = root,
        highestWordCount = 0;

    if(ps.length === 0) {
        ps = root.querySelectorAll("div");
    }

    // 遍历段落或div，找到包含单词最多的元素
    ps.forEach(p => {
        if(checkAgainstBlacklist(p, 3) // Make sure it's not in our blacklist
        && p.offsetHeight !== 0) { //  Make sure it's visible on the regular page
            const myInnerText = p.innerText.match(/\S+/g);
            if(myInnerText) {
                const wordCount = myInnerText.length;
                if(wordCount > highestWordCount) {
                    highestWordCount = wordCount;
                    pWithMostWords = p;
                }
            }
        }
    });

    // Keep selecting more generally until over 2/5th of the words on the page have been selected
    selectedContainer = pWithMostWords;
    let wordCountSelected = highestWordCount;

    // 不断向上查找父元素，直到包含页面总词数的40%以上
    while(wordCountSelected / numWordsOnPage < 0.4
    && selectedContainer != root
    && selectedContainer.parentElement && selectedContainer.parentElement.innerText) {
        selectedContainer = selectedContainer.parentElement;
        wordCountSelected = selectedContainer.innerText.match(/\S+/g).length;
    }

    // Make sure a single p tag is not selected
    if(selectedContainer.tagName === "P") {
        selectedContainer = selectedContainer.parentElement;
    }

    return [selectedContainer];
}

// Check given item against blacklist, return null if in blacklist
// 检查元素是否在黑名单中函数
const blacklist = ["comment"]; // 黑名单关键词
function checkAgainstBlacklist(elem, level) {
    if(elem && elem != null) {
        const className = elem.className,
              id = elem.id;

        // 检查类名或ID是否包含黑名单关键词
        const isBlackListed = blacklist.map(item => {
            if((typeof className === "string" && className.indexOf(item) >= 0)
            || (typeof id === "string" && id.indexOf(item) >= 0)
            ) {
                return true;
            }
        }).filter(item => item)[0];

        if(isBlackListed) {
            return null;
        }

        // 递归检查父元素，直到达到指定的层级或body
        const parent = elem.parentElement;
        if(level > 0 && parent && !parent.isSameNode(document.body)) {
            return checkAgainstBlacklist(parent, --level);
        }
    }
    return elem;
}

// 获取元素计算后的样式
function getStyle(el) {
  return window.getComputedStyle(el)
}

// 格式化复制节点函数
function formatCopiedNode(copyNode,originalDisplay,ctx,pageSpecialConfig){
      // 添加翻译标记属性
      copyNode.setAttribute(enhanceMarkAttributeName, "copiedNode");
      // 添加原始显示值属性
      if(originalDisplay){
        copyNode.setAttribute(enhanceOriginalDisplayValueAttributeName, originalDisplay);
      }
      // 设置display为none，先隐藏复制节点
      copyNode.style.display = "none";
      // 添加notranslate类
      copyNode.classList.add("notranslate");
      const twpConfig = ctx.twpConfig;
      const isShowDualLanguage = twpConfig.get("isShowDualLanguage")==='no'?false:true;
      // 如果显示双语且没有特殊样式配置或特殊样式不是"none"
      if (isShowDualLanguage && (!pageSpecialConfig || pageSpecialConfig.style!=="none")) {
        const customDualStyle = twpConfig.get("customDualStyle");
        let dualStyle = customDualStyle || twpConfig.get("dualStyle") || 'underline';
        // 如果有特殊样式配置，则使用特殊样式
        if(pageSpecialConfig && pageSpecialConfig.style){
          dualStyle = pageSpecialConfig.style;
        }
        // 如果双语样式为"mask"，则添加相应的类名
        if (dualStyle === 'mask') {
          copyNode.classList.add("immersive-translate-mask-next-sibling");
        }
      }
}

// 添加样式函数
function addStyle(){
  try{
  // important style
  // 添加CSS样式，用于实现双语遮罩效果
  const css = '.immersive-translate-mask-next-sibling + *{filter:blur(5px);transition: filter 0.1s ease; } .immersive-translate-mask-next-sibling + *:hover {filter:none !important;}';
  const style = document.createElement('style');
  if (style.styleSheet) {
      style.styleSheet.cssText = css;
  } else {
      style.appendChild(document.createTextNode(css));
  }
  document.getElementsByTagName('head')[0].appendChild(style);
  }catch(e){
    // ignore
  }
}

// 页面加载后立即添加样式
addStyle()

 // 检测文本语言函数
 function detectLanguage(text) {
  // send message to background
    return new Promise((resolve, reject) => {
        // 向后台发送消息请求检测语言
        chrome.runtime.sendMessage({
            action: "detectLanguage",
             text: text
        }, response => {
            resolve(response)
        })
    })
}

// 检查语言是否相同函数
function checkIsSameLanguage(lang,langs,ctx){
  // 修正语言代码
  const finalLang = twpLang.fixTLanguageCode(lang);
  if(!finalLang){
    return false;
  }
  // 如果修正后的语言代码在给定的语言列表中，则认为相同
  if(langs.includes(finalLang)){
    return true;
  }

  // for api does not has the best detect for zh-CN and zh-TW
  // we will treat zh-CN and zh-TW as same language
  // we focus on the dual language display, so zh-TW -> zh-CN is not the first priority to fix,
  // I think people will not use it to learn zh-TW to zh-CN
  // only is show dual language, we will treat zh-CN and zh-TW as same language
  // 如果显示双语且语言以"zh-"开头，并且给定的语言列表中包含以"zh-"开头的语言，则认为相同
  if(ctx && ctx.twpConfig && ctx.twpConfig.get("isShowDualLanguage")==='yes'){
    if(finalLang.startsWith("zh-")){
      // if langs , includes any lang starts with zh- , we will treat it as same language
      return langs.filter(lang=>lang.startsWith("zh-")).length>0;
    }else{
      return false
    }
  }
  return false
}
