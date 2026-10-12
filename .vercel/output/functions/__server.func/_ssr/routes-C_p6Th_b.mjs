import { i as __toESM } from "../_runtime.mjs";
import { K as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-C_p6Th_b.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var BOARD_SIZES = [
	8,
	10,
	12
];
function diamondTotal(size) {
	if (size === 8) return 20;
	if (size === 10) return 30;
	return 45;
}
var ENUM_LIMIT = 16;
function emptyGrid(size) {
	return Array.from({ length: size }, () => Array.from({ length: size }, () => ({ t: "u" })));
}
function cloneGrid(grid) {
	return grid.map((row) => row.map((cell) => ({ ...cell })));
}
function sameMark(a, b) {
	if (a.t !== b.t) return false;
	if (a.t === "n" && b.t === "n") return a.v === b.v;
	return true;
}
function sameGrid(a, b) {
	for (let r = 0; r < a.length; r++) for (let c = 0; c < a[r].length; c++) if (!sameMark(a[r][c], b[r][c])) return false;
	return true;
}
function percentNumber(p) {
	return Math.round(p * 100);
}
function tierOf(p) {
	const n = percentNumber(p);
	if (n >= 50) return "high";
	if (n >= 20) return "mid";
	return "low";
}
function neighbors(r, c, size) {
	const out = [];
	for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
		if (dr === 0 && dc === 0) continue;
		const rr = r + dr;
		const cc = c + dc;
		if (rr >= 0 && cc >= 0 && rr < size && cc < size) out.push({
			r: rr,
			c: cc
		});
	}
	return out;
}
function keyOf(r, c) {
	return `${r},${c}`;
}
function buildModel(grid, size, totalDiamonds) {
	let marked = 0;
	let unknown = 0;
	for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
		const cell = grid[r][c];
		if (cell.t === "d") marked++;
		else if (cell.t === "u") unknown++;
	}
	const budget = totalDiamonds - marked;
	if (budget < 0 || budget > unknown) return "bad";
	const index = /* @__PURE__ */ new Map();
	const vars = [];
	const raw = [];
	for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
		const cell = grid[r][c];
		if (cell.t !== "n") continue;
		let need = cell.v;
		const cells = [];
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
		raw.push({
			cells,
			need
		});
	}
	for (const group of raw) for (const cell of group.cells) {
		const k = keyOf(cell.r, cell.c);
		if (!index.has(k)) {
			index.set(k, vars.length);
			vars.push(cell);
		}
	}
	return {
		vars,
		constraints: raw.map((group) => ({
			need: group.need,
			idxs: group.cells.map((cell) => index.get(keyOf(cell.r, cell.c)))
		})),
		outside: unknown - vars.length,
		budget
	};
}
/**
* 回溯枚举。赋值过程中若某约束钻石过多，或剩下的格子不够补齐数字，立刻剪枝。
* lowerBound 为真时，还要求最终钻石数能刚好用完预算（外围空格来补）。
*/
function enumerate(constraints, varCount, budget, outside, lowerBound) {
	const hits = new Array(varCount).fill(0);
	if (varCount === 0) {
		if (!(budget >= 0 && budget <= outside)) return {
			hits,
			total: 0,
			minUsed: 0,
			maxUsed: 0
		};
		return {
			hits,
			total: 1,
			minUsed: 0,
			maxUsed: 0
		};
	}
	const state = constraints.map((c) => ({
		need: c.need,
		unk: c.idxs.length
	}));
	for (const s of state) if (s.need < 0 || s.need > s.unk) return {
		hits,
		total: 0,
		minUsed: 0,
		maxUsed: -1
	};
	const cellCons = Array.from({ length: varCount }, () => []);
	constraints.forEach((c, ci) => {
		for (const idx of c.idxs) cellCons[idx].push(ci);
	});
	const bits = new Uint8Array(varCount);
	let total = 0;
	let minUsed = Number.POSITIVE_INFINITY;
	let maxUsed = -1;
	const undo = (i, bit, touched) => {
		for (let k = 0; k < touched; k++) {
			const s = state[cellCons[i][k]];
			if (bit === 1) s.need++;
			s.unk++;
		}
	};
	const dfs = (i, used) => {
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
		for (const bit of [0, 1]) {
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
	if (total === 0) return {
		hits,
		total: 0,
		minUsed: 0,
		maxUsed: -1
	};
	return {
		hits,
		total,
		minUsed,
		maxUsed
	};
}
function componentsOf(count, constraints) {
	const parent = Array.from({ length: count }, (_, i) => i);
	const find = (x) => {
		let root = x;
		while (parent[root] !== root) root = parent[root];
		while (parent[x] !== root) {
			const next = parent[x];
			parent[x] = root;
			x = next;
		}
		return root;
	};
	const union = (a, b) => {
		const pa = find(a);
		const pb = find(b);
		if (pa !== pb) parent[pa] = pb;
	};
	for (const c of constraints) for (let i = 1; i < c.idxs.length; i++) union(c.idxs[0], c.idxs[i]);
	const groups = /* @__PURE__ */ new Map();
	for (let i = 0; i < count; i++) {
		const p = find(i);
		const g = groups.get(p);
		if (g) g.push(i);
		else groups.set(p, [i]);
	}
	return [...groups.values()];
}
function blankSolved(size, contradiction) {
	return {
		probs: Array.from({ length: size }, () => Array(size).fill(null)),
		exact: Array.from({ length: size }, () => Array(size).fill(false)),
		certain: Array.from({ length: size }, () => Array(size).fill(null)),
		mode: "exact",
		solutions: contradiction ? 0 : null,
		contradiction
	};
}
function paintDensity(solved, cells, p, exact, certain) {
	for (const cell of cells) {
		solved.probs[cell.r][cell.c] = p;
		solved.exact[cell.r][cell.c] = exact;
		solved.certain[cell.r][cell.c] = certain;
	}
}
function finishMode(solved, size) {
	let anyExact = false;
	let anyApprox = false;
	for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
		if (solved.probs[r][c] == null) continue;
		if (solved.exact[r][c]) anyExact = true;
		else anyApprox = true;
	}
	if (anyApprox && anyExact) solved.mode = "mixed";
	else if (anyApprox) solved.mode = "approx";
	else solved.mode = "exact";
}
function listUnknowns(grid, size) {
	const cells = [];
	for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (grid[r][c].t === "u") cells.push({
		r,
		c
	});
	return cells;
}
function probabilities(grid, size, totalDiamonds) {
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
		paintDensity(solved, unknowns, model.budget / unknowns.length, false, null);
		solved.mode = "approx";
		solved.solutions = null;
		return solved;
	}
	const writeFrontier = (vars, result, localIndex) => {
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
		writeFrontier(model.vars, result, model.vars.map((_, i) => i));
		applyOutside(solved, outsideCells, model.budget, result.minUsed, result.maxUsed, model.outside);
		if (solved.contradiction) return blankSolved(size, true);
		solved.solutions = result.total;
		finishMode(solved, size);
		return solved;
	}
	const groups = componentsOf(model.vars.length, model.constraints);
	if (groups.some((g) => g.length > ENUM_LIMIT)) {
		paintDensity(solved, unknowns, model.budget / unknowns.length, false, null);
		solved.mode = "approx";
		return solved;
	}
	let sumMin = 0;
	let sumMax = 0;
	let fixed = true;
	let solutions = 1;
	for (const group of groups) {
		const map = /* @__PURE__ */ new Map();
		group.forEach((old, i) => map.set(old, i));
		const localCons = [];
		for (const c of model.constraints) {
			if (!map.has(c.idxs[0])) continue;
			localCons.push({
				need: c.need,
				idxs: c.idxs.map((idx) => map.get(idx))
			});
		}
		const result = enumerate(localCons, group.length, model.budget, 0, false);
		if (result.total === 0) return blankSolved(size, true);
		const localVars = group.map((idx) => model.vars[idx]);
		writeFrontier(localVars, result, localVars.map((_, i) => i));
		sumMin += result.minUsed;
		sumMax += result.maxUsed;
		if (result.minUsed !== result.maxUsed) fixed = false;
		if (solutions <= 0xe8d4a51000) solutions *= result.total;
	}
	if (sumMin > model.budget || sumMax + model.outside < model.budget) return blankSolved(size, true);
	if (fixed) applyOutside(solved, outsideCells, model.budget, sumMin, sumMax, model.outside);
	else {
		let expected = 0;
		for (const cell of model.vars) {
			const p = solved.probs[cell.r][cell.c];
			if (p != null) expected += p;
		}
		const remain = Math.min(model.outside, Math.max(0, model.budget - expected));
		paintDensity(solved, outsideCells, model.outside === 0 ? 0 : remain / model.outside, false, null);
	}
	if (solved.contradiction) return blankSolved(size, true);
	solved.solutions = solutions > 0xe8d4a51000 ? null : solutions;
	finishMode(solved, size);
	return solved;
}
function applyOutside(solved, outsideCells, budget, minUsed, maxUsed, outside) {
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
	paintDensity(solved, outsideCells, Math.min(outside, Math.max(0, budget - (minUsed + maxUsed) / 2)) / outside, false, null);
}
function enumerateAllUnknowns(grid, size, totalDiamonds) {
	const unknowns = listUnknowns(grid, size);
	if (unknowns.length === 0 || unknowns.length > ENUM_LIMIT) return null;
	let marked = 0;
	for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (grid[r][c].t === "d") marked++;
	const budget = totalDiamonds - marked;
	if (budget < 0 || budget > unknowns.length) return blankSolved(size, true);
	const index = /* @__PURE__ */ new Map();
	unknowns.forEach((cell, i) => index.set(keyOf(cell.r, cell.c), i));
	const constraints = [];
	for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
		const cell = grid[r][c];
		if (cell.t !== "n") continue;
		let need = cell.v;
		const idxs = [];
		for (const nb of neighbors(r, c, size)) {
			const m = grid[nb.r][nb.c];
			if (m.t === "d") need--;
			else if (m.t === "u") {
				const id = index.get(keyOf(nb.r, nb.c));
				if (id !== void 0) idxs.push(id);
			}
		}
		if (need < 0 || need > idxs.length) return blankSolved(size, true);
		if (idxs.length > 0) constraints.push({
			idxs,
			need
		});
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
function propagate(grid, size, totalDiamonds) {
	const next = cloneGrid(grid);
	let guard = 0;
	while (guard++ < size * size + 2) {
		let changed = false;
		for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
			const cell = next[r][c];
			if (cell.t !== "n") continue;
			let diamonds = 0;
			const unk = [];
			for (const nb of neighbors(r, c, size)) {
				const m = next[nb.r][nb.c];
				if (m.t === "d") diamonds++;
				else if (m.t === "u") unk.push(nb);
			}
			const remain = cell.v - diamonds;
			if (remain < 0 || remain > unk.length) return "bad";
			if (unk.length === 0) continue;
			if (remain === 0) for (const u of unk) {
				next[u.r][u.c] = { t: "s" };
				changed = true;
			}
			else if (remain === unk.length) for (const u of unk) {
				next[u.r][u.c] = { t: "d" };
				changed = true;
			}
		}
		let diamonds = 0;
		let unknown = 0;
		for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
			const m = next[r][c];
			if (m.t === "d") diamonds++;
			else if (m.t === "u") unknown++;
		}
		if (diamonds > totalDiamonds || diamonds + unknown < totalDiamonds) return "bad";
		if (unknown > 0 && diamonds === totalDiamonds) {
			for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (next[r][c].t === "u") {
				next[r][c] = { t: "s" };
				changed = true;
			}
		} else if (unknown > 0 && diamonds + unknown === totalDiamonds) {
			for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (next[r][c].t === "u") {
				next[r][c] = { t: "d" };
				changed = true;
			}
		}
		if (!changed) return next;
	}
	return next;
}
function applyCertain(grid, solved, size) {
	let changed = false;
	for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
		const flag = solved.certain[r][c];
		if (!flag || grid[r][c].t !== "u") continue;
		grid[r][c] = flag === "d" ? { t: "d" } : { t: "s" };
		changed = true;
	}
	return changed;
}
function countKinds(grid) {
	let diamonds = 0;
	let safes = 0;
	let unknowns = 0;
	let filled = 0;
	for (const row of grid) for (const cell of row) {
		if (cell.t === "d") diamonds++;
		else if (cell.t === "s") safes++;
		else if (cell.t === "u") unknowns++;
		if (cell.t !== "u") filled++;
	}
	return {
		diamonds,
		safes,
		unknowns,
		filled
	};
}
function violationMap(grid, size, totalDiamonds) {
	const map = Array.from({ length: size }, () => Array(size).fill(false));
	for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
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
	let diamonds = 0;
	let unknown = 0;
	for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (grid[r][c].t === "d") diamonds++;
	else if (grid[r][c].t === "u") unknown++;
	if (diamonds > totalDiamonds || diamonds + unknown < totalDiamonds) {
		for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (grid[r][c].t === "n") map[r][c] = true;
	}
	return map;
}
function recommendOf(grid, probs, size) {
	let best = null;
	const mid = (size - 1) / 2;
	for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
		const p = probs[r][c];
		if (p == null) continue;
		let info = 0;
		for (const nb of neighbors(r, c, size)) if (grid[nb.r][nb.c].t === "n") info++;
		const cand = {
			r,
			c,
			p,
			info,
			dist: Math.abs(r - mid) + Math.abs(c - mid)
		};
		if (!best || cand.p > best.p + 1e-12 || Math.abs(cand.p - best.p) <= 1e-12 && (cand.info > best.info || cand.info === best.info && (cand.dist < best.dist || cand.dist === best.dist && (cand.r < best.r || cand.r === best.r && cand.c < best.c)))) best = cand;
	}
	return best ? {
		r: best.r,
		c: best.c
	} : null;
}
function emptyAnalysis(input, size, contradiction) {
	const totalDiamonds = diamondTotal(size);
	const counts = countKinds(input);
	return {
		grid: cloneGrid(input),
		probs: Array.from({ length: size }, () => Array(size).fill(null)),
		exact: Array.from({ length: size }, () => Array(size).fill(false)),
		mode: "exact",
		contradiction,
		solutions: contradiction ? 0 : null,
		recommend: null,
		...counts,
		totalDiamonds,
		violations: violationMap(input, size, totalDiamonds)
	};
}
function analyze(input, size) {
	const totalDiamonds = diamondTotal(size);
	let grid = cloneGrid(input);
	for (let pass = 0; pass < size * size + 2; pass++) {
		const propagated = propagate(grid, size, totalDiamonds);
		if (propagated === "bad") return emptyAnalysis(input, size, true);
		grid = propagated;
		const solved = enumerateAllUnknowns(grid, size, totalDiamonds) ?? probabilities(grid, size, totalDiamonds);
		if (solved.contradiction) return emptyAnalysis(input, size, true);
		if (applyCertain(grid, solved, size)) continue;
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
			violations: violationMap(grid, size, totalDiamonds)
		};
	}
	return emptyAnalysis(input, size, true);
}
function toolMark(tool) {
	if (tool.t === "select") return null;
	if (tool.t === "n") return {
		t: "n",
		v: tool.v
	};
	return { t: tool.t };
}
function placeMenu(el) {
	const rect = el.getBoundingClientRect();
	const width = 276;
	const height = 148;
	let left = rect.left + rect.width / 2 - width / 2;
	let top = rect.bottom + 8;
	left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
	if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8);
	return {
		left,
		top
	};
}
function cellText(mark, prob) {
	if (mark.t === "d") return "💎";
	if (mark.t === "s") return "×";
	if (mark.t === "n") return String(mark.v);
	if (prob == null) return "";
	return `${percentNumber(prob)}%`;
}
function modeCopy(mode, bad) {
	if (bad) return "标记矛盾";
	if (mode === "exact") return "精确模式";
	if (mode === "mixed") return "近似模式 · 约束格精确";
	return "近似模式";
}
function TideApp() {
	const [size, setSize] = (0, import_react.useState)(8);
	const [grid, setGrid] = (0, import_react.useState)(() => emptyGrid(8));
	const [past, setPast] = (0, import_react.useState)([]);
	const [tool, setTool] = (0, import_react.useState)({ t: "select" });
	const [selected, setSelected] = (0, import_react.useState)(null);
	const [menu, setMenu] = (0, import_react.useState)(null);
	const [note, setNote] = (0, import_react.useState)(null);
	const gridRef = (0, import_react.useRef)(grid);
	const pastRef = (0, import_react.useRef)(past);
	const sizeRef = (0, import_react.useRef)(size);
	const selectedRef = (0, import_react.useRef)(selected);
	gridRef.current = grid;
	pastRef.current = past;
	sizeRef.current = size;
	selectedRef.current = selected;
	const analysis = (0, import_react.useMemo)(() => analyze(grid, size), [grid, size]);
	const analysisRef = (0, import_react.useRef)(analysis);
	analysisRef.current = analysis;
	const display = analysis.contradiction ? grid : analysis.grid;
	const remain = diamondTotal(size) - analysis.diamonds;
	function paint(r, c, mark) {
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
	function paintRef(r, c, mark) {
		paint(r, c, mark);
	}
	(0, import_react.useEffect)(() => {
		function onKey(e) {
			const target = e.target;
			if (target?.closest("input, textarea, [contenteditable='true']")) return;
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
				e.preventDefault();
				undo();
				return;
			}
			if (target?.closest("[data-toolbar], [data-actions], [data-menu], [data-sizes]") && !e.key.startsWith("Arrow") && e.key !== "Escape") return;
			const n = sizeRef.current;
			let pos = selectedRef.current;
			const move = {
				ArrowUp: [-1, 0],
				ArrowDown: [1, 0],
				ArrowLeft: [0, -1],
				ArrowRight: [0, 1]
			};
			if (!pos && (move[e.key] || e.key >= "0" && e.key <= "8" || e.key === "Enter" || e.key === "x" || e.key === "X" || e.key === "Delete" || e.key === "Backspace")) {
				pos = analysisRef.current.recommend ?? {
					r: 0,
					c: 0
				};
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
					c: Math.min(n - 1, Math.max(0, pos.c + dc))
				};
				selectedRef.current = next;
				setSelected(next);
				setMenu(null);
				document.querySelector(`[data-r="${next.r}"][data-c="${next.c}"]`)?.focus();
				return;
			}
			let mark = null;
			if (e.key >= "0" && e.key <= "8") mark = {
				t: "n",
				v: Number(e.key)
			};
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
	(0, import_react.useEffect)(() => {
		if (!menu) return;
		function onPointer(e) {
			if (e.target?.closest("[data-menu], [data-cell]")) return;
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
	function onCellClick(r, c, el) {
		setSelected({
			r,
			c
		});
		selectedRef.current = {
			r,
			c
		};
		const mark = toolMark(tool);
		if (mark) {
			paint(r, c, mark);
			setMenu(null);
			return;
		}
		setMenu({
			r,
			c,
			...placeMenu(el)
		});
	}
	function changeSize(next) {
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
		for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!sameMark(analysis.grid[r][c], grid[r][c])) added++;
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
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "tide-page",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "sheet",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "mast",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "潮汐秘境计算器" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "lede",
						children: "把游戏里已经翻开的格子填进来。这里只推导和算概率，不会自己生成钻石布局。"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "topbar",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "sizes",
						"data-sizes": true,
						role: "group",
						"aria-label": "棋盘尺寸",
						children: BOARD_SIZES.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: n === size ? "is-on" : void 0,
							"aria-pressed": n === size,
							onClick: () => changeSize(n),
							children: [
								n,
								"×",
								n
							]
						}, n))
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "usage",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["剩余 ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: remain })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["已用 ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: analysis.diamonds })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["已填 ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: analysis.filled })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mode",
								"data-mode": mode,
								children: modeCopy(analysis.mode, analysis.contradiction)
							})
						]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "tools",
					"data-toolbar": true,
					role: "toolbar",
					"aria-label": "单击涂",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "tools-label",
							children: "单击涂"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: tool.t === "select" ? "is-on" : void 0,
							"aria-pressed": tool.t === "select",
							onClick: () => setTool({ t: "select" }),
							children: "选择"
						}),
						Array.from({ length: 9 }, (_, v) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: tool.t === "n" && tool.v === v ? "is-on" : void 0,
							"aria-pressed": tool.t === "n" && tool.v === v,
							"aria-label": `涂数字 ${v}`,
							onClick: () => setTool({
								t: "n",
								v
							}),
							children: v
						}, v)),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: tool.t === "d" ? "is-on" : void 0,
							"aria-pressed": tool.t === "d",
							"aria-label": "涂钻石",
							onClick: () => setTool({ t: "d" }),
							children: "💎"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: tool.t === "s" ? "is-on" : void 0,
							"aria-pressed": tool.t === "s",
							"aria-label": "涂排除",
							onClick: () => setTool({ t: "s" }),
							children: "×"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: tool.t === "u" ? "is-on" : void 0,
							"aria-pressed": tool.t === "u",
							onClick: () => setTool({ t: "u" }),
							children: "清除"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "legend",
							children: "蓝 <20% · 棕 20–49% · 红 ≥50%。虚线是未翻开，实线红框并闪烁的是推荐格。"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "board-frame",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "board-wrap",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "board",
							role: "grid",
							"aria-label": `${size} 乘 ${size} 棋盘`,
							style: { ["--n"]: String(size) },
							children: display.map((row, r) => row.map((cell, c) => {
								const prob = analysis.contradiction ? null : analysis.probs[r][c];
								const rec = recommend?.r === r && recommend?.c === c;
								const tier = prob == null ? void 0 : tierOf(prob);
								const text = cellText(cell, prob);
								const conflict = analysis.violations[r][c];
								const classes = [
									"cell",
									rec ? "is-rec" : "",
									selected?.r === r && selected?.c === c ? "is-selected" : "",
									conflict ? "is-conflict" : ""
								].filter(Boolean).join(" ");
								return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									role: "gridcell",
									"data-cell": "",
									"data-r": r,
									"data-c": c,
									"data-kind": cell.t,
									"data-n": cell.t === "n" ? cell.v : void 0,
									"data-tier": tier,
									"data-rec": rec ? "1" : void 0,
									className: classes,
									"aria-label": `${r + 1}行${c + 1}列 ${text || "未翻开"}`,
									onClick: (e) => onCellClick(r, c, e.currentTarget),
									onContextMenu: (e) => {
										e.preventDefault();
										setSelected({
											r,
											c
										});
										selectedRef.current = {
											r,
											c
										};
										paint(r, c, { t: "d" });
										setMenu(null);
									},
									children: text
								}, `${r}-${c}`);
							}))
						})
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", {
					className: "dock",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "next",
							"data-next": true,
							"data-bad": analysis.contradiction ? "1" : "0",
							children: nextLine
						}),
						selected ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "subline",
							children: [
								"当前 ",
								selected.r + 1,
								"行",
								selected.c + 1,
								"列",
								analysis.solutions != null && !analysis.contradiction ? analysis.unknowns <= 16 ? ` · ${analysis.solutions.toLocaleString("zh-CN")} 种合法布局` : ` · 约束组合 ${analysis.solutions.toLocaleString("zh-CN")} 种` : ""
							]
						}) : analysis.solutions != null && !analysis.contradiction ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "subline",
							children: analysis.unknowns <= 16 ? `${analysis.solutions.toLocaleString("zh-CN")} 种合法布局` : `约束组合 ${analysis.solutions.toLocaleString("zh-CN")} 种`
						}) : null,
						note ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "subline",
							children: note
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "pills",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["必定是钻石 ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: analysis.diamonds })] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["必定不是钻石 ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: analysis.safes })] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["待定 ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: analysis.unknowns })] })
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "actions",
							"data-actions": true,
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: undo,
									disabled: past.length === 0,
									children: "撤销"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									className: "primary",
									onClick: commitDeduction,
									children: "自动推导"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: clearBoard,
									children: "清空棋盘"
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "keys",
							children: "数字键 0–8 填数 · Enter 标钻石 · X 排除 · Delete 清除 · 右键标钻石 · Ctrl+Z 撤销"
						})
					]
				}),
				menu ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "menu",
					"data-menu": true,
					role: "dialog",
					"aria-label": "标记格子",
					style: {
						left: menu.left,
						top: menu.top
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "menu-nums",
						children: Array.from({ length: 9 }, (_, v) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => {
								paint(menu.r, menu.c, {
									t: "n",
									v
								});
								setMenu(null);
							},
							children: v
						}, v))
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "menu-ops",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									paint(menu.r, menu.c, { t: "d" });
									setMenu(null);
								},
								children: "💎 钻石"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									paint(menu.r, menu.c, { t: "s" });
									setMenu(null);
								},
								children: "× 排除"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									paint(menu.r, menu.c, { t: "u" });
									setMenu(null);
								},
								children: "清除"
							})
						]
					})]
				}) : null
			]
		})
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TideApp, {});
}
//#endregion
export { Home as component };
