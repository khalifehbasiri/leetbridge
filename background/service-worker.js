chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Service worker received:", message);
});