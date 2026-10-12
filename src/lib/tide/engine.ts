// 潮汐秘境计算器 —— 确定性推导 + 精确概率
//
// 概率定义：在满足全部数字约束、且钻石总数能够排下的前沿赋值里，
// 该格为钻石的次数 / 合法赋值数。前沿（贴着数字的未定格）≤ 16 时全枚举。
// 各合法前沿赋值等权，这样才能得到文档里的 75% / 50% 交叉约束。
// 若每种赋值用掉的钻石数相同，外围空格的概率也是精确的（剩余钻石均摊）；
// 否则外围按期望剩余密度估算，并标成近似。未定格 ≤ 16 时连同全局钻石数一起枚举。

export const BOARD_SIZES = [8, 10, 12] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];

export function diamondTotal(size: BoardSize): number {
  if (size === 8) return 20;
  if (size === 10) return 30;
  return 45;
}

export type Mark =
  | { t: "u" }
  | { t: "n"; v: number }
  | { t: "d" }
  | { t: "s" };

export type Mode = "exact" | "mixed" | "approx";

export interface Analysis {
  /** 推导之后的棋盘（含自动标出的 × / 钻石） */
  grid: Mark[][];
  /** 仍未确定的格子才有概率，0~1 */
  probs: (number | null)[][];
  /** 该概率是否来自枚举（而不是密度近似） */
  exact: boolean[][];
  mode: Mode;
  contradiction: boolean;
  /** 枚举到的合法前沿赋值数；近似或无法给出时为 null */
  solutions: number | null;
  recommend: { r: number; c: number } | null;
  diamonds: number;
  safes: number;
  unknowns: number;
  filled: number;
  totalDiamonds: number;
  /** 数字格自身已经不可能成立 */
  violations: boolean[][];
}

const ENUM_LIMIT = 16;

export function emptyGrid(size: number): Mark[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, (): Mark => ({ t: "u" })),
  );
}

export function cloneGrid(grid: Mark[][]): Mark[][] {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}

export function sameMark(a: Mark, b: Mark): boolean {
  if (a.t !== b.t) return false;
  if (a.t === "n" && b.t === "n") return a.v === b.v;
  return true;
}

export function sameGrid(a: Mark[][], b: Mark[][]): boolean {
  for (let r = 0; r < a.length; r++) {
    for (let c = 0; c < a[r].length; c++) {
      if (!sameMark(a[r][c], b[r][c])) return false;
    }
  }
  return true;
}

export function percentNumber(p: number): number {
  return Math.round(p * 100);
}

export function tierOf(p: number): "low" | "mid" | "high" {
  const n = percentNumber(p);
  if (n >= 50) return "high";
  if (n >= 20) return "mid";
  return "low";
}

interface Var {
  r: number;
  c: number;
}

interface Constraint {
  idxs: number[];
  need: number;
}

function neighbors(r: number, c: number, size: number): Var[] {
  const out: Var[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < size && cc < size) out.push({ r: rr, c: cc });
    }
  }
  return out;
}

function keyOf(r: number, c: number): string {
  return `${r},${c}`;
}

interface Model {
  vars: Var[];
  constraints: Constraint[];
  outside: number;
  budget: number;
}

function buildModel(grid: Mark[][], size: number, totalDiamonds: number): Model | "bad" {
  let marked = 0;
  let unknown = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = grid[r][c];
      if (cell.t === "d") marked++;
      else if (cell.t === "u") unknown++;
    }
  }
  const budget = totalDiamonds - marked;
  if (budget < 0 || budget > unknown) return "bad";

  const index = new Map<string, number>();
  const vars: Var[] = [];

  const raw: { cells: Var[]; need: number }[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = grid[r][c];
      if (cell.t !== "n") continue;
      let need = cell.v;
      const cells: Var[] = [];
      for (const nb of neighbors(r, c, size)) {
        const m = grid[nb.r][nb.c];
        if (m.t === "d") need--;
        else if (m.t === "u") cells.push(nb);
      }
      if (need < 0 || need > cells.length) return "bad";
      if (cells.length === 0) {
        if (need !== 0) return "bad";
        continue;
      }
      raw.push({ cells, need });
    }
  }

  for (const group of raw) {
    for (const cell of group.cells) {
      const k = keyOf(cell.r, cell.c);
      if (!index.has(k)) {
        index.set(k, vars.length);
        vars.push(cell);
      }
    }
  }

  const constraints: Constraint[] = raw.map((group) => ({
    need: group.need,
    idxs: group.cells.map((cell) => index.get(keyOf(cell.r, cell.c))!),
  }));

  return {
    vars,
    constraints,
    outside: unknown - vars.length,
    budget,
  };
}

interface EnumResult {
  hits: number[];
  total: number;
  minUsed: number;
  maxUsed: number;
}

/**
 * 回溯枚举。赋值过程中若某约束钻石过多，或剩下的格子不够补齐数字，立刻剪枝。
 * lowerBound 为真时，还要求最终钻石数能刚好用完预算（外围空格来补）。
 */
function enumerate(
  constraints: Constraint[],
  varCount: number,
  budget: number,
  outside: number,
  lowerBound: boolean,
): EnumResult {
  const hits = new Array<number>(varCount).fill(0);
  if (varCount === 0) {
    const ok = budget <= outside && (!lowerBound || budget >= 0) && (outside === 0 ? budget === 0 : budget <= outside);
    const feasible = budget >= 0 && budget <= outside;
    if (!feasible) return { hits, total: 0, minUsed: 0, maxUsed: 0 };
    return { hits, total: 1, minUsed: 0, maxUsed: 0 };
  }

  const state = constraints.map((c) => ({ need: c.need, unk: c.idxs.length }));
  for (const s of state) {
    if (s.need < 0 || s.need > s.unk) return { hits, total: 0, minUsed: 0, maxUsed: -1 };
  }

  const cellCons: number[][] = Array.from({ length: varCount }, () => []);
  constraints.forEach((c, ci) => {
    for (const idx of c.idxs) cellCons[idx].push(ci);
  });

  const bits = new Uint8Array(varCount);
  let total = 0;
  let minUsed = Number.POSITIVE_INFINITY;
  let maxUsed = -1;

  const undo = (i: number, bit: number, touched: number) => {
    for (let k = 0; k < touched; k++) {
      const s = state[cellCons[i][k]];
      if (bit === 1) s.need++;
      s.unk++;
    }
  };

  const dfs = (i: number, used: number) => {
    const left = varCount - i;
    if (used > budget) return;
    if (lowerBound && used + left + outside < budget) return;
    if (i === varCount) {
      if (lowerBound && used + outside < budget) return;
      total++;
      if (used < minUsed) minUsed = used;
      if (used > maxUsed) maxUsed = used;
      for (let k = 0; k < varCount; k++) if (bits[k]) hits[k]++;
      return;
    }
    for (const bit of [0, 1] as const) {
      if (bit === 1 && used + 1 > budget) continue;
      const list = cellCons[i];
      let touched = 0;
      let ok = true;
      for (; touched < list.length; touched++) {
        const s = state[list[touched]];
        if (bit === 1) s.need--;
        s.unk--;
        if (s.need < 0 || s.need > s.unk) {
          ok = false;
          touched++;
          break;
        }
      }
      if (!ok) {
        undo(i, bit, touched);
        continue;
      }
      bits[i] = bit;
      dfs(i + 1, used + bit);
      undo(i, bit, touched);
    }
  };

  dfs(0, 0);
  if (total === 0) return { hits, total: 0, minUsed: 0, maxUsed: -1 };
  return { hits, total, minUsed, maxUsed };
}

function componentsOf(count: number, constraints: Constraint[]): number[][] {
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  };
  for (const c of constraints) {
    for (let i = 1; i < c.idxs.length; i++) union(c.idxs[0], c.idxs[i]);
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const p = find(i);
    const g = groups.get(p);
    if (g) g.push(i);
    else groups.set(p, [i]);
  }
  return [...groups.values()];
}

interface Solved {
  probs: (number | null)[][];
  exact: boolean[][];
  certain: ("d" | "s" | null)[][];
  mode: Mode;
  solutions: number | null;
  contradiction: boolean;
}

function blankSolved(size: number, contradiction: boolean): Solved {
  return {
    probs: Array.from({ length: size }, () => Array<number | null>(size).fill(null)),
    exact: Array.from({ length: size }, () => Array<boolean>(size).fill(false)),
    certain: Array.from({ length: size }, () => Array<"d" | "s" | null>(size).fill(null)),
    mode: "exact",
    solutions: contradiction ? 0 : null,
    contradiction,
  };
}

function paintDensity(
  solved: Solved,
  cells: Var[],
  p: number,
  exact: boolean,
  certain: "d" | "s" | null,
) {
  for (const cell of cells) {
    solved.probs[cell.r][cell.c] = p;
    solved.exact[cell.r][cell.c] = exact;
    solved.certain[cell.r][cell.c] = certain;
  }
}

function finishMode(solved: Solved, size: number): void {
  let anyExact = false;
  let anyApprox = false;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (solved.probs[r][c] == null) continue;
      if (solved.exact[r][c]) anyExact = true;
      else anyApprox = true;
    }
  }
  if (anyApprox && anyExact) solved.mode = "mixed";
  else if (anyApprox) solved.mode = "approx";
  else solved.mode = "exact";
}

function listUnknowns(grid: Mark[][], size: number): Var[] {
  const cells: Var[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c].t === "u") cells.push({ r, c });
    }
  }
  return cells;
}

function probabilities(grid: Mark[][], size: number, totalDiamonds: number): Solved {
  const model = buildModel(grid, size, totalDiamonds);
  if (model === "bad") return blankSolved(size, true);

  const solved = blankSolved(size, false);
  const unknowns = listUnknowns(grid, size);
  if (unknowns.length === 0) {
    solved.solutions = model.budget === 0 ? 1 : 0;
    solved.contradiction = model.budget !== 0;
    solved.mode = "exact";
    return solved;
  }

  if (model.vars.length === 0) {
    // 开局或没有任何数字约束：按文档用剩余密度，并标明近似。
    const p = model.budget / unknowns.length;
    paintDensity(solved, unknowns, p, false, null);
    solved.mode = "approx";
    solved.solutions = null;
    return solved;
  }

  const writeFrontier = (
    vars: Var[],
    result: EnumResult,
    localIndex: number[],
  ) => {
    for (let i = 0; i < localIndex.length; i++) {
      const cell = vars[localIndex[i]];
      const hits = result.hits[i];
      solved.probs[cell.r][cell.c] = hits / result.total;
      solved.exact[cell.r][cell.c] = true;
      if (hits === 0) solved.certain[cell.r][cell.c] = "s";
      else if (hits === result.total) solved.certain[cell.r][cell.c] = "d";
    }
  };

  const outsideCells = unknowns.filter((cell) => {
    return !model.vars.some((v) => v.r === cell.r && v.c === cell.c);
  });

  if (model.vars.length <= ENUM_LIMIT) {
    const result = enumerate(model.constraints, model.vars.length, model.budget, model.outside, true);
    if (result.total === 0) return blankSolved(size, true);
    writeFrontier(
      model.vars,
      result,
      model.vars.map((_, i) => i),
    );
    applyOutside(solved, outsideCells, model.budget, result.minUsed, result.maxUsed, model.outside);
    if (solved.contradiction) return blankSolved(size, true);
    solved.solutions = result.total;
    finishMode(solved, size);
    return solved;
  }

  // 前沿太大：拆成互不重叠的约束块，每块仍 ≤ 16 就逐块精确枚举。
  const groups = componentsOf(model.vars.length, model.constraints);
  if (groups.some((g) => g.length > ENUM_LIMIT)) {
    const p = model.budget / unknowns.length;
    paintDensity(solved, unknowns, p, false, null);
    solved.mode = "approx";
    return solved;
  }

  let sumMin = 0;
  let sumMax = 0;
  let fixed = true;
  let solutions = 1;
  for (const group of groups) {
    const map = new Map<number, number>();
    group.forEach((old, i) => map.set(old, i));
    const localCons: Constraint[] = [];
    for (const c of model.constraints) {
      if (!map.has(c.idxs[0])) continue;
      localCons.push({ need: c.need, idxs: c.idxs.map((idx) => map.get(idx)!) });
    }
    const result = enumerate(localCons, group.length, model.budget, 0, false);
    if (result.total === 0) return blankSolved(size, true);
    const localVars = group.map((idx) => model.vars[idx]);
    writeFrontier(
      localVars,
      result,
      localVars.map((_, i) => i),
    );
    sumMin += result.minUsed;
    sumMax += result.maxUsed;
    if (result.minUsed !== result.maxUsed) fixed = false;
    if (solutions <= 1e12) solutions *= result.total;
  }

  if (sumMin > model.budget || sumMax + model.outside < model.budget) {
    return blankSolved(size, true);
  }

  if (fixed) {
    applyOutside(solved, outsideCells, model.budget, sumMin, sumMax, model.outside);
  } else {
    let expected = 0;
    for (const cell of model.vars) {
      const p = solved.probs[cell.r][cell.c];
      if (p != null) expected += p;
    }
    const remain = Math.min(model.outside, Math.max(0, model.budget - expected));
    const p = model.outside === 0 ? 0 : remain / model.outside;
    paintDensity(solved, outsideCells, p, false, null);
  }

  if (solved.contradiction) return blankSolved(size, true);
  solved.solutions = solutions > 1e12 ? null : solutions;
  finishMode(solved, size);
  return solved;
}

function applyOutside(
  solved: Solved,
  outsideCells: Var[],
  budget: number,
  minUsed: number,
  maxUsed: number,
  outside: number,
) {
  if (outsideCells.length === 0) return;
  if (minUsed === maxUsed) {
    const k = budget - minUsed;
    if (k < 0 || k > outside) {
      solved.contradiction = true;
      return;
    }
    const certain = k === 0 ? "s" : k === outside ? "d" : null;
    paintDensity(solved, outsideCells, outside === 0 ? 0 : k / outside, true, certain);
    return;
  }
  const remain = Math.min(outside, Math.max(0, budget - (minUsed + maxUsed) / 2));
  paintDensity(solved, outsideCells, remain / outside, false, null);
}

function enumerateAllUnknowns(grid: Mark[][], size: number, totalDiamonds: number): Solved | null {
  const unknowns = listUnknowns(grid, size);
  if (unknowns.length === 0 || unknowns.length > ENUM_LIMIT) return null;

  let marked = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) if (grid[r][c].t === "d") marked++;
  }
  const budget = totalDiamonds - marked;
  if (budget < 0 || budget > unknowns.length) return blankSolved(size, true);

  const index = new Map<string, number>();
  unknowns.forEach((cell, i) => index.set(keyOf(cell.r, cell.c), i));
  const constraints: Constraint[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = grid[r][c];
      if (cell.t !== "n") continue;
      let need = cell.v;
      const idxs: number[] = [];
      for (const nb of neighbors(r, c, size)) {
        const m = grid[nb.r][nb.c];
        if (m.t === "d") need--;
        else if (m.t === "u") {
          const id = index.get(keyOf(nb.r, nb.c));
          if (id !== undefined) idxs.push(id);
        }
      }
      if (need < 0 || need > idxs.length) return blankSolved(size, true);
      if (idxs.length > 0) constraints.push({ idxs, need });
    }
  }

  const result = enumerate(constraints, unknowns.length, budget, 0, true);
  if (result.total === 0) return blankSolved(size, true);
  const solved = blankSolved(size, false);
  for (let i = 0; i < unknowns.length; i++) {
    const cell = unknowns[i];
    const hits = result.hits[i];
    solved.probs[cell.r][cell.c] = hits / result.total;
    solved.exact[cell.r][cell.c] = true;
    if (hits === 0) solved.certain[cell.r][cell.c] = "s";
    else if (hits === result.total) solved.certain[cell.r][cell.c] = "d";
  }
  solved.solutions = result.total;
  solved.mode = "exact";
  return solved;
}

function propagate(grid: Mark[][], size: number, totalDiamonds: number): "bad" | Mark[][] {
  const next = cloneGrid(grid);
  let guard = 0;
  while (guard++ < size * size + 2) {
    let changed = false;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = next[r][c];
        if (cell.t !== "n") continue;
        let diamonds = 0;
        const unk: Var[] = [];
        for (const nb of neighbors(r, c, size)) {
          const m = next[nb.r][nb.c];
          if (m.t === "d") diamonds++;
          else if (m.t === "u") unk.push(nb);
        }
        const remain = cell.v - diamonds;
        if (remain < 0 || remain > unk.length) return "bad";
        if (unk.length === 0) continue;
        if (remain === 0) {
          for (const u of unk) {
            next[u.r][u.c] = { t: "s" };
            changed = true;
          }
        } else if (remain === unk.length) {
          for (const u of unk) {
            next[u.r][u.c] = { t: "d" };
            changed = true;
          }
        }
      }
    }

    let diamonds = 0;
    let unknown = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const m = next[r][c];
        if (m.t === "d") diamonds++;
        else if (m.t === "u") unknown++;
      }
    }
    if (diamonds > totalDiamonds || diamonds + unknown < totalDiamonds) return "bad";
    if (unknown > 0 && diamonds === totalDiamonds) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (next[r][c].t === "u") {
            next[r][c] = { t: "s" };
            changed = true;
          }
        }
      }
    } else if (unknown > 0 && diamonds + unknown === totalDiamonds) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (next[r][c].t === "u") {
            next[r][c] = { t: "d" };
            changed = true;
          }
        }
      }
    }
    if (!changed) return next;
  }
  return next;
}

function applyCertain(grid: Mark[][], solved: Solved, size: number): boolean {
  let changed = false;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const flag = solved.certain[r][c];
      if (!flag || grid[r][c].t !== "u") continue;
      grid[r][c] = flag === "d" ? { t: "d" } : { t: "s" };
      changed = true;
    }
  }
  return changed;
}

function countKinds(grid: Mark[][]) {
  let diamonds = 0;
  let safes = 0;
  let unknowns = 0;
  let filled = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.t === "d") diamonds++;
      else if (cell.t === "s") safes++;
      else if (cell.t === "u") unknowns++;
      if (cell.t !== "u") filled++;
    }
  }
  return { diamonds, safes, unknowns, filled };
}

export function violationMap(grid: Mark[][], size: number, totalDiamonds: number): boolean[][] {
  const map = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = grid[r][c];
      if (cell.t !== "n") continue;
      let diamonds = 0;
      let unknown = 0;
      for (const nb of neighbors(r, c, size)) {
        const m = grid[nb.r][nb.c];
        if (m.t === "d") diamonds++;
        else if (m.t === "u") unknown++;
      }
      if (diamonds > cell.v || diamonds + unknown < cell.v) map[r][c] = true;
    }
  }
  let diamonds = 0;
  let unknown = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c].t === "d") diamonds++;
      else if (grid[r][c].t === "u") unknown++;
    }
  }
  if (diamonds > totalDiamonds || diamonds + unknown < totalDiamonds) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) if (grid[r][c].t === "n") map[r][c] = true;
    }
  }
  return map;
}

function recommendOf(grid: Mark[][], probs: (number | null)[][], size: number) {
  let best: { r: number; c: number; p: number; info: number; dist: number } | null = null;
  const mid = (size - 1) / 2;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const p = probs[r][c];
      if (p == null) continue;
      let info = 0;
      for (const nb of neighbors(r, c, size)) {
        if (grid[nb.r][nb.c].t === "n") info++;
      }
      const cand = {
        r,
        c,
        p,
        info,
        dist: Math.abs(r - mid) + Math.abs(c - mid),
      };
      if (
        !best ||
        cand.p > best.p + 1e-12 ||
        (Math.abs(cand.p - best.p) <= 1e-12 &&
          (cand.info > best.info ||
            (cand.info === best.info &&
              (cand.dist < best.dist ||
                (cand.dist === best.dist && (cand.r < best.r || (cand.r === best.r && cand.c < best.c)))))))
      ) {
        best = cand;
      }
    }
  }
  return best ? { r: best.r, c: best.c } : null;
}

function emptyAnalysis(input: Mark[][], size: BoardSize, contradiction: boolean): Analysis {
  const totalDiamonds = diamondTotal(size);
  const counts = countKinds(input);
  return {
    grid: cloneGrid(input),
    probs: Array.from({ length: size }, () => Array<number | null>(size).fill(null)),
    exact: Array.from({ length: size }, () => Array<boolean>(size).fill(false)),
    mode: "exact",
    contradiction,
    solutions: contradiction ? 0 : null,
    recommend: null,
    ...counts,
    totalDiamonds,
    violations: violationMap(input, size, totalDiamonds),
  };
}

export function analyze(input: Mark[][], size: BoardSize): Analysis {
  const totalDiamonds = diamondTotal(size);
  let grid = cloneGrid(input);

  for (let pass = 0; pass < size * size + 2; pass++) {
    const propagated = propagate(grid, size, totalDiamonds);
    if (propagated === "bad") return emptyAnalysis(input, size, true);
    grid = propagated;

    const small = enumerateAllUnknowns(grid, size, totalDiamonds);
    const solved = small ?? probabilities(grid, size, totalDiamonds);
    if (solved.contradiction) return emptyAnalysis(input, size, true);

    const marked = applyCertain(grid, solved, size);
    if (marked) continue;

    const counts = countKinds(grid);
    return {
      grid,
      probs: solved.probs,
      exact: solved.exact,
      mode: counts.unknowns === 0 ? "exact" : solved.mode,
      contradiction: false,
      solutions: solved.solutions,
      recommend: recommendOf(grid, solved.probs, size),
      ...counts,
      totalDiamonds,
      violations: violationMap(grid, size, totalDiamonds),
    };
  }

  return emptyAnalysis(input, size, true);
}
