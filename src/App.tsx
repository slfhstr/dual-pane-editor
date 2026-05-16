import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { open, save } from "@tauri-apps/plugin-dialog";
import "./App.css";

type PaneMode = "edit" | "markdown-preview" | "html-preview";

type PaneState = {
  title: string;
  path: string | null;
  content: string;
  savedContent: string;
  cursorPosition: number;
  mode: PaneMode;
  searchOpen: boolean;
  searchTerm: string;
};

const emptyPane = (title: string): PaneState => ({
  title,
  path: null,
  content: "",
  savedContent: "",
  cursorPosition: 0,
  mode: "edit",
  searchOpen: false,
  searchTerm: "",
});

function filenameFromPath(path: string | null, fallback: string) {
  if (!path) return fallback;
  return path.split("/").pop() || fallback;
}

function isDirty(pane: PaneState) {
  return pane.content !== pane.savedContent;
}

function textStats(text: string) {
  return {
    characters: text.length,
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
  };
}

function cursorLine(text: string, position: number) {
  return text.slice(0, position).split("\n").length;
}

function Pane({
  pane,
  setPane,
  fontSize,
  savePane,
}: {
  pane: PaneState;
  setPane: React.Dispatch<React.SetStateAction<PaneState>>;
  fontSize: number;
  savePane: () => Promise<void>;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function confirmDiscard() {
    if (!isDirty(pane)) return true;
    return window.confirm("This pane has unsaved changes. Discard them?");
  }

  async function openFile() {
    if (!(await confirmDiscard())) return;

    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Text",
            extensions: ["md", "markdown", "txt", "json", "html", "htm"],
          },
        ],
      });

      if (!selected || Array.isArray(selected)) return;

      const text = await readTextFile(selected);

      setPane({
        title: filenameFromPath(selected, "Untitled"),
        path: selected,
        content: text,
        savedContent: text,
        cursorPosition: 0,
        mode: "edit",
        searchOpen: false,
        searchTerm: "",
      });
    } catch (err) {
      alert(`Open failed:\n${String(err)}`);
    }
  }

  async function saveAsFile() {
    try {
      const selected = await save({
        filters: [{ name: "Text", extensions: ["md", "txt", "json", "html"] }],
      });

      if (!selected) return;

      await writeTextFile(selected, pane.content);

      setPane((current) => ({
        ...current,
        path: selected,
        title: filenameFromPath(selected, current.title),
        savedContent: current.content,
      }));
    } catch (err) {
      alert(`Save As failed:\n${String(err)}`);
    }
  }

  function updateCursorPosition() {
    const el = textareaRef.current;
    if (!el) return;

    setPane((current) => ({
      ...current,
      cursorPosition: el.selectionStart,
    }));
  }

  function runSearch(term: string) {
    const el = textareaRef.current;
    if (!el || !term) return;

    const start = el.selectionEnd;
    const next = pane.content.toLowerCase().indexOf(term.toLowerCase(), start);
    const found = next >= 0 ? next : pane.content.toLowerCase().indexOf(term.toLowerCase());

    if (found >= 0) {
      el.focus();
      el.setSelectionRange(found, found + term.length);
      setPane((current) => ({
        ...current,
        cursorPosition: found,
      }));
    }
  }

  const stats = textStats(pane.content);

  return (
    <section className="pane">
      <header className="pane-header">
        <div className="file-title">
          {pane.title}
          {isDirty(pane) ? " •" : ""}
        </div>

        <div className="controls">
          <select
            value={pane.mode}
            onChange={(e) =>
              setPane((current) => ({
                ...current,
                mode: e.target.value as PaneMode,
              }))
            }
          >
            <option value="edit">Edit</option>
            <option value="markdown-preview">Markdown Preview</option>
            <option value="html-preview">HTML Preview</option>
          </select>

          <button onClick={openFile}>Open</button>
          <button onClick={savePane}>Save</button>
          <button onClick={saveAsFile}>Save As</button>
        </div>
      </header>

      {pane.searchOpen && (
        <div className="search-bar">
          <input
            autoFocus
            value={pane.searchTerm}
            placeholder="Search this pane"
            onChange={(e) =>
              setPane((current) => ({
                ...current,
                searchTerm: e.target.value,
              }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch(pane.searchTerm);
              if (e.key === "Escape") {
                setPane((current) => ({ ...current, searchOpen: false }));
              }
            }}
          />
          <button onClick={() => runSearch(pane.searchTerm)}>Find</button>
          <button onClick={() => setPane((current) => ({ ...current, searchOpen: false }))}>
            Close
          </button>
        </div>
      )}

      {pane.mode === "edit" && (
        <textarea
          ref={textareaRef}
          className="editor"
          style={{ fontSize }}
          value={pane.content}
          spellCheck={false}
          onChange={(e) =>
            setPane((current) => ({
              ...current,
              content: e.target.value,
              cursorPosition: e.target.selectionStart,
            }))
          }
          onSelect={updateCursorPosition}
          onKeyUp={updateCursorPosition}
          onClick={updateCursorPosition}
        />
      )}

      {pane.mode === "markdown-preview" && (
        <div
          className="preview markdown-preview"
          style={{ fontSize }}
          dangerouslySetInnerHTML={{ __html: marked.parse(pane.content) as string }}
        />
      )}

      {pane.mode === "html-preview" && (
        <iframe className="html-preview" srcDoc={pane.content} title={pane.title} />
      )}

      <footer className="pane-footer">
        <span>{pane.path || "No file selected"}</span>
        <span>
          Line {cursorLine(pane.content, pane.cursorPosition).toLocaleString()} ·{" "}
          {stats.characters.toLocaleString()} chars · {stats.words.toLocaleString()} words ·{" "}
          {fontSize}px
        </span>
      </footer>
    </section>
  );
}

export default function App() {
  const [left, setLeft] = useState<PaneState>(emptyPane("Left"));
  const [right, setRight] = useState<PaneState>(emptyPane("Right"));
  const [activePane, setActivePane] = useState<"left" | "right">("left");
  const [fontSize, setFontSize] = useState(15);

  async function savePane(which: "left" | "right") {
    const pane = which === "left" ? left : right;
    const setPane = which === "left" ? setLeft : setRight;

    try {
      let targetPath = pane.path;

      if (!targetPath) {
        const selected = await save({
          filters: [{ name: "Text", extensions: ["md", "txt", "json", "html"] }],
        });

        if (!selected) return;
        targetPath = selected;
      }

      await writeTextFile(targetPath, pane.content);

      setPane((current) => ({
        ...current,
        path: targetPath,
        title: filenameFromPath(targetPath, current.title),
        savedContent: current.content,
      }));
    } catch (err) {
      alert(`Save failed:\n${String(err)}`);
    }
  }

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty(left) || isDirty(right)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [left, right]);

  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => {
      const cmd = event.metaKey || event.ctrlKey;

      if (!cmd) return;

      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        // Open remains pane-local via button for now, to avoid ambiguity.
        alert("Use the Open button in the pane you want to load.");
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        savePane(activePane);
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setFontSize((size) => Math.min(size + 1, 32));
      }

      if (event.key === "-") {
        event.preventDefault();
        setFontSize((size) => Math.max(size - 1, 10));
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        const setPane = activePane === "left" ? setLeft : setRight;
        setPane((current) => ({
          ...current,
          searchOpen: true,
        }));
      }
    };

    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, [activePane, left, right]);

  return (
    <main className="app">
      <div className="panes">
        <div onFocusCapture={() => setActivePane("left")}>
          <Pane pane={left} setPane={setLeft} fontSize={fontSize} savePane={() => savePane("left")} />
        </div>
        <div onFocusCapture={() => setActivePane("right")}>
          <Pane pane={right} setPane={setRight} fontSize={fontSize} savePane={() => savePane("right")} />
        </div>
      </div>
    </main>
  );
}