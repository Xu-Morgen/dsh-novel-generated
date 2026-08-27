import { describe, expectTypeOf, it } from 'vitest';
import {
  CharacterShape,
  OutlineActShape,
  OutlineBeatShape,
  OutlineDetailBeatShape,
  OutlineShape,
  RelationshipShape,
  WorldShape,
} from './client/shapes.js';
import {
  CharacterArc,
  CharacterKind,
  CharacterCoreInput,
} from './core/schema/characters.js';
import {
  Act,
  Beat,
  ConflictType,
  DetailBeat,
  DetailBeatStatus,
  Foreshadowing,
  OutlineInput,
  OutlineStructure,
} from './core/schema/outline.js';
import { RelationshipInput, RelationshipType } from './core/schema/relationship.js';
import { WorldEntryInput, WorldKind } from './core/schema/worldview.js';

/**
 * I78 `CharacterShape` 字段类型收窄的编译期断言（验收：CharacterShape 字段类型
 * 收窄 —— `kind` 不再是 `string`、无 `[key: string]: unknown` 索引签名、字段集合
 * 与 canonical 单一来源一致）。expectTypeOf 断言在编译期求值，漂移即编译失败。
 *
 * 方向约定：编辑器表单模型是 canonical 输入类型的「放宽」（草稿可部分填写），
 * 因此 canonical 输入类型必然满足表单（`toMatchTypeOf` 正向），反向不成立
 * （部分草稿不是合法输入 —— 负向断言）。
 */

describe('I78 client 投影 shape 类型收窄（编译期断言）', () => {
  it('CharacterShape 键集精确（无索引签名）且 canonical 输入类型可作表单使用', () => {
    expectTypeOf<keyof CharacterShape>().toEqualTypeOf<
      'id' | 'name' | 'aliases' | 'kind' | 'personality' | 'background' | 'motivation' | 'goals' | 'flaws' | 'abilities' | 'speechStyle' | 'staticTraits' | 'arc' | 'relationships' | 'knowledgeIds' | 'version'
    >();
    expectTypeOf<CharacterCoreInput>().toMatchTypeOf<CharacterShape>();
    expectTypeOf<CharacterShape>().not.toMatchTypeOf<CharacterCoreInput>();
  });

  it('CharacterShape.kind 收窄为 core 枚举联合（不再是 string）', () => {
    expectTypeOf<CharacterShape['kind']>().toEqualTypeOf<CharacterKind | undefined>();
    expectTypeOf<CharacterShape['kind']>().not.toEqualTypeOf<string>();
    expectTypeOf<CharacterShape['arc']>().toEqualTypeOf<CharacterArc | undefined>();
  });

  it('OutlineShape 与 canonical 输入类型同形且嵌套形状收窄', () => {
    // zod `.omit().extend()` 输出与手写 `Omit<...> & { version?: number }` 严格同一性
    // 判定不可靠，这里用双向可赋值证明「同形」。
    expectTypeOf<OutlineInput>().toMatchTypeOf<OutlineShape>();
    expectTypeOf<OutlineShape>().toMatchTypeOf<OutlineInput>();
    expectTypeOf<OutlineShape['structure']>().toEqualTypeOf<OutlineStructure>();
    expectTypeOf<OutlineShape['foreshadowing']>().toEqualTypeOf<Foreshadowing[]>();
    expectTypeOf<OutlineShape['endings']>().not.toEqualTypeOf<unknown[]>();
    expectTypeOf<OutlineActShape>().toEqualTypeOf<Act>();
    expectTypeOf<OutlineBeatShape>().toEqualTypeOf<Beat>();
    expectTypeOf<OutlineDetailBeatShape>().toEqualTypeOf<DetailBeat>();
    expectTypeOf<OutlineBeatShape['conflictType']>().toEqualTypeOf<ConflictType>();
    expectTypeOf<OutlineDetailBeatShape['status']>().toEqualTypeOf<DetailBeatStatus>();
    expectTypeOf<keyof OutlineShape>().toEqualTypeOf<'id' | 'structure' | 'logline' | 'themes' | 'acts' | 'foreshadowing' | 'endings' | 'version'>();
  });

  it('RelationshipShape 与 WorldShape 同样收窄（core 枚举联合，无索引签名）', () => {
    expectTypeOf<RelationshipInput>().toMatchTypeOf<RelationshipShape>();
    expectTypeOf<RelationshipShape>().toMatchTypeOf<RelationshipInput>();
    expectTypeOf<RelationshipShape['type']>().toEqualTypeOf<RelationshipType>();
    expectTypeOf<keyof RelationshipShape>().toEqualTypeOf<'id' | 'from' | 'to' | 'type' | 'affinity' | 'trust' | 'status' | 'milestones' | 'knownTo' | 'version'>();
    expectTypeOf<WorldEntryInput>().toMatchTypeOf<WorldShape>();
    expectTypeOf<WorldShape['kind']>().toEqualTypeOf<WorldKind | undefined>();
  });

  it('负向：索引签名访问在编译期被拒绝（@ts-expect-error 必须命中）', () => {
    const shape: CharacterShape = { id: 'c-1', name: '米拉' };
    // 若 CharacterShape 恢复 `[key: string]: unknown` 索引签名，此行将不再报错。
    // @ts-expect-error CharacterShape 无索引签名：任意键访问必须编译失败
    shape['任意键'];
    const outline: OutlineShape = { id: 'outline', structure: 'free', logline: '梗概', themes: [], acts: [], foreshadowing: [], endings: [] };
    // @ts-expect-error OutlineShape 无索引签名
    outline['任意键'];
  });
});
