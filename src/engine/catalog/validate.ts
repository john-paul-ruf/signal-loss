import { type Fx, BOARD_UNIT_MAX, FX_ONE } from "../fx/index";
import {
  ARCHETYPE_CODE_MAX,
  BUDGETS,
  CHASSIS_CODE_MAX,
  COMMANDER_CODE_MAX,
  CURVE_FAMILIES,
  HARDPOINT_TYPE_CODE_MAX,
  MOUNT_CODE_MAX,
  MOUNT_FAMILIES,
  REQUIRED_ARCHETYPES,
  type ArchetypeCode,
  type ArchetypeId,
  type Budget,
  type Catalog,
  type CatalogError,
  type CatalogErrorKind,
  type Chassis,
  type ChassisCode,
  type ChassisId,
  type CommanderCode,
  type CommanderModifications,
  type CommanderType,
  type CommanderTypeId,
  type CurveFamily,
  type DialState,
  type HardpointType,
  type HardpointTypeCode,
  type HardpointTypeId,
  type MapArchetype,
  type Mount,
  type MountCode,
  type MountFamily,
  type MountId,
  type Prebuilt,
  type PrebuiltConstruct,
  type PrebuiltId,
  type PrebuiltMount,
  type RawCatalogBundle,
  type Tunables,
} from "./schema";

/**
 * Path-specific catalog validation. Every failure produces a CatalogError
 * with a `path` (JSON-pointer style), a `kind` (discriminator), and a
 * human-readable message. Errors accumulate; the load never short-circuits
 * on the first failure. §3.3.
 */
export interface ValidationOutcome {
  readonly errors: readonly CatalogError[];
  readonly catalog: Catalog | null;
}

const KEBAB_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const ID_PATTERN_MSG = "Expected kebab-case identifier (lowercase, digits, single hyphens).";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
}

/**
 * A single validation session. All error paths go through `.push()` so
 * accumulation stays uniform.
 */
class Ctx {
  readonly errors: CatalogError[] = [];

  push(path: string, kind: CatalogErrorKind, message: string): void {
    this.errors.push({ path, kind, message });
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}

function validateStringField(
  ctx: Ctx,
  record: Record<string, unknown>,
  key: string,
  path: string,
  { minLength = 1 }: { minLength?: number } = {},
): string | null {
  const v = record[key];
  if (v === undefined) {
    ctx.push(`${path}.${key}`, "MISSING_FIELD", "Required field missing.");
    return null;
  }
  if (typeof v !== "string") {
    ctx.push(`${path}.${key}`, "TYPE", `Expected a string; got ${typeof v}.`);
    return null;
  }
  if (v.length < minLength) {
    ctx.push(`${path}.${key}`, "RANGE", `Expected a non-empty string.`);
    return null;
  }
  return v;
}

function validateKebabId(
  ctx: Ctx,
  record: Record<string, unknown>,
  key: string,
  path: string,
): string | null {
  const raw = validateStringField(ctx, record, key, path);
  if (raw === null) return null;
  if (!KEBAB_ID.test(raw)) {
    ctx.push(`${path}.${key}`, "TYPE", ID_PATTERN_MSG);
    return null;
  }
  return raw;
}

function validateIntField(
  ctx: Ctx,
  record: Record<string, unknown>,
  key: string,
  path: string,
  { min, max }: { min: number; max: number },
): number | null {
  const v = record[key];
  if (v === undefined) {
    ctx.push(`${path}.${key}`, "MISSING_FIELD", "Required field missing.");
    return null;
  }
  if (!isFiniteInt(v)) {
    ctx.push(`${path}.${key}`, "TYPE", `Expected an integer; got ${JSON.stringify(v)}.`);
    return null;
  }
  if (v < min || v > max) {
    ctx.push(`${path}.${key}`, "RANGE", `Expected integer in [${min}, ${max}]; got ${v}.`);
    return null;
  }
  return v;
}

function validateFxField(
  ctx: Ctx,
  record: Record<string, unknown>,
  key: string,
  path: string,
  { min, max }: { min: number; max: number },
): Fx | null {
  const v = record[key];
  if (v === undefined) {
    ctx.push(`${path}.${key}`, "MISSING_FIELD", "Required field missing.");
    return null;
  }
  if (!isFiniteInt(v)) {
    ctx.push(`${path}.${key}`, "TYPE", `Expected an integer fx value; got ${JSON.stringify(v)}.`);
    return null;
  }
  if (v < min || v > max) {
    ctx.push(`${path}.${key}`, "RANGE", `Expected fx integer in [${min}, ${max}]; got ${v}.`);
    return null;
  }
  return v as Fx;
}

function validateFraction(
  ctx: Ctx,
  record: Record<string, unknown>,
  key: string,
  path: string,
): number | null {
  const v = record[key];
  if (v === undefined) {
    ctx.push(`${path}.${key}`, "MISSING_FIELD", "Required field missing.");
    return null;
  }
  if (typeof v !== "number" || !Number.isFinite(v)) {
    ctx.push(`${path}.${key}`, "TYPE", `Expected a finite number; got ${JSON.stringify(v)}.`);
    return null;
  }
  if (v < 0 || v > 1) {
    ctx.push(`${path}.${key}`, "RANGE", `Expected fraction in [0, 1]; got ${v}.`);
    return null;
  }
  return v;
}

function assertNoExtraKeys(
  ctx: Ctx,
  record: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const set = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!set.has(key)) {
      ctx.push(`${path}.${key}`, "EXTRA_FIELD", "Unknown field for catalog schema.");
    }
  }
}

function validateArray(
  ctx: Ctx,
  value: unknown,
  path: string,
): readonly unknown[] | null {
  if (!Array.isArray(value)) {
    ctx.push(path, "TYPE", `Expected an array; got ${typeof value}.`);
    return null;
  }
  return value;
}

function validateHardpointTypes(ctx: Ctx, raw: unknown): readonly HardpointType[] {
  const arr = validateArray(ctx, raw, "hardpointTypes");
  if (arr === null) return [];
  const out: HardpointType[] = [];
  const seenIds = new Set<string>();
  const seenCodes = new Set<number>();
  arr.forEach((entry, index) => {
    const path = `hardpointTypes[${index}]`;
    if (!isRecord(entry)) {
      ctx.push(path, "TYPE", "Expected an object.");
      return;
    }
    assertNoExtraKeys(ctx, entry, ["id", "code", "name"], path);
    const id = validateKebabId(ctx, entry, "id", path);
    const code = validateIntField(ctx, entry, "code", path, { min: 1, max: HARDPOINT_TYPE_CODE_MAX });
    const name = validateStringField(ctx, entry, "name", path);
    if (id === null || code === null || name === null) return;
    if (seenIds.has(id)) {
      ctx.push(`${path}.id`, "DUPLICATE", `Duplicate hardpoint-type id ${JSON.stringify(id)}.`);
      return;
    }
    if (seenCodes.has(code)) {
      ctx.push(`${path}.code`, "DUPLICATE", `Duplicate hardpoint-type code ${code}.`);
      return;
    }
    seenIds.add(id);
    seenCodes.add(code);
    out.push({
      id: id as HardpointTypeId,
      code: code as HardpointTypeCode,
      name,
    });
  });
  return out;
}

function validateDial(
  ctx: Ctx,
  raw: unknown,
  path: string,
  curveFamily: CurveFamily | null,
): readonly DialState[] {
  const arr = validateArray(ctx, raw, path);
  if (arr === null) return [];
  if (arr.length < 1) {
    ctx.push(path, "RANGE", "Dial must have at least one state.");
    return [];
  }
  const out: DialState[] = [];
  arr.forEach((entry, index) => {
    const p = `${path}[${index}]`;
    if (!isRecord(entry)) {
      ctx.push(p, "TYPE", "Expected an object.");
      return;
    }
    assertNoExtraKeys(ctx, entry, ["index", "movementAllowance", "damage", "rangeModifier", "defenseModifier"], p);
    const stateIndex = validateIntField(ctx, entry, "index", p, { min: 0, max: 31 });
    if (stateIndex !== null && stateIndex !== index) {
      ctx.push(`${p}.index`, "ORDER", `Dial state index must equal its array position (${index}); got ${stateIndex}.`);
    }
    const movement = validateFxField(ctx, entry, "movementAllowance", p, { min: 0, max: (BOARD_UNIT_MAX * FX_ONE) as number });
    const damage = validateIntField(ctx, entry, "damage", p, { min: 0, max: 0xffff });
    const rangeMod = validateFxField(ctx, entry, "rangeModifier", p, { min: -(BOARD_UNIT_MAX * FX_ONE), max: BOARD_UNIT_MAX * FX_ONE });
    const defense = validateIntField(ctx, entry, "defenseModifier", p, { min: -0xff, max: 0xff });
    if (movement === null || damage === null || rangeMod === null || defense === null) return;
    out.push({
      index,
      movementAllowance: movement,
      damage,
      rangeModifier: rangeMod,
      defenseModifier: defense,
    });
  });
  // Curve family check — declared behavior must match observed dial shape.
  if (curveFamily !== null && out.length >= 2) {
    const dmg = out.map((s) => s.damage);
    const first = dmg[0] as number;
    const last = dmg[dmg.length - 1] as number;
    switch (curveFamily) {
      case "degrade":
        if (last > first) {
          ctx.push(path, "CURVE", `Declared curve "degrade" but last-state damage (${last}) exceeds first-state damage (${first}).`);
        }
        break;
      case "spike":
        if (last < first) {
          ctx.push(path, "CURVE", `Declared curve "spike" but last-state damage (${last}) is below first-state damage (${first}).`);
        }
        break;
      case "inversion": {
        // At least one stat rises while another falls somewhere along the dial.
        const mov = out.map((s) => s.movementAllowance as number);
        const dmgUp = last > first;
        const movDown = (mov[mov.length - 1] as number) < (mov[0] as number);
        if (!(dmgUp && movDown)) {
          ctx.push(path, "CURVE", `Declared curve "inversion" but damage does not rise while movement falls across the dial.`);
        }
        break;
      }
    }
  }
  return out;
}

function validateChassis(
  ctx: Ctx,
  raw: unknown,
  hardpointTypeIds: ReadonlySet<HardpointTypeId>,
): readonly Chassis[] {
  const arr = validateArray(ctx, raw, "chassis");
  if (arr === null) return [];
  const out: Chassis[] = [];
  const seenIds = new Set<string>();
  const seenCodes = new Set<number>();
  arr.forEach((entry, index) => {
    const path = `chassis[${index}]`;
    if (!isRecord(entry)) {
      ctx.push(path, "TYPE", "Expected an object.");
      return;
    }
    assertNoExtraKeys(
      ctx,
      entry,
      [
        "id",
        "code",
        "name",
        "cost",
        "footprint",
        "hardpoints",
        "baseRange",
        "rangeClamp",
        "resolutionRange",
        "curveFamily",
        "dial",
      ],
      path,
    );
    const id = validateKebabId(ctx, entry, "id", path);
    const code = validateIntField(ctx, entry, "code", path, { min: 1, max: CHASSIS_CODE_MAX });
    const name = validateStringField(ctx, entry, "name", path);
    const cost = validateIntField(ctx, entry, "cost", path, { min: 0, max: 200 });
    const footprint = validateFxField(ctx, entry, "footprint", path, { min: 1, max: BOARD_UNIT_MAX * FX_ONE });
    const baseRange = validateFxField(ctx, entry, "baseRange", path, { min: 0, max: BOARD_UNIT_MAX * FX_ONE });
    const resolutionRange = validateFxField(ctx, entry, "resolutionRange", path, { min: 0, max: BOARD_UNIT_MAX * FX_ONE });

    // hardpoints
    const hpsRaw = entry["hardpoints"];
    const hpArr = validateArray(ctx, hpsRaw, `${path}.hardpoints`);
    const hardpoints: { typeId: HardpointTypeId }[] = [];
    if (hpArr !== null) {
      hpArr.forEach((hp, hpIndex) => {
        const hpPath = `${path}.hardpoints[${hpIndex}]`;
        if (!isRecord(hp)) {
          ctx.push(hpPath, "TYPE", "Expected an object.");
          return;
        }
        assertNoExtraKeys(ctx, hp, ["typeId"], hpPath);
        const typeId = validateKebabId(ctx, hp, "typeId", hpPath);
        if (typeId === null) return;
        if (!hardpointTypeIds.has(typeId as HardpointTypeId)) {
          ctx.push(`${hpPath}.typeId`, "REFERENCE", `Unknown hardpoint-type id ${JSON.stringify(typeId)}.`);
          return;
        }
        hardpoints.push({ typeId: typeId as HardpointTypeId });
      });
    }

    // rangeClamp
    const rc = entry["rangeClamp"];
    let rangeClamp: { min: Fx; max: Fx } | null = null;
    if (rc === undefined) {
      ctx.push(`${path}.rangeClamp`, "MISSING_FIELD", "Required field missing.");
    } else if (!isRecord(rc)) {
      ctx.push(`${path}.rangeClamp`, "TYPE", "Expected an object with min/max.");
    } else {
      assertNoExtraKeys(ctx, rc, ["min", "max"], `${path}.rangeClamp`);
      const minR = validateFxField(ctx, rc, "min", `${path}.rangeClamp`, { min: 0, max: BOARD_UNIT_MAX * FX_ONE });
      const maxR = validateFxField(ctx, rc, "max", `${path}.rangeClamp`, { min: 0, max: BOARD_UNIT_MAX * FX_ONE });
      if (minR !== null && maxR !== null) {
        if ((minR as number) > (maxR as number)) {
          ctx.push(`${path}.rangeClamp`, "RANGE", `rangeClamp.min (${minR}) must not exceed rangeClamp.max (${maxR}).`);
        } else {
          rangeClamp = { min: minR, max: maxR };
        }
      }
    }

    // curveFamily
    const cfRaw = entry["curveFamily"];
    let curveFamily: CurveFamily | null = null;
    if (typeof cfRaw !== "string") {
      ctx.push(`${path}.curveFamily`, "TYPE", "Expected a string.");
    } else if (!(CURVE_FAMILIES as readonly string[]).includes(cfRaw)) {
      ctx.push(`${path}.curveFamily`, "TYPE", `Expected one of ${CURVE_FAMILIES.join(", ")}; got ${JSON.stringify(cfRaw)}.`);
    } else {
      curveFamily = cfRaw as CurveFamily;
    }

    const dial = validateDial(ctx, entry["dial"], `${path}.dial`, curveFamily);

    if (
      id === null || code === null || name === null || cost === null || footprint === null ||
      baseRange === null || resolutionRange === null || rangeClamp === null || curveFamily === null ||
      dial.length === 0 || hardpoints.length === 0
    ) return;

    if (seenIds.has(id)) {
      ctx.push(`${path}.id`, "DUPLICATE", `Duplicate chassis id ${JSON.stringify(id)}.`);
      return;
    }
    if (seenCodes.has(code)) {
      ctx.push(`${path}.code`, "DUPLICATE", `Duplicate chassis code ${code}.`);
      return;
    }
    seenIds.add(id);
    seenCodes.add(code);
    out.push({
      id: id as ChassisId,
      code: code as ChassisCode,
      name,
      cost,
      footprint,
      hardpoints,
      baseRange,
      rangeClamp,
      resolutionRange,
      curveFamily,
      dial,
    });
  });
  return out;
}

function validateMounts(
  ctx: Ctx,
  raw: unknown,
  hardpointTypeIds: ReadonlySet<HardpointTypeId>,
): readonly Mount[] {
  const arr = validateArray(ctx, raw, "mounts");
  if (arr === null) return [];
  const out: Mount[] = [];
  const seenIds = new Set<string>();
  const seenCodes = new Set<number>();
  arr.forEach((entry, index) => {
    const path = `mounts[${index}]`;
    if (!isRecord(entry)) {
      ctx.push(path, "TYPE", "Expected an object.");
      return;
    }
    assertNoExtraKeys(
      ctx,
      entry,
      ["id", "code", "name", "cost", "family", "requiredHardpointType", "damageDelta", "rangeDelta"],
      path,
    );
    const id = validateKebabId(ctx, entry, "id", path);
    const code = validateIntField(ctx, entry, "code", path, { min: 1, max: MOUNT_CODE_MAX });
    const name = validateStringField(ctx, entry, "name", path);
    const cost = validateIntField(ctx, entry, "cost", path, { min: 0, max: 200 });
    const familyRaw = entry["family"];
    let family: MountFamily | null = null;
    if (typeof familyRaw !== "string") {
      ctx.push(`${path}.family`, "TYPE", "Expected a string.");
    } else if (!(MOUNT_FAMILIES as readonly string[]).includes(familyRaw)) {
      ctx.push(`${path}.family`, "TYPE", `Expected one of ${MOUNT_FAMILIES.join(", ")}; got ${JSON.stringify(familyRaw)}.`);
    } else {
      family = familyRaw as MountFamily;
    }
    const reqType = validateKebabId(ctx, entry, "requiredHardpointType", path);
    if (reqType !== null && !hardpointTypeIds.has(reqType as HardpointTypeId)) {
      ctx.push(`${path}.requiredHardpointType`, "REFERENCE", `Unknown hardpoint-type id ${JSON.stringify(reqType)}.`);
    }
    const damageDelta = validateIntField(ctx, entry, "damageDelta", path, { min: -0xffff, max: 0xffff });
    const rangeDelta = validateFxField(ctx, entry, "rangeDelta", path, { min: -(BOARD_UNIT_MAX * FX_ONE), max: BOARD_UNIT_MAX * FX_ONE });

    if (
      id === null || code === null || name === null || cost === null ||
      family === null || reqType === null || damageDelta === null || rangeDelta === null
    ) return;
    if (seenIds.has(id)) {
      ctx.push(`${path}.id`, "DUPLICATE", `Duplicate mount id ${JSON.stringify(id)}.`);
      return;
    }
    if (seenCodes.has(code)) {
      ctx.push(`${path}.code`, "DUPLICATE", `Duplicate mount code ${code}.`);
      return;
    }
    seenIds.add(id);
    seenCodes.add(code);
    out.push({
      id: id as MountId,
      code: code as MountCode,
      name,
      cost,
      family,
      requiredHardpointType: reqType as HardpointTypeId,
      damageDelta,
      rangeDelta,
    });
  });
  return out;
}

function validateCommanderMods(
  ctx: Ctx,
  raw: unknown,
  path: string,
): CommanderModifications | null {
  if (!isRecord(raw)) {
    ctx.push(path, "TYPE", "Expected an object.");
    return null;
  }
  assertNoExtraKeys(ctx, raw, ["extraDialStates", "movementDelta", "damageDelta", "rangeDelta", "defenseDelta"], path);
  const extra = validateIntField(ctx, raw, "extraDialStates", path, { min: 0, max: 8 });
  const mov = validateFxField(ctx, raw, "movementDelta", path, { min: -(BOARD_UNIT_MAX * FX_ONE), max: BOARD_UNIT_MAX * FX_ONE });
  const dmg = validateIntField(ctx, raw, "damageDelta", path, { min: -0xff, max: 0xff });
  const rng = validateFxField(ctx, raw, "rangeDelta", path, { min: -(BOARD_UNIT_MAX * FX_ONE), max: BOARD_UNIT_MAX * FX_ONE });
  const def = validateIntField(ctx, raw, "defenseDelta", path, { min: -0xff, max: 0xff });
  if (extra === null || mov === null || dmg === null || rng === null || def === null) return null;
  return {
    extraDialStates: extra,
    movementDelta: mov,
    damageDelta: dmg,
    rangeDelta: rng,
    defenseDelta: def,
  };
}

function validateCommanderTypes(ctx: Ctx, raw: unknown): readonly CommanderType[] {
  const arr = validateArray(ctx, raw, "commanders");
  if (arr === null) return [];
  const out: CommanderType[] = [];
  const seenIds = new Set<string>();
  const seenCodes = new Set<number>();
  arr.forEach((entry, index) => {
    const path = `commanders[${index}]`;
    if (!isRecord(entry)) {
      ctx.push(path, "TYPE", "Expected an object.");
      return;
    }
    assertNoExtraKeys(
      ctx,
      entry,
      ["id", "code", "name", "cost", "commanderBase", "rLadder", "modifications"],
      path,
    );
    const id = validateKebabId(ctx, entry, "id", path);
    const code = validateIntField(ctx, entry, "code", path, { min: 1, max: COMMANDER_CODE_MAX });
    const name = validateStringField(ctx, entry, "name", path);
    const cost = validateIntField(ctx, entry, "cost", path, { min: 0, max: 40 });
    const base = validateIntField(ctx, entry, "commanderBase", path, { min: 0, max: 4 });
    const ladderRaw = entry["rLadder"];
    const ladderArr = validateArray(ctx, ladderRaw, `${path}.rLadder`);
    const ladder: number[] = [];
    if (ladderArr !== null) {
      if (ladderArr.length === 0) {
        ctx.push(`${path}.rLadder`, "RANGE", "rLadder must have at least one entry.");
      }
      ladderArr.forEach((r, ri) => {
        if (!isFiniteInt(r) || r < 3 || r > 12) {
          ctx.push(`${path}.rLadder[${ri}]`, "RANGE", `R divisor must be an integer in [3, 12]; got ${JSON.stringify(r)}.`);
          return;
        }
        ladder.push(r);
      });
    }
    const mods = validateCommanderMods(ctx, entry["modifications"], `${path}.modifications`);
    if (id === null || code === null || name === null || cost === null || base === null || ladder.length === 0 || mods === null) return;
    if (seenIds.has(id)) {
      ctx.push(`${path}.id`, "DUPLICATE", `Duplicate commander-type id ${JSON.stringify(id)}.`);
      return;
    }
    if (seenCodes.has(code)) {
      ctx.push(`${path}.code`, "DUPLICATE", `Duplicate commander-type code ${code}.`);
      return;
    }
    seenIds.add(id);
    seenCodes.add(code);
    out.push({
      id: id as CommanderTypeId,
      code: code as CommanderCode,
      name,
      cost,
      commanderBase: base,
      rLadder: ladder,
      modifications: mods,
    });
  });
  return out;
}

function validatePrebuilts(
  ctx: Ctx,
  raw: unknown,
  chassisCodes: ReadonlySet<number>,
  mountCodes: ReadonlySet<number>,
  commanderCodes: ReadonlySet<number>,
  maxHardpointsByChassis: ReadonlyMap<number, number>,
): readonly Prebuilt[] {
  const arr = validateArray(ctx, raw, "prebuilts");
  if (arr === null) return [];
  const out: Prebuilt[] = [];
  const seenIds = new Set<string>();
  arr.forEach((entry, index) => {
    const path = `prebuilts[${index}]`;
    if (!isRecord(entry)) {
      ctx.push(path, "TYPE", "Expected an object.");
      return;
    }
    assertNoExtraKeys(ctx, entry, ["id", "name", "budget", "constructs"], path);
    const id = validateKebabId(ctx, entry, "id", path);
    const name = validateStringField(ctx, entry, "name", path);
    const budgetRaw = entry["budget"];
    let budget: Budget | null = null;
    if (!isFiniteInt(budgetRaw)) {
      ctx.push(`${path}.budget`, "TYPE", "Expected an integer.");
    } else if (!(BUDGETS as readonly number[]).includes(budgetRaw)) {
      ctx.push(`${path}.budget`, "RANGE", `Expected one of ${BUDGETS.join(", ")}; got ${budgetRaw}.`);
    } else {
      budget = budgetRaw as Budget;
    }
    const constructsRaw = validateArray(ctx, entry["constructs"], `${path}.constructs`);
    const constructs: PrebuiltConstruct[] = [];
    if (constructsRaw !== null) {
      constructsRaw.forEach((c, ci) => {
        const cp = `${path}.constructs[${ci}]`;
        if (!isRecord(c)) {
          ctx.push(cp, "TYPE", "Expected an object.");
          return;
        }
        assertNoExtraKeys(ctx, c, ["chassisCode", "commanderCode", "mounts"], cp);
        const chassisCode = validateIntField(ctx, c, "chassisCode", cp, { min: 1, max: CHASSIS_CODE_MAX });
        const commanderRaw = c["commanderCode"];
        let commanderCode: number | null | undefined = undefined;
        if (commanderRaw === null) commanderCode = null;
        else if (commanderRaw === undefined) {
          ctx.push(`${cp}.commanderCode`, "MISSING_FIELD", "Required field missing (null for untagged).");
        } else if (!isFiniteInt(commanderRaw)) {
          ctx.push(`${cp}.commanderCode`, "TYPE", "Expected null or an integer.");
        } else if (commanderRaw < 1 || commanderRaw > COMMANDER_CODE_MAX) {
          ctx.push(`${cp}.commanderCode`, "RANGE", `Expected null or 1..${COMMANDER_CODE_MAX}.`);
        } else if (!commanderCodes.has(commanderRaw)) {
          ctx.push(`${cp}.commanderCode`, "REFERENCE", `Unknown commander-type code ${commanderRaw}.`);
        } else {
          commanderCode = commanderRaw;
        }
        if (chassisCode !== null && !chassisCodes.has(chassisCode)) {
          ctx.push(`${cp}.chassisCode`, "REFERENCE", `Unknown chassis code ${chassisCode}.`);
        }
        const mountsRaw = validateArray(ctx, c["mounts"], `${cp}.mounts`);
        const mounts: PrebuiltMount[] = [];
        const maxHp = chassisCode !== null ? maxHardpointsByChassis.get(chassisCode) ?? -1 : -1;
        const seenHp = new Set<number>();
        let previousHp = -1;
        if (mountsRaw !== null) {
          mountsRaw.forEach((mnt, mi) => {
            const mp = `${cp}.mounts[${mi}]`;
            if (!isRecord(mnt)) {
              ctx.push(mp, "TYPE", "Expected an object.");
              return;
            }
            assertNoExtraKeys(ctx, mnt, ["hardpointIndex", "mountCode"], mp);
            const hpIdx = validateIntField(ctx, mnt, "hardpointIndex", mp, { min: 0, max: 0xf });
            const mCode = validateIntField(ctx, mnt, "mountCode", mp, { min: 1, max: MOUNT_CODE_MAX });
            if (hpIdx === null || mCode === null) return;
            if (maxHp >= 0 && hpIdx >= maxHp) {
              ctx.push(`${mp}.hardpointIndex`, "RANGE", `Hardpoint index ${hpIdx} out of range for chassis (has ${maxHp} hardpoints).`);
              return;
            }
            if (seenHp.has(hpIdx)) {
              ctx.push(`${mp}.hardpointIndex`, "DUPLICATE", `Hardpoint ${hpIdx} referenced twice.`);
              return;
            }
            if (hpIdx <= previousHp) {
              ctx.push(`${mp}.hardpointIndex`, "ORDER", `Mounts must be sorted by ascending hardpoint index.`);
            }
            if (!mountCodes.has(mCode)) {
              ctx.push(`${mp}.mountCode`, "REFERENCE", `Unknown mount code ${mCode}.`);
              return;
            }
            seenHp.add(hpIdx);
            previousHp = hpIdx;
            mounts.push({ hardpointIndex: hpIdx, mountCode: mCode as MountCode });
          });
        }
        if (chassisCode !== null && commanderCode !== undefined) {
          constructs.push({
            chassisCode: chassisCode as ChassisCode,
            commanderCode: commanderCode === null ? null : (commanderCode as CommanderCode),
            mounts,
          });
        }
      });
    }
    if (id === null || name === null || budget === null || constructs.length === 0) return;
    if (seenIds.has(id)) {
      ctx.push(`${path}.id`, "DUPLICATE", `Duplicate prebuilt id ${JSON.stringify(id)}.`);
      return;
    }
    seenIds.add(id);
    out.push({ id: id as PrebuiltId, name, budget, constructs });
  });
  return out;
}

const TUNABLE_KEYS: readonly (keyof Tunables)[] = [
  "MAX_SQUAD",
  "TRACE_BASE",
  "TRACE_STEP",
  "TRACE_FIRST_ROUND",
  "TRACE_INTERVAL",
  "MAX_EXPECTED_ROUNDS",
  "MIN_POCKET",
  "MAX_OPEN_AREA",
  "MIN_QUADRANT_COVER",
  "MIN_SPAWN_SEP",
  "MIN_SPAWN_COVER",
  "SPAWN_COVER_RADIUS",
  "MAX_SPAWN_SIGHTLINES",
  "CHOKE_WIDTH",
  "CHOKE_FRACTION",
  "MAX_REGEN_ATTEMPTS",
  "EXPLOIT_CEILING",
  "NOVEL_ROSTER_TOLERANCE",
  "TRACE_DEATH_CEILING",
  "DOMINANCE_CEILING",
  "SNOWBALL_ROUND",
  "MOVE_SUBSTEPS",
  "BOARD_SIZE",
  "RANGE_MIN",
  "RANGE_MAX",
];

function validateTunables(ctx: Ctx, raw: unknown): Tunables | null {
  if (!isRecord(raw)) {
    ctx.push("tunables", "TYPE", "Expected an object.");
    return null;
  }
  assertNoExtraKeys(ctx, raw, TUNABLE_KEYS as string[], "tunables");
  // Completeness — every required key must be present.
  for (const key of TUNABLE_KEYS) {
    if (raw[key] === undefined) {
      ctx.push(`tunables.${key}`, "COMPLETENESS", `Required tunable ${key} missing.`);
    }
  }
  if (ctx.hasErrors()) {
    // Only continue value validation if all keys are present — otherwise the
    // per-value type errors would drown the completeness message. However we
    // still want to check the values we DO have, so continue on best-effort.
  }
  const int = (k: keyof Tunables, min: number, max: number) => validateIntField(ctx, raw, k, "tunables", { min, max });
  const fx = (k: keyof Tunables, min: number, max: number) => validateFxField(ctx, raw, k, "tunables", { min, max });
  const frac = (k: keyof Tunables) => validateFraction(ctx, raw, k, "tunables");

  const MAX_SQUAD = int("MAX_SQUAD", 1, 15);
  const TRACE_BASE = int("TRACE_BASE", 0, 20);
  const TRACE_STEP = int("TRACE_STEP", 0, 20);
  const TRACE_FIRST_ROUND = int("TRACE_FIRST_ROUND", 1, 30);
  const TRACE_INTERVAL = int("TRACE_INTERVAL", 1, 10);
  const MAX_EXPECTED_ROUNDS = int("MAX_EXPECTED_ROUNDS", 4, 100);
  const MIN_POCKET = int("MIN_POCKET", 0, 1 << 26);
  const MAX_OPEN_AREA = frac("MAX_OPEN_AREA");
  const MIN_QUADRANT_COVER = frac("MIN_QUADRANT_COVER");
  const MIN_SPAWN_SEP = fx("MIN_SPAWN_SEP", 0, BOARD_UNIT_MAX * FX_ONE);
  const MIN_SPAWN_COVER = int("MIN_SPAWN_COVER", 0, 32);
  const SPAWN_COVER_RADIUS = fx("SPAWN_COVER_RADIUS", 0, BOARD_UNIT_MAX * FX_ONE);
  const MAX_SPAWN_SIGHTLINES = int("MAX_SPAWN_SIGHTLINES", 0, 4);
  const CHOKE_WIDTH = fx("CHOKE_WIDTH", 0, BOARD_UNIT_MAX * FX_ONE);
  const CHOKE_FRACTION = frac("CHOKE_FRACTION");
  const MAX_REGEN_ATTEMPTS = int("MAX_REGEN_ATTEMPTS", 1, 100);
  const EXPLOIT_CEILING = frac("EXPLOIT_CEILING");
  const NOVEL_ROSTER_TOLERANCE = frac("NOVEL_ROSTER_TOLERANCE");
  const TRACE_DEATH_CEILING = frac("TRACE_DEATH_CEILING");
  const DOMINANCE_CEILING = frac("DOMINANCE_CEILING");
  const SNOWBALL_ROUND = int("SNOWBALL_ROUND", 1, 30);
  const MOVE_SUBSTEPS = int("MOVE_SUBSTEPS", 4, 256);
  const BOARD_SIZE = fx("BOARD_SIZE", FX_ONE, BOARD_UNIT_MAX * FX_ONE);
  const RANGE_MIN = fx("RANGE_MIN", 0, BOARD_UNIT_MAX * FX_ONE);
  const RANGE_MAX = fx("RANGE_MAX", 0, BOARD_UNIT_MAX * FX_ONE);

  if (
    MAX_SQUAD === null || TRACE_BASE === null || TRACE_STEP === null || TRACE_FIRST_ROUND === null ||
    TRACE_INTERVAL === null || MAX_EXPECTED_ROUNDS === null || MIN_POCKET === null || MAX_OPEN_AREA === null ||
    MIN_QUADRANT_COVER === null || MIN_SPAWN_SEP === null || MIN_SPAWN_COVER === null || SPAWN_COVER_RADIUS === null ||
    MAX_SPAWN_SIGHTLINES === null || CHOKE_WIDTH === null || CHOKE_FRACTION === null || MAX_REGEN_ATTEMPTS === null ||
    EXPLOIT_CEILING === null || NOVEL_ROSTER_TOLERANCE === null || TRACE_DEATH_CEILING === null ||
    DOMINANCE_CEILING === null || SNOWBALL_ROUND === null || MOVE_SUBSTEPS === null || BOARD_SIZE === null ||
    RANGE_MIN === null || RANGE_MAX === null
  ) return null;

  if ((RANGE_MIN as number) > (RANGE_MAX as number)) {
    ctx.push("tunables.RANGE_MIN", "RANGE", "RANGE_MIN must not exceed RANGE_MAX.");
    return null;
  }

  return {
    MAX_SQUAD, TRACE_BASE, TRACE_STEP, TRACE_FIRST_ROUND, TRACE_INTERVAL, MAX_EXPECTED_ROUNDS,
    MIN_POCKET, MAX_OPEN_AREA, MIN_QUADRANT_COVER, MIN_SPAWN_SEP, MIN_SPAWN_COVER, SPAWN_COVER_RADIUS,
    MAX_SPAWN_SIGHTLINES, CHOKE_WIDTH, CHOKE_FRACTION, MAX_REGEN_ATTEMPTS, EXPLOIT_CEILING,
    NOVEL_ROSTER_TOLERANCE, TRACE_DEATH_CEILING, DOMINANCE_CEILING, SNOWBALL_ROUND, MOVE_SUBSTEPS,
    BOARD_SIZE, RANGE_MIN, RANGE_MAX,
  };
}

function validateMapArchetypes(ctx: Ctx, raw: unknown): readonly MapArchetype[] {
  const arr = validateArray(ctx, raw, "mapArchetypes");
  if (arr === null) return [];
  const out: MapArchetype[] = [];
  const seenIds = new Set<string>();
  const seenCodes = new Set<number>();
  arr.forEach((entry, index) => {
    const path = `mapArchetypes[${index}]`;
    if (!isRecord(entry)) {
      ctx.push(path, "TYPE", "Expected an object.");
      return;
    }
    assertNoExtraKeys(
      ctx,
      entry,
      ["id", "code", "name", "wallDensity", "meanSightlineLength", "openAreaFraction", "parameters"],
      path,
    );
    const id = validateKebabId(ctx, entry, "id", path);
    const code = validateIntField(ctx, entry, "code", path, { min: 1, max: ARCHETYPE_CODE_MAX });
    const name = validateStringField(ctx, entry, "name", path);
    const wd = validateFractionRange(ctx, entry["wallDensity"], `${path}.wallDensity`);
    const ms = validateFxRange(ctx, entry["meanSightlineLength"], `${path}.meanSightlineLength`);
    const oa = validateFractionRange(ctx, entry["openAreaFraction"], `${path}.openAreaFraction`);
    const params = validateParameters(ctx, entry["parameters"], `${path}.parameters`);
    if (id === null || code === null || name === null || wd === null || ms === null || oa === null || params === null) return;
    if (seenIds.has(id)) {
      ctx.push(`${path}.id`, "DUPLICATE", `Duplicate archetype id ${JSON.stringify(id)}.`);
      return;
    }
    if (seenCodes.has(code)) {
      ctx.push(`${path}.code`, "DUPLICATE", `Duplicate archetype code ${code}.`);
      return;
    }
    seenIds.add(id);
    seenCodes.add(code);
    out.push({
      id: id as ArchetypeId,
      code: code as ArchetypeCode,
      name,
      wallDensity: wd,
      meanSightlineLength: ms,
      openAreaFraction: oa,
      parameters: params,
    });
  });
  // Completeness — all seven archetypes must be present.
  const presentIds = new Set(out.map((a) => a.id as string));
  for (const required of REQUIRED_ARCHETYPES) {
    if (!presentIds.has(required)) {
      ctx.push("mapArchetypes", "COMPLETENESS", `Missing required archetype ${JSON.stringify(required)}.`);
    }
  }
  return out;
}

function validateFractionRange(
  ctx: Ctx,
  raw: unknown,
  path: string,
): { min: number; max: number } | null {
  if (!isRecord(raw)) {
    ctx.push(path, "TYPE", "Expected an object with min/max.");
    return null;
  }
  assertNoExtraKeys(ctx, raw, ["min", "max"], path);
  const min = validateFraction(ctx, raw, "min", path);
  const max = validateFraction(ctx, raw, "max", path);
  if (min === null || max === null) return null;
  if (min > max) {
    ctx.push(path, "RANGE", `min (${min}) must not exceed max (${max}).`);
    return null;
  }
  return { min, max };
}

function validateFxRange(
  ctx: Ctx,
  raw: unknown,
  path: string,
): { min: Fx; max: Fx } | null {
  if (!isRecord(raw)) {
    ctx.push(path, "TYPE", "Expected an object with min/max.");
    return null;
  }
  assertNoExtraKeys(ctx, raw, ["min", "max"], path);
  const min = validateFxField(ctx, raw, "min", path, { min: 0, max: BOARD_UNIT_MAX * FX_ONE });
  const max = validateFxField(ctx, raw, "max", path, { min: 0, max: BOARD_UNIT_MAX * FX_ONE });
  if (min === null || max === null) return null;
  if ((min as number) > (max as number)) {
    ctx.push(path, "RANGE", `min (${min}) must not exceed max (${max}).`);
    return null;
  }
  return { min, max };
}

function validateParameters(
  ctx: Ctx,
  raw: unknown,
  path: string,
): Readonly<Record<string, number>> | null {
  if (!isRecord(raw)) {
    ctx.push(path, "TYPE", "Expected an object of number values.");
    return null;
  }
  const out: Record<string, number> = {};
  for (const key of Object.keys(raw).slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const v = raw[key];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      ctx.push(`${path}.${key}`, "TYPE", `Expected a finite number; got ${JSON.stringify(v)}.`);
      return null;
    }
    out[key] = v;
  }
  return out;
}

/**
 * FR-2 combinatorial rule: no chassis may accept one mount of each of the
 * five families. Verified via bipartite matching (exhaustive backtracking —
 * chassis have at most a handful of hardpoints, so it is fast).
 */
export function chassisAdmitsUniversalFamilyLoadout(
  chassis: Chassis,
  hardpointAcceptsFamily: ReadonlyMap<HardpointTypeId, ReadonlySet<MountFamily>>,
): boolean {
  const families = MOUNT_FAMILIES;
  const used = new Set<number>();
  function backtrack(familyIndex: number): boolean {
    if (familyIndex === families.length) return true;
    const family = families[familyIndex] as MountFamily;
    for (let hpIdx = 0; hpIdx < chassis.hardpoints.length; hpIdx = hpIdx + 1) {
      if (used.has(hpIdx)) continue;
      const hp = chassis.hardpoints[hpIdx];
      if (hp === undefined) continue;
      const accepts = hardpointAcceptsFamily.get(hp.typeId);
      if (accepts === undefined || !accepts.has(family)) continue;
      used.add(hpIdx);
      if (backtrack(familyIndex + 1)) return true;
      used.delete(hpIdx);
    }
    return false;
  }
  return backtrack(0);
}

export function validateCatalog(raw: RawCatalogBundle): ValidationOutcome {
  const ctx = new Ctx();

  // Structural check on the bundle envelope.
  if (!isRecord(raw)) {
    return {
      errors: [{ path: "$", kind: "TYPE", message: "Expected a raw catalog bundle object." }],
      catalog: null,
    };
  }

  const hardpointTypes = validateHardpointTypes(ctx, raw.hardpointTypes);
  const hardpointTypeIds = new Set(hardpointTypes.map((t) => t.id));

  const chassis = validateChassis(ctx, raw.chassis, hardpointTypeIds);
  const mounts = validateMounts(ctx, raw.mounts, hardpointTypeIds);
  const commanders = validateCommanderTypes(ctx, raw.commanders);

  const chassisCodes = new Set<number>(chassis.map((c) => c.code as number));
  const mountCodes = new Set<number>(mounts.map((m) => m.code as number));
  const commanderCodes = new Set<number>(commanders.map((c) => c.code as number));
  const maxHardpointsByChassis = new Map<number, number>(
    chassis.map((c) => [c.code as number, c.hardpoints.length]),
  );

  const prebuilts = validatePrebuilts(ctx, raw.prebuilts, chassisCodes, mountCodes, commanderCodes, maxHardpointsByChassis);
  const tunables = validateTunables(ctx, raw.tunables);
  const mapArchetypes = validateMapArchetypes(ctx, raw.mapArchetypes);

  // FR-2 combinatorial check across chassis. Build acceptance map first.
  const hardpointAcceptsFamily = new Map<HardpointTypeId, Set<MountFamily>>();
  for (const mount of mounts) {
    const set = hardpointAcceptsFamily.get(mount.requiredHardpointType) ?? new Set<MountFamily>();
    set.add(mount.family);
    hardpointAcceptsFamily.set(mount.requiredHardpointType, set);
  }
  for (const c of chassis) {
    if (chassisAdmitsUniversalFamilyLoadout(c, hardpointAcceptsFamily)) {
      ctx.push(
        `chassis[${c.id}]`,
        "MOUNT_FAMILY_UNIVERSAL",
        `Chassis ${JSON.stringify(c.id)} admits one mount of each of the five families simultaneously (FR-2).`,
      );
    }
  }

  // Curve family coverage — FR-19 requires at least one chassis per family.
  const observedCurves = new Set(chassis.map((c) => c.curveFamily));
  for (const family of CURVE_FAMILIES) {
    if (!observedCurves.has(family)) {
      ctx.push("chassis", "COMPLETENESS", `No chassis declares curve family ${JSON.stringify(family)} (FR-19).`);
    }
  }

  if (ctx.hasErrors() || tunables === null) {
    return { errors: ctx.errors, catalog: null };
  }

  return {
    errors: [],
    catalog: {
      hardpointTypes,
      chassis,
      mounts,
      commanderTypes: commanders,
      prebuilts,
      tunables,
      mapArchetypes,
      // Indexes/hashes are filled by loadCatalog after we know validation
      // succeeded — the schema only fills the plain-data fields.
      indexes: undefined as never,
      hashes: undefined as never,
    },
  };
}
