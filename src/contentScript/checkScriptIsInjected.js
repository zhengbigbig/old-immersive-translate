// 如果网站有任何限制阻止contentScript运行，那么这个监听器将无法工作，背景脚本将知道这一点
// if the site has any restriction that prevent contentScript from running, then this listener will not work and the backgroundScript will know that
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 监听来自background脚本的消息，当收到检查脚本是否注入的请求时
  if (request.action === "contentScriptIsInjected") {
    // 如果消息动作是检查contentScript是否已注入，则返回true表示已注入
    sendResponse(true);
  }
});
