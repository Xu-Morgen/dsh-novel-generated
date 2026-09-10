/** I219: cross-stage identity ambiguity is reviewed, never silently merged by name. */
export class DuplicateProtagonistError extends Error {
  constructor() { super('新主角与基础角色重名，请选择复用基础角色后重试；若确为不同人物，请先明确区分名称。'); }
}

/** A name match signals ambiguity, not proof that two people are identical. */
export function assertDistinctProtagonist(candidate: { id: string; name: string } | undefined, characters: readonly { id: string; name: string; aliases?: readonly string[] }[]): void {
  if (!candidate) return;
  const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase();
  const name = normalize(candidate.name);
  if (characters.some(character => character.id !== candidate.id && [character.name, ...(character.aliases ?? [])].some(value => normalize(value) === name))) throw new DuplicateProtagonistError();
}
