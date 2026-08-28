/**
 * Reduced-motion event cards (design.md §5.8, NFR-5). Every animated
 * beat has a static information-complete card equivalent. The `card`
 * variant of an event carries the same numerical facts an animation
 * would convey — this is the review gate FR-26 mandates.
 */

import type { Event } from "../../../engine";

export interface EventCard {
  readonly key: string; // stable key for React
  readonly kind: Event["kind"];
  readonly round: number;
  readonly title: string;
  readonly detail: string;
}

/**
 * Convert one event to a card. Called once per event; the returned
 * `key` is unique-enough within a phase for React's diffing to work
 * (kind + round + salient id).
 */
export function toCard(event: Event, index: number): EventCard {
  const round = event.round;
  const base = { key: `${index}-${event.kind}-${round}`, kind: event.kind, round };
  switch (event.kind) {
    case "DEPLOYMENT_REVEAL":
      return {
        ...base,
        title: `R${round} · DEPLOYMENT REVEAL`,
        detail: `${event.placements.length} constructs revealed simultaneously.`,
      };
    case "POOL_REFILL":
      return {
        ...base,
        title: `R${round} · POOL REFILL · squad ${event.squadId as number}`,
        detail: `${event.total} = ${event.base} base + ${event.commanderBase} cmd + ⌊${event.aliveCount}/${event.rDivisor}⌋=${event.unitTerm}${
          event.commanderLost ? " · COMMANDER LOST" : ""
        }`,
      };
    case "MOVED":
      return {
        ...base,
        title: `R${round} · construct ${event.constructId as number} moved`,
        detail: `${event.pathDistance} of ${event.plottedLength}${
          event.halted ? " · HALTED" : ""
        }`,
      };
    case "HALTED":
      return {
        ...base,
        title: `R${round} · construct ${event.constructId as number} HALT — CONTACT`,
        detail: `Contact with ${event.withConstructs
          .map((c) => c as number)
          .join(", ")} at substep ${event.atSubstep}.`,
      };
    case "POSTURE_REVEAL":
      return {
        ...base,
        title: `R${round} · construct ${event.constructId as number} posture reveal`,
        detail: `${event.posture}`,
      };
    case "SHOT":
      return {
        ...base,
        title: `R${round} · construct ${event.attackerId as number} ${
          event.called ? "»CALLED→" : "NORMAL→"
        } ${event.targetId as number}`,
        detail: event.landed
          ? `${event.damage} dmg · target ${event.targetPosture} · base ${event.baseDamage}`
          : `no land · base ${event.baseDamage}`,
      };
    case "DEFENSE_INFO":
      return {
        ...base,
        title: `R${round} · defense info`,
        detail: `attacker ${event.attackerId as number} → ${event.targetId as number} · ${event.reason}`,
      };
    case "DAMAGE_APPLIED":
      return {
        ...base,
        title: `R${round} · construct ${event.targetId as number} damage applied`,
        detail: `${event.damage}`,
      };
    case "DIAL_ADVANCED":
      return {
        ...base,
        title: `R${round} · construct ${event.constructId as number} dial advance`,
        detail: `${event.from} → ${event.to}`,
      };
    case "TRACE_DAMAGE":
      return {
        ...base,
        title: `R${round} · construct ${event.constructId as number} trace damage`,
        detail: `${event.damage} · step ${event.stepIndex}`,
      };
    case "DESTROYED":
      return {
        ...base,
        title: `R${round} · construct ${event.constructId as number} DESTROYED`,
        detail: `${event.cause}${event.wasCommander ? " · commander" : ""}`,
      };
    case "ELIMINATED":
      return {
        ...base,
        title: `R${round} · squad ${event.squadId as number} ELIMINATED`,
        detail: `placement ${event.placement}`,
      };
    case "MATCH_COMPLETE":
      return {
        ...base,
        title: `R${round} · MATCH COMPLETE`,
        detail:
          event.reason +
          (event.winner !== null ? ` · winner squad ${event.winner as number}` : ""),
      };
  }
}

/**
 * Assert every kind has a card representation — compile-time check.
 * (Reduced motion must be information-complete; a new engine event
 * kind that lacks a card would break FR-26. This function fails
 * at build time if a case is missing.)
 */
export function everyKindCovered(kind: Event["kind"]): 1 {
  switch (kind) {
    case "DEPLOYMENT_REVEAL":
    case "POOL_REFILL":
    case "MOVED":
    case "HALTED":
    case "POSTURE_REVEAL":
    case "SHOT":
    case "DEFENSE_INFO":
    case "DAMAGE_APPLIED":
    case "DIAL_ADVANCED":
    case "TRACE_DAMAGE":
    case "DESTROYED":
    case "ELIMINATED":
    case "MATCH_COMPLETE":
      return 1;
  }
}
