import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyze,
  cloneGrid,
  diamondTotal,
  emptyGrid,
  percentNumber,
  sameGrid,
  sameMark,
  tierOf,
  BOARD_SIZES,
  type BoardSize,
  type Mark,
} from "@/lib/tide/engine";

type Tool =
  | { t: "select" }
  | { t: "u" }
  | { t: "d" }
  | { t: "s" }
  | { t: "n"; v: number };

interface MenuState {
  r: number;
  c: number;
  left: number;
  top: number;
}

function toolMark(tool: Tool): Mark | null {
  if (tool.t === "select") return null;
  if (tool.t === "n") return { t: "n", v: tool.v };
  return { t: tool.t };
}

function placeMenu(el: HTMLElement): { left: number; top: number } {
  const rect = el.getBoundingClientRect();
  const width = 276;
  const height = 148;
  let left = rect.left + rect.width / 2 - width / 2;
  let top = rect.bottom + 8;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8);
  return { left, top };
}

function cellText(mark: Mark, prob: number | null): string {
  if (mark.t === "d") return "💎";
  if (mark.t === "s") return "×";
  if (mark.t === "n") return String(mark.v);
  if (prob == null) return "";
  return `${percentNumber(prob)}%`;
}

function modeCopy(mode: "exact" | "mixed" | "approx", bad: boolean): string {
  if (bad) return "标记矛盾";
  if (mode === "exact") return "精确模式";
  if (mode === "mixed") return "近似模式 · 约束格精确";
  return "近似模式";
}

export function TideApp() {
  const [size, setSize] = useState<BoardSize>(8);
  const [grid, setGrid] = useState<Mark[][]>(() => emptyGrid(8));
  const [past, setPast] = useState<Mark[][][]>([]);
  const [tool, setTool] = useState<Tool>({ t: "select" });
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const gridRef = useRef(grid);
  const pastRef = useRef(past);
  const sizeRef = useRef(size);
  const selectedRef = useRef(selected);
  gridRef.current = grid;
  pastRef.current = past;
  sizeRef.current = size;
  selectedRef.current = selected;

  const analysis = useMemo(() => analyze(grid, size), [grid, size]);
  const analysisRef = useRef(analysis);
  analysisRef.current = analysis;

  const display = analysis.contradiction ? grid : analysis.grid;
  const total = diamondTotal(size);
  const remain = total - analysis.diamonds;

  function paint(r: number, c: number, mark: Mark) {
    const current = gridRef.current;
    const n = sizeRef.current;
    if (r < 0 || c < 0 || r >= n || c >= n) return;
    if (sameMark(current[r][c], mark)) return;
    const next = cloneGrid(current);
    next[r][c] = mark;
    const history = [...pastRef.current, current].slice(-80);
    pastRef.current = history;
    gridRef.current = next;
    setPast(history);
    setGrid(next);
    setNote(null);
  }

  function undo() {
    const history = pastRef.current;
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    const rest = history.slice(0, -1);
    pastRef.current = rest;
    gridRef.current = prev;
    setPast(rest);
    setGrid(prev);
    setMenu(null);
    setNote(null);
  }

  function paintRef(r: number, c: number, mark: Mark) {
    paint(r, c, mark);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      const chord = e.metaKey || e.ctrlKey;
      if (chord && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      const inChrome = target?.closest("[data-toolbar], [data-actions], [data-menu], [data-sizes]");
      if (inChrome && !e.key.startsWith("Arrow") && e.key !== "Escape") return;

      const n = sizeRef.current;
      let pos = selectedRef.current;
      const move: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      if (!pos && (move[e.key] || (e.key >= "0" && e.key <= "8") || e.key === "Enter" || e.key === "x" || e.key === "X" || e.key === "Delete" || e.key === "Backspace")) {
        pos = analysisRef.current.recommend ?? { r: 0, c: 0 };
        selectedRef.current = pos;
        setSelected(pos);
      }
      if (!pos) {
        if (e.key === "Escape") {
          setMenu(null);
          setTool({ t: "select" });
        }
        return;
      }

      if (move[e.key]) {
        e.preventDefault();
        const [dr, dc] = move[e.key];
        const next = {
          r: Math.min(n - 1, Math.max(0, pos.r + dr)),
          c: Math.min(n - 1, Math.max(0, pos.c + dc)),
        };
        selectedRef.current = next;
        setSelected(next);
        setMenu(null);
        document.querySelector<HTMLElement>(`[data-r="${next.r}"][data-c="${next.c}"]`)?.focus();
        return;
      }

      let mark: Mark | null = null;
      if (e.key >= "0" && e.key <= "8") mark = { t: "n", v: Number(e.key) };
      else if (e.key === "Enter") mark = { t: "d" };
      else if (e.key === "x" || e.key === "X") mark = { t: "s" };
      else if (e.key === "Delete" || e.key === "Backspace") mark = { t: "u" };
      else if (e.key === "Escape") {
        setMenu(null);
        setTool({ t: "select" });
        return;
      }
      if (!mark) return;
      e.preventDefault();
      paintRef(pos.r, pos.c, mark);
      setMenu(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!menu) return;
    function onPointer(e: PointerEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-menu], [data-cell]")) return;
      setMenu(null);
    }
    function close() {
      setMenu(null);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  function onCellClick(r: number, c: number, el: HTMLElement) {
    setSelected({ r, c });
    selectedRef.current = { r, c };
    const mark = toolMark(tool);
    if (mark) {
      paint(r, c, mark);
      setMenu(null);
      return;
    }
    setMenu({ r, c, ...placeMenu(el) });
  }

  function changeSize(next: BoardSize) {
    if (next === size) return;
    setSize(next);
    const blank = emptyGrid(next);
    setGrid(blank);
    gridRef.current = blank;
    setPast([]);
    pastRef.current = [];
    setSelected(null);
    selectedRef.current = null;
    setMenu(null);
    setNote(null);
    setTool({ t: "select" });
  }

  function clearBoard() {
    const blank = emptyGrid(size);
    if (!sameGrid(blank, gridRef.current)) {
      const history = [...pastRef.current, gridRef.current].slice(-80);
      pastRef.current = history;
      setPast(history);
    }
    gridRef.current = blank;
    setGrid(blank);
    setSelected(null);
    selectedRef.current = null;
    setMenu(null);
    setNote(null);
  }

  function commitDeduction() {
    if (analysis.contradiction) {
      setNote("当前标记互相矛盾，没法继续推导。");
      return;
    }
    if (sameGrid(analysis.grid, grid)) {
      setNote("没有新的确定格。");
      return;
    }
    let added = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!sameMark(analysis.grid[r][c], grid[r][c])) added++;
      }
    }
    const history = [...pastRef.current, grid].slice(-80);
    pastRef.current = history;
    const next = cloneGrid(analysis.grid);
    gridRef.current = next;
    setPast(history);
    setGrid(next);
    setMenu(null);
    setNote(`已写入 ${added} 个确定格，撤销可以收回。`);
  }

  const recommend = analysis.contradiction ? null : analysis.recommend;
  let nextLine = "没有待定格子。";
  if (analysis.contradiction) nextLine = "当前标记互相矛盾，请检查数字和钻石。";
  else if (recommend) {
    const p = analysis.probs[recommend.r][recommend.c];
    const approx = p != null && !analysis.exact[recommend.r][recommend.c] ? "（近似）" : "";
    nextLine = `推荐点开 ${recommend.r + 1}行${recommend.c + 1}列，概率 ${p == null ? "—" : percentNumber(p)}%${approx}`;
  }

  const mode = analysis.contradiction ? "bad" : analysis.mode;

  return (
    <div className="tide-page">
      <main className="sheet">
        <header className="mast">
          <h1>Sexclub独家潮汐秘境计算器----Stars制作</h1>
          <p className="lede">把游戏里已经翻开的格子填进来，我们会进行概率计算，并给出下一步操作建议。</p>
        </header>

        <div className="topbar">
          <div className="sizes" data-sizes role="group" aria-label="棋盘尺寸">
            {BOARD_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                className={n === size ? "is-on" : undefined}
                aria-pressed={n === size}
                onClick={() => changeSize(n)}
              >
                {n}×{n}
              </button>
            ))}
          </div>
          <p className="usage">
            <span>
              剩余 <strong>{remain}</strong>
            </span>
            <span>
              已用 <strong>{analysis.diamonds}</strong>
            </span>
            <span>
              已填 <strong>{analysis.filled}</strong>
            </span>
            <span className="mode" data-mode={mode}>
              {modeCopy(analysis.mode, analysis.contradiction)}
            </span>
          </p>
        </div>

        <div className="tools" data-toolbar role="toolbar" aria-label="单击涂">
          <span className="tools-label">单击涂</span>
          <button
            type="button"
            className={tool.t === "select" ? "is-on" : undefined}
            aria-pressed={tool.t === "select"}
            onClick={() => setTool({ t: "select" })}
          >
            选择
          </button>
          {Array.from({ length: 9 }, (_, v) => (
            <button
              key={v}
              type="button"
              className={tool.t === "n" && tool.v === v ? "is-on" : undefined}
              aria-pressed={tool.t === "n" && tool.v === v}
              aria-label={`涂数字 ${v}`}
              onClick={() => setTool({ t: "n", v })}
            >
              {v}
            </button>
          ))}
          <button
            type="button"
            className={tool.t === "d" ? "is-on" : undefined}
            aria-pressed={tool.t === "d"}
            aria-label="涂钻石"
            onClick={() => setTool({ t: "d" })}
          >
            💎
          </button>
          <button
            type="button"
            className={tool.t === "s" ? "is-on" : undefined}
            aria-pressed={tool.t === "s"}
            aria-label="涂排除"
            onClick={() => setTool({ t: "s" })}
          >
            ×
          </button>
          <button
            type="button"
            className={tool.t === "u" ? "is-on" : undefined}
            aria-pressed={tool.t === "u"}
            onClick={() => setTool({ t: "u" })}
          >
            清除
          </button>
          <p className="legend">{"蓝 <20% · 棕 20–49% · 红 ≥50%。虚线是未翻开，实线红框并闪烁的是推荐格。"}</p>
        </div>

        <div className="board-frame">
          <div className="board-wrap">
            <div
              className="board"
              role="grid"
              aria-label={`${size} 乘 ${size} 棋盘`}
              style={{ ["--n" as string]: String(size) }}
            >
              {display.map((row, r) =>
                row.map((cell, c) => {
                  const prob = analysis.contradiction ? null : analysis.probs[r][c];
                  const rec = recommend?.r === r && recommend?.c === c;
                  const tier = prob == null ? undefined : tierOf(prob);
                  const text = cellText(cell, prob);
                  const conflict = analysis.violations[r][c];
                  const classes = [
                    "cell",
                    rec ? "is-rec" : "",
                    selected?.r === r && selected?.c === c ? "is-selected" : "",
                    conflict ? "is-conflict" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      role="gridcell"
                      data-cell=""
                      data-r={r}
                      data-c={c}
                      data-kind={cell.t}
                      data-n={cell.t === "n" ? cell.v : undefined}
                      data-tier={tier}
                      data-rec={rec ? "1" : undefined}
                      className={classes}
                      aria-label={`${r + 1}行${c + 1}列 ${text || "未翻开"}`}
                      onClick={(e) => onCellClick(r, c, e.currentTarget)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setSelected({ r, c });
                        selectedRef.current = { r, c };
                        paint(r, c, { t: "d" });
                        setMenu(null);
                      }}
                    >
                      {text}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        </div>

        <footer className="dock">
          <p className="next" data-next data-bad={analysis.contradiction ? "1" : "0"}>
            {nextLine}
          </p>
          {selected ? (
            <p className="subline">
              当前 {selected.r + 1}行{selected.c + 1}列
              {analysis.solutions != null && !analysis.contradiction
                ? analysis.unknowns <= 16
                  ? ` · ${analysis.solutions.toLocaleString("zh-CN")} 种合法布局`
                  : ` · 约束组合 ${analysis.solutions.toLocaleString("zh-CN")} 种`
                : ""}
            </p>
          ) : analysis.solutions != null && !analysis.contradiction ? (
            <p className="subline">
              {analysis.unknowns <= 16
                ? `${analysis.solutions.toLocaleString("zh-CN")} 种合法布局`
                : `约束组合 ${analysis.solutions.toLocaleString("zh-CN")} 种`}
            </p>
          ) : null}
          {note ? <p className="subline">{note}</p> : null}
          <div className="pills">
            <span>
              必定是钻石 <b>{analysis.diamonds}</b>
            </span>
            <span>
              必定不是钻石 <b>{analysis.safes}</b>
            </span>
            <span>
              待定 <b>{analysis.unknowns}</b>
            </span>
          </div>
          <div className="actions" data-actions>
            <button type="button" onClick={undo} disabled={past.length === 0}>
              撤销
            </button>
            <button type="button" className="primary" onClick={commitDeduction}>
              自动推导
            </button>
            <button type="button" onClick={clearBoard}>
              清空棋盘
            </button>
          </div>
          <p className="keys">数字键 0–8 填数 · Enter 标钻石 · X 排除 · Delete 清除 · 右键标钻石 · Ctrl+Z 撤销</p>
        </footer>

        {menu ? (
          <div className="menu" data-menu role="dialog" aria-label="标记格子" style={{ left: menu.left, top: menu.top }}>
            <div className="menu-nums">
              {Array.from({ length: 9 }, (_, v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    paint(menu.r, menu.c, { t: "n", v });
                    setMenu(null);
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="menu-ops">
              <button
                type="button"
                onClick={() => {
                  paint(menu.r, menu.c, { t: "d" });
                  setMenu(null);
                }}
              >
                💎 钻石
              </button>
              <button
                type="button"
                onClick={() => {
                  paint(menu.r, menu.c, { t: "s" });
                  setMenu(null);
                }}
              >
                × 排除
              </button>
              <button
                type="button"
                onClick={() => {
                  paint(menu.r, menu.c, { t: "u" });
                  setMenu(null);
                }}
              >
                清除
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
