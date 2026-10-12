import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyze,
  emptyGrid,
  percentNumber,
  type Mark,
} from "./engine.ts";

function put(grid: Mark[][], row: number, col: number, mark: Mark) {
  grid[row - 1][col - 1] = mark;
}

function pct(gridSize: 8 | 10 | 12, grid: Mark[][], row: number, col: number) {
  const a = analyze(grid, gridSize);
  const p = a.probs[row - 1][col - 1];
  assert.ok(p != null, `${row}行${col}列应仍是未定格`);
  return percentNumber(p);
}

test("测试1：数字 1 旁边已有一颗钻石，其余邻居全部标 ×", () => {
  const grid = emptyGrid(8);
  put(grid, 7, 4, { t: "n", v: 1 });
  put(grid, 8, 4, { t: "d" });
  const a = analyze(grid, 8);
  assert.equal(a.contradiction, false);
  const safes = [
    [6, 3],
    [6, 4],
    [6, 5],
    [7, 3],
    [7, 5],
    [8, 3],
    [8, 5],
  ];
  for (const [r, c] of safes) {
    assert.equal(a.grid[r - 1][c - 1].t, "s", `${r}行${c}列应为 ×`);
  }
  assert.equal(a.grid[7][3].t, "d");
  assert.equal(a.grid[6][3].t, "n");
});

test("测试2：四格交叉约束均为 75%", () => {
  const grid = emptyGrid(8);
  put(grid, 2, 2, { t: "n", v: 3 });
  put(grid, 1, 3, { t: "s" });
  put(grid, 2, 3, { t: "s" });
  put(grid, 3, 2, { t: "s" });
  put(grid, 3, 3, { t: "s" });
  const a = analyze(grid, 8);
  assert.equal(a.contradiction, false);
  for (const [r, c] of [
    [1, 1],
    [1, 2],
    [2, 1],
    [3, 1],
  ] as const) {
    assert.equal(pct(8, grid, r, c), 75, `${r}行${c}列`);
  }
  assert.equal(a.solutions, 4);
});

test("测试3：重叠后左上、左为 75%，左下为 50%", () => {
  const grid = emptyGrid(8);
  put(grid, 2, 2, { t: "n", v: 3 });
  put(grid, 1, 3, { t: "s" });
  put(grid, 2, 3, { t: "s" });
  put(grid, 3, 3, { t: "s" });
  put(grid, 3, 2, { t: "n", v: 3 });
  put(grid, 4, 3, { t: "d" });
  put(grid, 4, 2, { t: "s" });
  const a = analyze(grid, 8);
  assert.equal(a.contradiction, false);
  assert.equal(pct(8, grid, 2, 1), 75);
  assert.equal(pct(8, grid, 3, 1), 75);
  assert.equal(pct(8, grid, 4, 1), 50);
  assert.equal(pct(8, grid, 1, 1), 75);
  assert.equal(pct(8, grid, 1, 2), 75);
  assert.equal(a.solutions, 4);
  assert.ok(a.recommend);
  const rr = a.recommend.r + 1;
  const cc = a.recommend.c + 1;
  assert.ok(
    (rr === 2 && cc === 1) || (rr === 3 && cc === 1),
    `推荐格应是高概率且被更多数字包围，实际 ${rr}行${cc}列`,
  );
});

test("开局用剩余密度并标为近似", () => {
  const a = analyze(emptyGrid(8), 8);
  assert.equal(a.mode, "approx");
  assert.equal(a.unknowns, 64);
  assert.equal(percentNumber(a.probs[0][0] ?? 0), 31);
  assert.ok(a.recommend);
});

test("数字互相矛盾时给出矛盾", () => {
  const grid = emptyGrid(8);
  put(grid, 1, 1, { t: "n", v: 0 });
  put(grid, 1, 2, { t: "d" });
  const a = analyze(grid, 8);
  assert.equal(a.contradiction, true);
});

test("钻石已用完时其余格子标 ×", () => {
  const grid = emptyGrid(8);
  let n = 0;
  for (let r = 0; r < 8 && n < 20; r++) {
    for (let c = 0; c < 8 && n < 20; c++) {
      grid[r][c] = { t: "d" };
      n++;
    }
  }
  const a = analyze(grid, 8);
  assert.equal(a.contradiction, false);
  assert.equal(a.diamonds, 20);
  assert.equal(a.unknowns, 0);
  assert.equal(a.safes, 44);
});

test("未定格不超过 16 时按精确总数枚举", () => {
  const grid = emptyGrid(8);
  let diamonds = 0;
  let safes = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (diamonds < 12) {
        grid[r][c] = { t: "d" };
        diamonds++;
      } else if (safes < 36) {
        grid[r][c] = { t: "s" };
        safes++;
      }
    }
  }
  const a = analyze(grid, 8);
  assert.equal(a.contradiction, false);
  assert.equal(a.mode, "exact");
  assert.equal(a.unknowns, 16);
  assert.equal(percentNumber(a.probs[7][7] ?? -1), 50);
});
