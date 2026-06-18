muxy.tabs.open({
  kind: "extensionWebView",
  extension: {
    id: (typeof muxy !== "undefined" && muxy.extensionID) || "files",
    tabType: "code-editor",
    data: { searchMode: true },
  },
});
