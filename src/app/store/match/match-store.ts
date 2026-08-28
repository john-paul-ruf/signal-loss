/**
 * Match store (M17, session 08 checkpoint 1).
 *
 * Partitioned into distinct slices so a pointer-only overlay change
 * updates only the selection slice — the rail row, inspector, and
 * canvas terrain layer read from stable slices and stay pinned:
 *
 *   ┌────────────────────────────────┐
 *   │ engine    — authoritative      │  MatchState + AI diagnostics
 *   │ launch    — immutable          │  captured MatchLaunchConfig
 *   │ drafts    — human, per-squad   │  HumanDraftState (NEVER on MatchState)
 *   │ ai        — pending / ready    │  Map<squadId, AiStatus>
 *   │ selection — cursor / hover     │  SelectionState
 *   │ playback  — event cursor       │  PlaybackState (post-commit)
 *   │ present   — user preferences   │  MatchPresentation
 *   └────────────────────────────────┘
 *
 * The engine slice is REPLACED only by an engine-returned transition
 * (applyDeployments, resolveMovementPhase, resolveAttackPhase, end-round).
 * The store never mirrors an engine rule — it only stages inputs and
 * commits.
 *
 * The AI slice tracks pending requestIds so cancellation on
 * unmount / retry is O(1); a fresh commit reuses the same seed so the
 * response is byte-identical (FR-29).
 */

import { createStore, type StoreApi } from "zustand/vanilla";
import type {
  Catalog,
  ConstructId,
  Event,
  MatchConfig,
  MatchState,
  Placement,
  Posture,
  SquadAttackPlot,
  SquadId,
  SquadMovePlots,
  Vec2,
} from "../../../engine";
import {
  SQUAD_COUNT,
  advanceRoundAndRefill,
  applyDeploymentsWithEvents,
  applyDestruction,
  applyTrace,
  checkElimination,
  createMatch,
  resolveAttackStage,
  resolveMovementPhase,
  snapshotStartOfRound,
  sortEventsCanonical,
  squadId,
  updateKnownPositions,
} from "../../../engine";
import type { MatchLaunchConfig } from "../core";
import type {
  AiStatus,
  HumanDraftState,
  LaunchSnapshot,
  MatchModeId,
  MatchPresentation,
  PlaybackState,
  SelectionState,
} from "./types";
import {
  buildHumanAttackPlot,
  buildHumanMovePlot,
} from "./plot-draft";

/* ------------------------------------------------------------------------- */
/* State shape                                                                */
/* ------------------------------------------------------------------------- */

/** Non-fatal error kinds the store surfaces to the shell. */
export type MatchStoreError =
  | { readonly kind: "LAUNCH_MISSING" }
  | { readonly kind: "CREATE_FAILED"; readonly message: string }
  | { readonly kind: "AI_FAILED"; readonly squadId: SquadId; readonly message: string }
  | { readonly kind: "ENGINE_REJECTED"; readonly stage: "MOVE" | "ATTACK" | "DEPLOY"; readonly message: string };

export interface MatchStoreState {
  readonly launch: LaunchSnapshot | null;
  readonly catalog: Catalog | null;
  /** Authoritative match state — REPLACED only by an engine-returned transition. */
  readonly engine: MatchState | null;
  readonly mode: MatchModeId;
  readonly drafts: HumanDraftState;
  readonly ai: ReadonlyMap<number, AiStatus>;
  readonly selection: SelectionState;
  readonly playback: PlaybackState;
  readonly present: MatchPresentation;
  readonly lastError: MatchStoreError | null;
  /** Monotonic — bumped every time engine slice is replaced. Used for playback continuity. */
  readonly engineRevision: number;
}

/* ------------------------------------------------------------------------- */
/* Actions                                                                    */
/* ------------------------------------------------------------------------- */

export interface MatchStoreActions {
  /**
   * Boot the store from a launch config, an engine facade catalog, and a
   * pre-generated game map (both come from setup). Creates the match and
   * transitions to DEPLOYMENT mode. Returns false if createMatch fails.
   */
  boot(config: MatchLaunchConfig, catalog: Catalog, map: MatchConfig["map"]): boolean;

  /* Human deployment drafts */
  setDeploymentDraft(rosterIndex: number, position: Vec2): void;
  clearDeploymentDraft(rosterIndex: number): void;
  resetDeploymentDrafts(): void;

  /* Human movement drafts */
  setMoveDraft(constructId: ConstructId, waypoints: readonly Vec2[]): void;
  clearMoveDraft(constructId: ConstructId): void;
  setHold(constructId: ConstructId, hold: boolean): void;

  /* Human attack drafts */
  setAttackDraft(attackerId: ConstructId, targetId: ConstructId, called: boolean): void;
  clearAttackDraft(attackerId: ConstructId): void;
  setPostureDraft(constructId: ConstructId, posture: Posture): void;
  clearPostureDraft(constructId: ConstructId): void;

  /* AI slots */
  markAiPending(squadId: SquadId, requestId: number): void;
  markAiReadyDeploy(squadId: SquadId, placements: readonly Placement[]): void;
  markAiReadyMove(squadId: SquadId, plot: SquadMovePlots, diagnosticsSeed: string): void;
  markAiReadyAttack(squadId: SquadId, plot: SquadAttackPlot, diagnosticsSeed: string): void;
  markAiError(squadId: SquadId, requestId: number, errorKind: string, message: string): void;
  clearAiSlot(squadId: SquadId): void;

  /* Engine transitions */
  /**
   * Apply committed deployments from human draft + AI READY_DEPLOY slots.
   * Returns false with lastError on failure.
   */
  applyDeployment(): boolean;
  /**
   * Resolve the movement phase from human draft + AI READY_MOVE slots.
   * Transitions to MOVEMENT_PLAYBACK on success. Snapshots the current
   * engine state as playback's `beforeSnapshot`.
   */
  resolveMovement(): boolean;
  /**
   * Resolve the attack phase (which composes attack stage + trace +
   * destruction + elimination + refill). Transitions to ATTACK_PLAYBACK
   * on success.
   */
  resolveAttack(): boolean;

  /* Playback */
  playbackAdvance(): void;
  playbackStepBy(delta: number): void;
  playbackSkip(): void;
  playbackSetRunning(running: boolean): void;
  playbackSetSpeed(speed: 1 | 2 | 4): void;
  /**
   * Commit the playback session: apply its `afterSnapshot` as the new
   * engine state, clear the playback buffer, transition to the next
   * plot phase (or RESULT if the match is complete).
   */
  playbackFinish(): void;

  /* Selection / inspection */
  selectConstruct(id: ConstructId | null): void;
  inspectConstruct(id: ConstructId | null): void;
  hoverTarget(id: ConstructId | null): void;
  hoverWaypoint(point: Vec2 | null): void;
  toggleEnemyReach(): void;
  openRulesDrawer(anchor?: string | null): void;
  closeRulesDrawer(): void;

  /* Preferences */
  setHighContrastSquads(on: boolean): void;
  setShowRangeMeasure(on: boolean): void;
  setReducedMotion(on: boolean): void;

  /* Errors */
  clearError(): void;
}

export type MatchStore = MatchStoreState & MatchStoreActions;

/* ------------------------------------------------------------------------- */
/* Initial state                                                              */
/* ------------------------------------------------------------------------- */

function emptyDrafts(): HumanDraftState {
  return {
    deploymentDrafts: new Map(),
    moveDrafts: new Map(),
    holdSet: new Set(),
    attackDrafts: new Map(),
    postureDrafts: new Map(),
  };
}

function emptySelection(): SelectionState {
  return {
    selectedConstructId: null,
    inspectedConstructId: null,
    hoveredTargetId: null,
    hoveredWaypoint: null,
    showEnemyReach: false,
    rulesDrawerOpen: false,
    rulesDrawerAnchor: null,
  };
}

function emptyPlayback(): PlaybackState {
  return {
    running: false,
    cursor: 0,
    speed: 1,
    events: [],
    beforeSnapshot: null,
    afterSnapshot: null,
    stageKind: null,
  };
}

function initialState(): MatchStoreState {
  return {
    launch: null,
    catalog: null,
    engine: null,
    mode: "DEPLOYMENT",
    drafts: emptyDrafts(),
    ai: new Map(),
    selection: emptySelection(),
    playback: emptyPlayback(),
    present: {
      highContrastSquads: false,
      showRangeMeasure: true,
      reducedMotion: false,
    },
    lastError: null,
    engineRevision: 0,
  };
}

/* ------------------------------------------------------------------------- */
/* Store implementation                                                       */
/* ------------------------------------------------------------------------- */

export function createMatchStore(): StoreApi<MatchStore> {
  return createStore<MatchStore>((set, get) => ({
    ...initialState(),

    boot(config, catalog, map): boolean {
      const humanSquad = squadId(0);
      const aiSquads: [SquadId, SquadId, SquadId, SquadId] = [
        squadId(1),
        squadId(2),
        squadId(3),
        squadId(4),
      ];
      // Session-08 contract: the human's saved roster is passed in;
      // AI rosters are generated separately by Session 07's setup screen
      // before the match launches and land here via the same launch
      // payload extension. Until Session 07 wires that extension in, we
      // seed all five squads with the human roster so the engine's
      // create/deployment paths remain exercisable. AI rosters swap in
      // via the extended MatchLaunchConfig.
      // The persistence layer stores plain integer chassis/mount codes;
      // engine `Construct` uses branded types over the same numbers, so
      // the cast is safe at runtime and preserves the persistence layer
      // as the sole schema-owner.
      const humanRoster = {
        constructs: config.roster.constructs.map((c) => ({
          chassisCode: c.chassisCode,
          commanderCode: c.commanderCode,
          mounts: c.mounts.map((m) => ({
            hardpointIndex: m.hardpointIndex,
            mountCode: m.mountCode,
          })),
        })),
      } as unknown as MatchConfig["rosters"][number];
      const rosters: MatchConfig["rosters"] = [
        humanRoster,
        humanRoster,
        humanRoster,
        humanRoster,
        humanRoster,
      ];
      const seed = config.seed;
      const attempt = createMatch({
        seed,
        budget: config.budget as MatchConfig["budget"],
        aiTier: parseAiTier(config.aiTierId),
        catalog,
        map,
        rosters,
      });
      if (!attempt.ok) {
        set({
          lastError: {
            kind: "CREATE_FAILED",
            message: attempt.error.map((v) => `${v.rule}:${v.kind} ${v.message}`).join("; "),
          },
        });
        return false;
      }
      const launch: LaunchSnapshot = {
        humanSquadId: humanSquad,
        aiSquadIds: aiSquads,
        config: attempt.value.config,
        seed,
      };
      set({
        launch,
        catalog,
        engine: attempt.value,
        mode: "DEPLOYMENT",
        drafts: emptyDrafts(),
        ai: new Map(),
        selection: emptySelection(),
        playback: emptyPlayback(),
        lastError: null,
        engineRevision: 1,
      });
      return true;
    },

    /* --- deployment drafts --- */

    setDeploymentDraft(rosterIndex, position): void {
      const drafts = get().drafts;
      const next = new Map(drafts.deploymentDrafts);
      next.set(rosterIndex, position);
      set({ drafts: { ...drafts, deploymentDrafts: next } });
    },
    clearDeploymentDraft(rosterIndex): void {
      const drafts = get().drafts;
      if (!drafts.deploymentDrafts.has(rosterIndex)) return;
      const next = new Map(drafts.deploymentDrafts);
      next.delete(rosterIndex);
      set({ drafts: { ...drafts, deploymentDrafts: next } });
    },
    resetDeploymentDrafts(): void {
      set({ drafts: { ...get().drafts, deploymentDrafts: new Map() } });
    },

    /* --- movement drafts --- */

    setMoveDraft(constructId, waypoints): void {
      const drafts = get().drafts;
      const next = new Map(drafts.moveDrafts);
      next.set(constructId as number, waypoints.slice());
      const nextHold = new Set(drafts.holdSet);
      nextHold.delete(constructId as number);
      set({ drafts: { ...drafts, moveDrafts: next, holdSet: nextHold } });
    },
    clearMoveDraft(constructId): void {
      const drafts = get().drafts;
      if (!drafts.moveDrafts.has(constructId as number)) return;
      const next = new Map(drafts.moveDrafts);
      next.delete(constructId as number);
      set({ drafts: { ...drafts, moveDrafts: next } });
    },
    setHold(constructId, hold): void {
      const drafts = get().drafts;
      const nextHold = new Set(drafts.holdSet);
      const nextMoves = new Map(drafts.moveDrafts);
      if (hold) {
        nextHold.add(constructId as number);
        nextMoves.delete(constructId as number);
      } else {
        nextHold.delete(constructId as number);
      }
      set({ drafts: { ...drafts, holdSet: nextHold, moveDrafts: nextMoves } });
    },

    /* --- attack drafts --- */

    setAttackDraft(attackerId, targetId, called): void {
      const drafts = get().drafts;
      const next = new Map(drafts.attackDrafts);
      next.set(attackerId as number, { targetId, called });
      set({ drafts: { ...drafts, attackDrafts: next } });
    },
    clearAttackDraft(attackerId): void {
      const drafts = get().drafts;
      if (!drafts.attackDrafts.has(attackerId as number)) return;
      const next = new Map(drafts.attackDrafts);
      next.delete(attackerId as number);
      set({ drafts: { ...drafts, attackDrafts: next } });
    },
    setPostureDraft(constructId, posture): void {
      const drafts = get().drafts;
      const next = new Map(drafts.postureDrafts);
      next.set(constructId as number, posture);
      set({ drafts: { ...drafts, postureDrafts: next } });
    },
    clearPostureDraft(constructId): void {
      const drafts = get().drafts;
      if (!drafts.postureDrafts.has(constructId as number)) return;
      const next = new Map(drafts.postureDrafts);
      next.delete(constructId as number);
      set({ drafts: { ...drafts, postureDrafts: next } });
    },

    /* --- AI slots --- */

    markAiPending(sq, requestId): void {
      const ai = new Map(get().ai);
      ai.set(sq as number, { kind: "PENDING", requestId, since: get().engineRevision });
      set({ ai });
    },
    markAiReadyDeploy(sq, placements): void {
      const ai = new Map(get().ai);
      ai.set(sq as number, { kind: "READY_DEPLOY", placements });
      set({ ai });
    },
    markAiReadyMove(sq, plot, diagnosticsSeed): void {
      const ai = new Map(get().ai);
      ai.set(sq as number, { kind: "READY", plot, diagnosticsSeed });
      set({ ai });
    },
    markAiReadyAttack(sq, plot, diagnosticsSeed): void {
      const ai = new Map(get().ai);
      ai.set(sq as number, { kind: "READY", plot, diagnosticsSeed });
      set({ ai });
    },
    markAiError(sq, requestId, errorKind, message): void {
      const ai = new Map(get().ai);
      ai.set(sq as number, { kind: "ERROR", requestId, errorKind, message });
      set({
        ai,
        lastError: { kind: "AI_FAILED", squadId: sq, message: `[${errorKind}] ${message}` },
      });
    },
    clearAiSlot(sq): void {
      const ai = new Map(get().ai);
      ai.set(sq as number, { kind: "IDLE" });
      set({ ai });
    },

    /* --- engine transitions --- */

    applyDeployment(): boolean {
      const { engine, catalog, drafts, ai, launch } = get();
      if (engine === null || catalog === null || launch === null) {
        set({ lastError: { kind: "LAUNCH_MISSING" } });
        return false;
      }
      const perSquad: [
        readonly Placement[],
        readonly Placement[],
        readonly Placement[],
        readonly Placement[],
        readonly Placement[],
      ] = [
        collectHumanDeployments(drafts, launch.humanSquadId, engine),
        collectAiDeployments(ai, launch.aiSquadIds[0]),
        collectAiDeployments(ai, launch.aiSquadIds[1]),
        collectAiDeployments(ai, launch.aiSquadIds[2]),
        collectAiDeployments(ai, launch.aiSquadIds[3]),
      ];
      const result = applyDeploymentsWithEvents(engine, perSquad, catalog);
      if (!result.ok) {
        set({
          lastError: {
            kind: "ENGINE_REJECTED",
            stage: "DEPLOY",
            message: result.error.map((v) => `${v.rule}:${v.kind} ${v.message}`).join("; "),
          },
        });
        return false;
      }
      const canonicalEvents = sortEventsCanonical(result.value.events);
      const nextEngine = updateKnownPositions(result.value.state, catalog);
      set((prior) => ({
        engine: nextEngine,
        engineRevision: prior.engineRevision + 1,
        mode: "MOVEMENT_PLOT",
        drafts: emptyDrafts(),
        ai: new Map(),
        selection: emptySelection(),
        playback: {
          running: false,
          cursor: 0,
          speed: 1,
          events: canonicalEvents,
          beforeSnapshot: engine,
          afterSnapshot: nextEngine,
          stageKind: null, // deployment is not a playback stage — events are for the log only
        },
        lastError: null,
      }));
      return true;
    },

    resolveMovement(): boolean {
      const { engine, catalog, drafts, ai, launch } = get();
      if (engine === null || catalog === null || launch === null) {
        set({ lastError: { kind: "LAUNCH_MISSING" } });
        return false;
      }
      const humanPlot = buildHumanMovePlot(engine, launch.humanSquadId, drafts, catalog);
      const plots = collectSquadMovePlots(humanPlot, ai, launch.aiSquadIds);
      const result = resolveMovementPhase(engine, plots, catalog);
      if (!result.ok) {
        set({
          lastError: {
            kind: "ENGINE_REJECTED",
            stage: "MOVE",
            message: result.error.map((v) => `${v.rule}:${v.kind} ${v.message}`).join("; "),
          },
        });
        return false;
      }
      const afterMove = updateKnownPositions(result.value.state, catalog);
      set((prior) => ({
        engine: afterMove,
        engineRevision: prior.engineRevision + 1,
        mode: "MOVEMENT_PLAYBACK",
        drafts: emptyMovementDrafts(drafts),
        ai: new Map(),
        playback: {
          running: false,
          cursor: 0,
          speed: 1,
          events: sortEventsCanonical(result.value.events),
          beforeSnapshot: engine,
          afterSnapshot: afterMove,
          stageKind: "MOVEMENT",
        },
        lastError: null,
      }));
      return true;
    },

    resolveAttack(): boolean {
      const { engine, catalog, drafts, ai, launch } = get();
      if (engine === null || catalog === null || launch === null) {
        set({ lastError: { kind: "LAUNCH_MISSING" } });
        return false;
      }
      const humanPlot = buildHumanAttackPlot(engine, launch.humanSquadId, drafts);
      const plots = collectSquadAttackPlots(humanPlot, ai, launch.aiSquadIds);
      const attackResult = resolveAttackStage(engine, plots, catalog);
      if (!attackResult.ok) {
        set({
          lastError: {
            kind: "ENGINE_REJECTED",
            stage: "ATTACK",
            message: attackResult.error.map((v) => `${v.rule}:${v.kind} ${v.message}`).join("; "),
          },
        });
        return false;
      }
      // End-round pipeline: attack → trace → destruction → elimination → refill.
      const startSnap = snapshotStartOfRound(engine, catalog);
      const afterAttack = attackResult.value.state;
      const afterTrace = applyTrace(afterAttack, catalog);
      const afterDestruction = applyDestruction(
        afterTrace.state,
        catalog,
        attackResult.value.attackerDamageDealt,
      );
      const afterElim = checkElimination(afterDestruction.state, startSnap);
      const events = [
        ...attackResult.value.events,
        ...afterTrace.events,
        ...afterDestruction.events,
        ...afterElim.events,
      ];
      let finalState = afterElim.state;
      if (finalState.phase !== "COMPLETE") {
        const after = advanceRoundAndRefill(finalState, catalog);
        finalState = updateKnownPositions(after.state, catalog);
        events.push(...after.events);
      } else {
        finalState = updateKnownPositions(finalState, catalog);
      }
      set((prior) => ({
        engine: finalState,
        engineRevision: prior.engineRevision + 1,
        mode: "ATTACK_PLAYBACK",
        drafts: emptyAttackDrafts(drafts),
        ai: new Map(),
        playback: {
          running: false,
          cursor: 0,
          speed: 1,
          events: sortEventsCanonical(events),
          beforeSnapshot: engine,
          afterSnapshot: finalState,
          stageKind: "ATTACK",
        },
        lastError: null,
      }));
      return true;
    },

    /* --- playback --- */

    playbackAdvance(): void {
      const p = get().playback;
      if (p.cursor >= p.events.length) return;
      set({ playback: { ...p, cursor: p.cursor + 1 } });
    },
    playbackStepBy(delta): void {
      const p = get().playback;
      const next = clamp(p.cursor + delta, 0, p.events.length);
      if (next === p.cursor) return;
      set({ playback: { ...p, cursor: next } });
    },
    playbackSkip(): void {
      const p = get().playback;
      if (p.cursor === p.events.length) return;
      set({ playback: { ...p, cursor: p.events.length, running: false } });
    },
    playbackSetRunning(running): void {
      const p = get().playback;
      if (p.running === running) return;
      set({ playback: { ...p, running } });
    },
    playbackSetSpeed(speed): void {
      const p = get().playback;
      if (p.speed === speed) return;
      set({ playback: { ...p, speed } });
    },
    playbackFinish(): void {
      const { playback, engine } = get();
      if (playback.afterSnapshot === null) return;
      const next = playback.afterSnapshot;
      const mode: MatchModeId =
        next.phase === "COMPLETE"
          ? "RESULT"
          : next.phase === "MOVEMENT_PLOT"
          ? "MOVEMENT_PLOT"
          : next.phase === "ATTACK_PLOT"
          ? "ATTACK_PLOT"
          : "DEPLOYMENT";
      void engine;
      set((prior) => ({
        engine: next,
        engineRevision: prior.engineRevision + 1,
        mode,
        playback: emptyPlayback(),
      }));
    },

    /* --- selection --- */

    selectConstruct(id): void {
      const s = get().selection;
      if (s.selectedConstructId === id) return;
      set({ selection: { ...s, selectedConstructId: id } });
    },
    inspectConstruct(id): void {
      const s = get().selection;
      if (s.inspectedConstructId === id) return;
      set({ selection: { ...s, inspectedConstructId: id } });
    },
    hoverTarget(id): void {
      const s = get().selection;
      if (s.hoveredTargetId === id) return;
      set({ selection: { ...s, hoveredTargetId: id } });
    },
    hoverWaypoint(point): void {
      const s = get().selection;
      // Compare by value to avoid needless renders — pointers change coordinates constantly.
      if (
        (point === null && s.hoveredWaypoint === null) ||
        (point !== null &&
          s.hoveredWaypoint !== null &&
          (point.x as number) === (s.hoveredWaypoint.x as number) &&
          (point.y as number) === (s.hoveredWaypoint.y as number))
      ) {
        return;
      }
      set({ selection: { ...s, hoveredWaypoint: point } });
    },
    toggleEnemyReach(): void {
      const s = get().selection;
      set({ selection: { ...s, showEnemyReach: !s.showEnemyReach } });
    },
    openRulesDrawer(anchor = null): void {
      set({ selection: { ...get().selection, rulesDrawerOpen: true, rulesDrawerAnchor: anchor } });
    },
    closeRulesDrawer(): void {
      set({ selection: { ...get().selection, rulesDrawerOpen: false, rulesDrawerAnchor: null } });
    },

    /* --- preferences --- */

    setHighContrastSquads(on): void {
      set({ present: { ...get().present, highContrastSquads: on } });
    },
    setShowRangeMeasure(on): void {
      set({ present: { ...get().present, showRangeMeasure: on } });
    },
    setReducedMotion(on): void {
      set({ present: { ...get().present, reducedMotion: on } });
    },

    /* --- errors --- */

    clearError(): void {
      if (get().lastError === null) return;
      set({ lastError: null });
    },
  }));
}

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

function parseAiTier(id: string): number {
  if (id.startsWith("t") || id.startsWith("T")) {
    const n = parseInt(id.slice(1), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 3) return n;
  }
  const n = parseInt(id, 10);
  if (Number.isFinite(n) && n >= 1 && n <= 3) return n;
  return 1;
}

function collectHumanDeployments(
  drafts: HumanDraftState,
  humanSquadId: SquadId,
  engine: MatchState,
): readonly Placement[] {
  const out: Placement[] = [];
  const own = engine.constructs.filter((c) => c.squadId === humanSquadId);
  // rosterIndex is the ordinal position within the squad.
  for (let i = 0; i < own.length; i = i + 1) {
    const pos = drafts.deploymentDrafts.get(i);
    if (pos === undefined) continue;
    out.push({ rosterIndex: i, position: pos });
  }
  return out;
}

function collectAiDeployments(
  ai: ReadonlyMap<number, AiStatus>,
  sq: SquadId,
): readonly Placement[] {
  const slot = ai.get(sq as number);
  if (slot === undefined || slot.kind !== "READY_DEPLOY") return [];
  return slot.placements;
}

function collectSquadMovePlots(
  human: SquadMovePlots,
  ai: ReadonlyMap<number, AiStatus>,
  aiIds: readonly [SquadId, SquadId, SquadId, SquadId],
): [SquadMovePlots, SquadMovePlots, SquadMovePlots, SquadMovePlots, SquadMovePlots] {
  const out: SquadMovePlots[] = new Array(SQUAD_COUNT);
  out[human.squadId as number] = human;
  for (const sq of aiIds) {
    const slot = ai.get(sq as number);
    if (slot !== undefined && slot.kind === "READY") {
      const plot = slot.plot;
      if ("moves" in plot) {
        out[sq as number] = plot;
        continue;
      }
    }
    out[sq as number] = { squadId: sq, moves: [] };
  }
  return out as [SquadMovePlots, SquadMovePlots, SquadMovePlots, SquadMovePlots, SquadMovePlots];
}

function collectSquadAttackPlots(
  human: SquadAttackPlot,
  ai: ReadonlyMap<number, AiStatus>,
  aiIds: readonly [SquadId, SquadId, SquadId, SquadId],
): [SquadAttackPlot, SquadAttackPlot, SquadAttackPlot, SquadAttackPlot, SquadAttackPlot] {
  const out: SquadAttackPlot[] = new Array(SQUAD_COUNT);
  out[human.squadId as number] = human;
  for (const sq of aiIds) {
    const slot = ai.get(sq as number);
    if (slot !== undefined && slot.kind === "READY") {
      const plot = slot.plot;
      if ("attacks" in plot && "postures" in plot) {
        out[sq as number] = plot;
        continue;
      }
    }
    out[sq as number] = { squadId: sq, attacks: [], postures: [] };
  }
  return out as [SquadAttackPlot, SquadAttackPlot, SquadAttackPlot, SquadAttackPlot, SquadAttackPlot];
}

function emptyMovementDrafts(prior: HumanDraftState): HumanDraftState {
  return { ...prior, moveDrafts: new Map(), holdSet: new Set() };
}

function emptyAttackDrafts(prior: HumanDraftState): HumanDraftState {
  return { ...prior, attackDrafts: new Map(), postureDrafts: new Map() };
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/* ------------------------------------------------------------------------- */
/* Playback events accessor (exported so tests can look at them)              */
/* ------------------------------------------------------------------------- */

/** Type guard convenience — visible events up to the cursor. */
export function visibleEvents(playback: PlaybackState): readonly Event[] {
  return playback.events.slice(0, playback.cursor);
}
