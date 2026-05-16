import { useState } from "react";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { open, save } from "@tauri-apps/plugin-dialog";
import "./App.css";

type PaneState = {
  title: string;
  path: string | null;
  content: string;
  savedContent: string;
};

const emptyPane = (title: string): PaneState => ({
  title,
  path: null,
  content: "",
  savedContent: "",
});

function filenameFromPath(path: string | null, fallback: string) {
  if (!path) return fallback;
  return path.split("/").pop() || fallback;
}

function isDirty(pane: PaneState) {
  return pane.content !== pane.savedContent;
}

function textStats(text: string) {
  const characters = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { characters, words };
}

function cursorLine(text: string, position: number) {
  return text.slice(0, position).split("\n").length;
}

function Pane({
  pane,
  setPane,
}: {
  pane: PaneState;
  setPane: React.Dispatch<React.SetStateAction<PaneState>>;
}) {
  const [cursorPosition, setCursorPosition] = useState(0);
  async function openFile() {
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
      });
    } catch (err) {
      alert(`Open failed:\n${String(err)}`);
    }
  }

  async function saveFile() {
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

  return (
    <section className="pane">
      <header className="pane-header">
        <div className="file-title">
          {pane.title}
          {isDirty(pane) ? " •" : ""}
        </div>

        <div className="controls">
          <button onClick={openFile}>Open</button>
          <button onClick={saveFile}>Save</button>
          <button onClick={saveAsFile}>Save As</button>
        </div>
      </header>

      <textarea
        className="editor"
        value={pane.content}
        spellCheck={false}
        onChange={(e) =>
          setPane((current) => ({
            ...current,
            content: e.target.value,
          }))
        }
        onSelect={(e) => setCursorPosition(e.currentTarget.selectionStart)}
        onKeyUp={(e) => setCursorPosition(e.currentTarget.selectionStart)}
        onClick={(e) => setCursorPosition(e.currentTarget.selectionStart)}
      />

      <footer className="pane-footer">
        <span>{pane.path || "No file selected"}</span>
        <span>
          Line {cursorLine(pane.content, cursorPosition).toLocaleString()} ·{" "}
          {textStats(pane.content).characters.toLocaleString()} chars ·{" "}
          {textStats(pane.content).words.toLocaleString()} words
        </span>
      </footer>

    </section>
  );
}

export default function App() {
  const [left, setLeft] = useState<PaneState>(emptyPane("Left"));
  const [right, setRight] = useState<PaneState>(emptyPane("Right"));

  return (
    <main className="app">
      <div className="panes">
        <Pane pane={left} setPane={setLeft} />
        <Pane pane={right} setPane={setRight} />
      </div>
    </main>
  );
}