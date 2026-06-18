import { clear, cls, h } from "@/lib/dom";

const RENDER_BATCH = 100;

export class FindInFilesView {
  constructor({ parent }) {
    this.parent = parent;
    this.query = "";
    this.results = [];
    this.searchCount = 0;
    this.searchTimeout = null;
    this.caseSensitive = false;
    this.wholeWord = false;
    this.regex = false;
    this.container = null;
    this.searchInput = null;
    this.statusBar = null;
    this.resultsContainer = null;
    this.toggles = {};
    this.render();
  }

  searchIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "11");
    circle.setAttribute("cy", "11");
    circle.setAttribute("r", "8");
    svg.appendChild(circle);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "21");
    line.setAttribute("y1", "21");
    line.setAttribute("x2", "16.65");
    line.setAttribute("y2", "16.65");
    svg.appendChild(line);
    return svg;
  }

  toggleIcon(name) {
    const icons = {
      case: {
        svg: [
          { kind: "path", attrs: { d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" } },
          { kind: "path", attrs: { d: "M12 9v6" } },
          { kind: "path", attrs: { d: "M9 12h6" } },
        ],
      },
    };
    return icons[name];
  }

  render() {
    this.toggles = {};

    this.toggles.case = h("button", {
      class: "find-toggle",
      type: "button",
      "aria-label": "Match case",
      title: "Match case",
      "data-active": "false",
      onClick: () => this.toggleOption("caseSensitive"),
    }, "Aa");

    this.toggles.word = h("button", {
      class: "find-toggle",
      type: "button",
      "aria-label": "Whole word",
      title: "Whole word",
      "data-active": "false",
      onClick: () => this.toggleOption("wholeWord"),
    }, "W");

    this.toggles.regex = h("button", {
      class: "find-toggle",
      type: "button",
      "aria-label": "Regex",
      title: "Use regular expression",
      "data-active": "false",
      onClick: () => this.toggleOption("regex"),
    }, ".*");

    this.container = h("div", { class: "find-in-files" },
      h("div", { class: "find-search-row" },
        h("div", { class: "find-search-icon" }, this.searchIcon()),
        this.searchInput = h("input", {
          class: "find-input",
          type: "text",
          placeholder: "Find in files\u2026",
          "aria-label": "Search query",
          autofocus: "",
          onInput: (e) => this.onInput(e.target.value),
          onKeyDown: (e) => this.onKeyDown(e),
        }),
        h("div", { class: "find-toggle-group" },
          this.toggles.case,
          this.toggles.word,
          this.toggles.regex,
        ),
      ),
      this.statusBar = h("div", { class: "find-status" }, "Type to search"),
      this.resultsContainer = h("div", { class: "find-results" }),
    );

    clear(this.parent);
    this.parent.appendChild(this.container);

    requestAnimationFrame(() => this.searchInput?.focus());
  }

  toggleOption(key) {
    this[key] = !this[key];
    const btn = this.toggles[key === "caseSensitive" ? "case" : key === "wholeWord" ? "word" : "regex"];
    if (btn) btn.dataset.active = String(this[key]);
    if (this.query.trim()) {
      clearTimeout(this.searchTimeout);
      this.setStatus("Searching\u2026");
      this.searchTimeout = setTimeout(() => this.executeSearch(this.query), 300);
    }
  }

  onInput(value) {
    this.query = value;
    clearTimeout(this.searchTimeout);

    if (!value.trim()) {
      this.results = [];
      this.searchCount += 1;
      clear(this.resultsContainer);
      this.setStatus("Type to search");
      return;
    }

    this.setStatus("Searching\u2026");
    this.searchTimeout = setTimeout(() => this.executeSearch(value), 300);
  }

  buildRgArgs(tmpFile) {
    const args = ["rg", "-n", "--no-config", "--color", "never"];
    if (!this.regex) args.push("-F");
    if (!this.caseSensitive) args.push("-i");
    if (this.wholeWord) args.push("-w");
    args.push("-f", tmpFile, ".");
    return args;
  }

  buildGrepArgs(query) {
    const args = ["grep", "-rn", "--color", "never"];
    if (!this.regex) args.push("-F");
    if (!this.caseSensitive) args.push("-i");
    if (this.wholeWord) args.push("-w");
    args.push(query, "--exclude-dir=node_modules", "--exclude-dir=.git", ".");
    return args;
  }

  async executeSearch(query) {
    const searchId = ++this.searchCount;
    const tmpDir = ".muxy";
    const tmpFile = `${tmpDir}/muxy-search`;

    // Write query to a temp file to bypass macOS NFD normalization in process argv.
    // Same approach as muxy PR #415: rg -f reads patterns from file verbatim.
    try {
      await muxy.files.mkdir(tmpDir);
      await muxy.files.write(tmpFile, query);
    } catch {
      if (searchId === this.searchCount) this.setStatus("Search failed: cannot write temp file");
      return;
    }

    let result;
    try {
      result = await muxy.exec(this.buildRgArgs(tmpFile));
    } catch {
      result = null;
    } finally {
      try { await muxy.files.delete(tmpFile); } catch {}
    }

    if (searchId !== this.searchCount) return;
    if (result && result.exitCode <= 1) {
      this.setStatus("Parsing results\u2026");
      const results = this.parseResults(result.stdout || "");
      if (searchId === this.searchCount) this.chunkedRender(results, searchId);
      return;
    }

    try {
      result = await muxy.exec(this.buildGrepArgs(query));
    } catch {
      if (searchId === this.searchCount) {
        this.setStatus("Search tools not available (install ripgrep)");
      }
      return;
    }

    if (searchId === this.searchCount) {
      this.setStatus("Parsing results\u2026");
      const results = this.parseResults(result?.stdout || "");
      this.chunkedRender(results, searchId);
    }
  }

  parseResults(stdout) {
    if (!stdout) return [];
    const results = [];
    let start = 0;
    while (start < stdout.length) {
      const nl = stdout.indexOf("\n", start);
      const line = nl === -1 ? stdout.slice(start) : stdout.slice(start, nl);
      if (line.trim()) {
        const idx1 = line.indexOf(":");
        const idx2 = line.indexOf(":", idx1 + 1);
        if (idx1 >= 0 && idx2 >= 0) {
          results.push({
            filePath: line.slice(0, idx1),
            lineNum: parseInt(line.slice(idx1 + 1, idx2), 10),
            text: line.slice(idx2 + 1),
          });
        }
      }
      if (nl === -1) break;
      start = nl + 1;
    }
    return results;
  }

  chunkedRender(results, searchId) {
    if (searchId !== undefined && searchId !== this.searchCount) return;
    this.results = results;
    clear(this.resultsContainer);

    if (results.length === 0) {
      this.setStatus("No results found");
      return;
    }

    let i = 0;
    const batchSize = RENDER_BATCH;

    const renderNext = () => {
      if (this.searchCount !== searchId) return;
      const end = Math.min(i + batchSize, results.length);
      for (; i < end; i++) {
        const r = results[i];
        const item = h("div", {
          class: "find-result-item",
          title: `${r.filePath}:${r.lineNum}`,
          onClick: () => this.openResult(r),
        },
          h("div", { class: "find-result-text", html: this.highlightText(r.text) }),
          h("div", { class: "find-result-location" }, `${r.filePath}:${r.lineNum}`),
        );
        this.resultsContainer.appendChild(item);
      }
      if (i < results.length) {
        this.setStatus(`Showing ${i} of ${results.length} results\u2026`);
        requestAnimationFrame(renderNext);
      } else {
        this.setStatus(`${results.length} result${results.length === 1 ? "" : "s"}`);
      }
    };

    requestAnimationFrame(renderNext);
  }

  highlightText(text) {
    const maxLen = 200;
    const truncated = text.length > maxLen ? text.slice(0, maxLen) + "\u2026" : text;
    const escaped = this.escapeHtml(truncated);
    if (!this.query.trim()) return escaped;
    const q = this.escapeHtml(this.query.trim());
    if (!q) return escaped;
    try {
      const flags = this.caseSensitive ? "g" : "gi";
      const re = new RegExp(`(${this.regex ? q : this.escapeRegex(q)})`, flags);
      return escaped.replace(re, "<mark>$1</mark>");
    } catch {
      return escaped;
    }
  }

  escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  openResult(result) {
    try {
      const extId = muxy.extensionID || "files";
      muxy.tabs.open({
        kind: "extensionWebView",
        extension: {
          id: extId,
          tabType: "code-editor",
          singleton: false,
          data: { filePath: result.filePath, line: result.lineNum, replaceable: false },
        },
      });
    } catch (err) {
      console.error(
        "[find-in-files] tabs.open FAILED" +
          " file=" + result.filePath +
          " line=" + result.lineNum +
          " error=" + String((err && err.message) || err),
      );
    }
  }

  setStatus(text) {
    if (this.statusBar) this.statusBar.textContent = text;
  }

  onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
    }
  }

  destroy() {
    clearTimeout(this.searchTimeout);
    clear(this.parent);
    this.container = null;
    this.searchInput = null;
    this.statusBar = null;
    this.resultsContainer = null;
    this.toggles = {};
  }
}
