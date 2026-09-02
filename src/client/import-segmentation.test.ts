import { describe, expect, it } from 'vitest';
import { createImportInterpretationParagraphs } from '../core/schema/import-interpretation-analysis.js';
import { mergeImportParagraphWithNext, splitImportParagraph } from './import-segmentation.js';

const sourceText = '幕后真相。\n\n作者指令。😀';
const initial = [{ paragraphId: 'paragraph-0001', index: 0, text: sourceText, startOffset: 0, endOffset: sourceText.length }];

describe('I162 来源片段作者分段', () => {
  it('拆分和相邻合并保持规范原文、顺序与 range', () => {
    const split = splitImportParagraph(sourceText, initial, 'paragraph-0001', '幕后真相。\n\n'.length);
    expect(split).toEqual([
      { paragraphId: 'paragraph-0001', index: 0, text: '幕后真相。', startOffset: 0, endOffset: 5 },
      { paragraphId: 'paragraph-0002', index: 1, text: '作者指令。😀', startOffset: 7, endOffset: sourceText.length },
    ]);
    expect(mergeImportParagraphWithNext(sourceText, split, 'paragraph-0001')).toEqual(initial);
  });

  it('拒绝首尾、代理对中间、未知片段与被篡改的来源投影', () => {
    expect(() => splitImportParagraph(sourceText, initial, 'paragraph-0001', 0)).toThrow('文字中间');
    expect(() => splitImportParagraph(sourceText, initial, 'paragraph-0001', sourceText.length)).toThrow('文字中间');
    expect(() => splitImportParagraph(sourceText, initial, 'paragraph-0001', sourceText.length - 1)).toThrow('完整字符');
    expect(() => splitImportParagraph(sourceText, initial, 'missing', 2)).toThrow('找不到');
    expect(() => splitImportParagraph(sourceText, [{ ...initial[0], text: '被篡改' }], 'paragraph-0001', 2)).toThrow('不一致');
    expect(() => mergeImportParagraphWithNext(sourceText, initial, 'paragraph-0001')).toThrow('紧邻');
  });

  it('拒绝超过分析上限的拆分以及跨越未投影文字的合并', () => {
    const fullSource = ['ab', ...Array.from({ length: 199 }, () => 'x')].join('\n');
    const twoHundred = createImportInterpretationParagraphs(fullSource);
    expect(twoHundred).toHaveLength(200);
    expect(() => splitImportParagraph(fullSource, twoHundred, 'paragraph-0001', 1)).toThrow('不能超过 200 段');

    expect(() => mergeImportParagraphWithNext('甲X乙', [
      { paragraphId: 'paragraph-0001', index: 0, text: '甲', startOffset: 0, endOffset: 1 },
      { paragraphId: 'paragraph-0002', index: 1, text: '乙', startOffset: 2, endOffset: 3 },
    ], 'paragraph-0001')).toThrow('未投影文字');
  });
});
