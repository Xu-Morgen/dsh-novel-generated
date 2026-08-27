/**
 * I70 C5 分支比较的最小行 diff（design §14.10「正文版本与分支」/ R14-5）。
 *
 * 契约与不变式：
 * - 纯函数、确定性：相同输入恒产生相同输出，无随机、无时间、无外部依赖。
 * - 输入按 `\r?\n` 拆行做 LCS 最长公共子序列 diff；输出是 `del → add → same` 的
 *   稳定行序列（同一行在两个分支中顺序出现时保守判定为 same，不做移动检测）。
 * - 空文本拆分为零行；`\n` 结尾不产生尾部空行（与 docs 镜像的段落拆分习惯一致）。
 * - 本模块是 C5 文本域的派生视图：只消费正文字符串，不触达 repository 或任何层。
 */

export type DiffLineKind = 'same' | 'del' | 'add';

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
}

/** 按行比较 before → after：`del` 行只在 before、`add` 行只在 after、`same` 相同。 */
export function diffTextLines(before: string, after: string): DiffLine[] {
  const a = before.length === 0 ? [] : before.split(/\r?\n/);
  const b = after.length === 0 ? [] : after.split(/\r?\n/);
  const n = a.length;
  const m = b.length;
  // lcs[i][j]：a[i..] 与 b[j..] 的最长公共子序列长度（O(n*m) 时间、O(n*m) 空间；
  // 场景级正文行数有限，容量内可接受；确定性优先于渐进最优）。
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lines.push({ kind: 'del', text: a[i] });
      i += 1;
    } else {
      lines.push({ kind: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    lines.push({ kind: 'del', text: a[i] });
    i += 1;
  }
  while (j < m) {
    lines.push({ kind: 'add', text: b[j] });
    j += 1;
  }
  return lines;
}
