import * as React from "react";
import { useMatchStore, matchSelectors } from "../../store/match";
import type { KnownConstruct, PublicState } from "../../../engine";
import {
  effectiveAttackRange,
  effectiveDamage,
  effectiveDialLength,
  currentDialState,
} from "../../../engine";

/**
 * Inspector panel — full stats + full dial for any construct including
 * ghosts and destroyed (FR-24, design.md §5.4). Reads from
 * PublicState so we never accidentally leak hidden facts.
 */
export function InspectorPanel(): React.ReactElement {
  const engine = useMatchStore((s) => s.engine);
  const catalog = useMatchStore((s) => s.catalog);
  const launch = useMatchStore((s) => s.launch);
  const inspectedId = useMatchStore((s) => s.selection.inspectedConstructId);
  const pv: PublicState | null = matchSelectors.selectHumanPublicView({ engine, catalog, launch } as unknown as Parameters<typeof matchSelectors.selectHumanPublicView>[0]);

  if (pv === null || catalog === null || engine === null) {
    return (
      <section className="inspector inspector--empty" aria-label="Inspector">
        <p className="inspector__empty">Match not started.</p>
      </section>
    );
  }
  if (inspectedId === null) {
    return (
      <section className="inspector inspector--empty" aria-label="Inspector">
        <p className="inspector__empty">Hover or click any construct to inspect it.</p>
      </section>
    );
  }
  const known: KnownConstruct | undefined = pv.constructs.find((k) => k.base.id === inspectedId);
  if (known === undefined) {
    return (
      <section className="inspector inspector--empty" aria-label="Inspector">
        <p className="inspector__empty">Unknown construct.</p>
      </section>
    );
  }

  // Full stats come from the runtime construct — legal because these
  // are all public per FR-24 (chassis, mounts, dial, commander).
  const runtime = engine.constructs.find((c) => c.id === inspectedId);
  const chassis = runtime === undefined ? undefined : catalog.indexes.chassisByCode.get(runtime.chassisCode);
  const dial = runtime === undefined ? undefined : currentDialState(runtime, catalog);
  const dmg = runtime === undefined ? 0 : effectiveDamage(runtime, catalog);
  const rng = runtime === undefined ? 0 : (effectiveAttackRange(runtime, catalog) as number);
  const dialLen = runtime === undefined ? 0 : effectiveDialLength(runtime, catalog);
  const ownSquad = launch?.humanSquadId as number | undefined;
  const isOwn = ownSquad !== undefined && (known.base.squadId as number) === ownSquad;
  const label = isOwn ? "OWN" : known.confirmed ? "ENEMY" : "GHOST";

  return (
    <section
      className={`inspector inspector--${label.toLowerCase()}`}
      aria-label={`Inspector for construct ${known.base.id as number}`}
    >
      <header className="inspector__header">
        <span className="inspector__code">{known.base.chassisCode}-{String(known.base.id as number).padStart(2, "0")}</span>
        <span className="inspector__tag">{label}</span>
        {known.base.commanderCode !== null ? (
          <span className="inspector__cmd" aria-label="Commander">◆CMD</span>
        ) : null}
      </header>
      {chassis !== undefined ? (
        <dl className="inspector__stats">
          <div><dt>MOVE</dt><dd>{dial?.movementAllowance as number ?? "—"}</dd></div>
          <div><dt>DMG</dt><dd>{dmg}</dd></div>
          <div><dt>RNG</dt><dd>{rng}</dd></div>
          <div><dt>DIAL</dt><dd data-testid="inspector-dial">{known.base.dialIndex} / {dialLen}</dd></div>
          <div><dt>DAMAGE TAKEN</dt><dd>{known.base.damageTaken}</dd></div>
          <div><dt>DAMAGE DEALT</dt><dd>{known.base.damageDealt}</dd></div>
        </dl>
      ) : null}
      <p
        className="inspector__position"
        data-testid="inspector-position"
        aria-live={isOwn ? "off" : "polite"}
      >
        {isOwn
          ? `X ${known.position.x as number} · Y ${known.position.y as number} · POSITION: CONFIRMED · STATS: CONFIRMED`
          : known.confirmed
          ? `X ${known.position.x as number} · Y ${known.position.y as number} · POSITION: CONFIRMED · STATS: CONFIRMED`
          : `LAST SEEN R${known.confirmedRound} · POSITION: UNCONFIRMED · STATS: CONFIRMED · DRIFT ±${known.driftRadius as number}`}
      </p>
      {known.base.destroyed ? (
        <p className="inspector__destroyed" role="alert">
          DESTROYED · ROUND {known.base.destroyedRound}
        </p>
      ) : null}
    </section>
  );
}
