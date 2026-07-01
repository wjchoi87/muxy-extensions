const MAX_RESULTS = 2000;
const MAX_TEXT_LEN = 200;
const TMP_DIR = ".muxy";
const TMP_FILE = `${TMP_DIR}/muxy-search`;

function ext_id() {
  return (typeof muxy !== "undefined" && muxy.extensionID) || "files";
}

function rg_args(tmp_file, options) {
  const args = ["rg", "-n", "--no-config", "--color", "never"];
  if (!options.regex) args.push("-F");
  if (!options.caseSensitive) args.push("-i");
  if (options.wholeWord) args.push("-w");
  args.push("-f", tmp_file, ".");
  return args;
}

function grep_args(query, options) {
  const args = ["grep", "-rn", "--color", "never"];
  if (!options.regex) args.push("-F");
  if (!options.caseSensitive) args.push("-i");
  if (options.wholeWord) args.push("-w");
  args.push(query, "--exclude-dir=node_modules", "--exclude-dir=.git", ".");
  return args;
}

function parse_line(line) {
  const idx1 = line.indexOf(":");
  const idx2 = line.indexOf(":", idx1 + 1);
  if (idx1 < 0 || idx2 < 0) return null;
  const file_path = line.slice(0, idx1).replace(/^\.\//, "");
  const line_num = parseInt(line.slice(idx1 + 1, idx2), 10);
  if (!file_path || !Number.isFinite(line_num)) return null;
  let text = line.slice(idx2 + 1);
  if (text.length > MAX_TEXT_LEN) text = text.slice(0, MAX_TEXT_LEN) + "…";
  return {
    id: `${file_path}:${line_num}`,
    title: text.trim() || " ",
    subtitle: `${file_path}:${line_num}`,
  };
}

function parse_choice(id) {
  if (typeof id !== "string") return null;
  const sep = id.lastIndexOf(":");
  if (sep < 0) return null;
  const file_path = id.slice(0, sep);
  const line_num = parseInt(id.slice(sep + 1), 10);
  if (!file_path || !Number.isFinite(line_num)) return null;
  return { filePath: file_path, lineNum: line_num };
}

function run_search(query, options) {
  let use_rg = false;
  try {
    muxy.files.mkdir(TMP_DIR);
    muxy.files.write(TMP_FILE, query);
    use_rg = true;
  } catch {
    use_rg = false;
  }

  let result = null;
  if (use_rg) {
    try {
      result = muxy.exec(rg_args(TMP_FILE, options));
    } catch {
      result = null;
    } finally {
      try {
        muxy.files.delete(TMP_FILE);
      } catch {}
    }
  }

  if (!result || result.exitCode > 1) {
    try {
      result = muxy.exec(grep_args(query, options));
    } catch {
      return null;
    }
  }

  return (result && result.stdout) || "";
}

function search(query, options) {
  const stdout = run_search(query, options);
  if (!stdout) return [];

  const items = [];
  let start = 0;
  while (start < stdout.length && items.length < MAX_RESULTS) {
    const nl = stdout.indexOf("\n", start);
    const raw = nl === -1 ? stdout.slice(start) : stdout.slice(start, nl);
    const item = raw.trim() ? parse_line(raw) : null;
    if (item) items.push(item);
    if (nl === -1) break;
    start = nl + 1;
  }
  return items;
}

muxy.modal.open({
  placeholder: "Find in files…",
  emptyLabel: "Type to search",
  noMatchLabel: "No results",
  searchToolbar: true,
  onQuery(query, _emit, options) {
    if (!query) return [];
    return search(query, options || {});
  },
  onSelect(choice) {
    if (!choice) return;
    const target = parse_choice(choice.id);
    if (!target) return;
    try {
      muxy.tabs.open({
        kind: "extensionWebView",
        extension: {
          id: ext_id(),
          tabType: "code-editor",
          singleton: false,
          data: { filePath: target.filePath, line: target.lineNum, replaceable: false },
        },
      });
    } catch (err) {
      console.error(
        "[find-in-files] tabs.open FAILED" +
          " file=" + String(target.filePath) +
          " line=" + String(target.lineNum) +
          " error=" + String((err && err.message) || err),
      );
    }
  },
});
