import * as React from "react";
import { Banner } from "../../../components/shared/index";
import {
  CommanderDeltaGrid,
  CurveChart,
  baseMovement,
  fxUnits,
} from "../../../components/build/index";
import type {
  Catalog,
  Chassis,
  ChassisCode,
  CommanderCode,
  Mount,
  MountCode,
  Violation,
} from "../../../../engine/index";
import {
  draftCost,
  draftViolations,
  isComposable,
  mountAt,
  mountMismatchReason,
  type ComposerDraft,
} from "../../../store/build/composer";

/**
 * Keyboard-complete construct composer (design.md §5.2, FR-2/FR-3). Four
 * regions in Tab order — chassis, construct/ports, mounts, dial+commander —
 * each a roving-tabindex list so arrow keys move within a region and Tab
 * moves between regions, exactly the locked keyboard map (design.md §5.2 /
 * §7). This component is presentational: all persistence and draft
 * mutation happens in the container; this file owns only transient
 * interaction state (search text, show-all toggle, selected port, roving
 * focus indices).
 */

export interface ComposerActions {
  readonly onSetChassis: (code: ChassisCode) => void;
  readonly onSetCommander: (code: CommanderCode | null) => void;
  readonly onMount: (hardpointIndex: number, mountCode: MountCode) => void;
  readonly onUnmount: (hardpointIndex: number) => void;
  readonly onSetName: (name: string) => void;
  readonly onSetTargetBudget: (budget: number) => void;
  readonly onUndo: () => void;
  readonly onSave: () => void;
  readonly onCopy: (text: string) => void;
}

export interface ComposerViewProps {
  readonly catalog: Catalog;
  readonly draft: ComposerDraft;
  readonly name: string;
  readonly targetBudget: number;
  readonly budgetOptions: readonly number[];
  readonly contextLabel: string;
  readonly canUndo: boolean;
  readonly shareString: string | null;
  readonly saveLabel: string;
  readonly justSaved: boolean;
  readonly actions: ComposerActions;
}

/** Roving-tabindex helper: one item at a time is a tab stop; arrows move it. */
function useRoving(length: number): {
  readonly index: number;
  readonly setRefs: (i: number) => (el: HTMLButtonElement | null) => void;
  readonly onKeyDown: (e: React.KeyboardEvent) => void;
  readonly tabIndexFor: (i: number) => number;
  readonly select: (i: number) => void;
} {
  const [index, setIndex] = React.useState(0);
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const clamped = length === 0 ? 0 : Math.min(index, length - 1);
  function focusAt(i: number): void {
    setIndex(i);
    refs.current[i]?.focus();
  }
  return {
    index: clamped,
    setRefs: (i) => (el) => {
      refs.current[i] = el;
    },
    onKeyDown: (e) => {
      if (length === 0) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        focusAt((clamped + 1) % length);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        focusAt((clamped - 1 + length) % length);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusAt(0);
      } else if (e.key === "End") {
        e.preventDefault();
        focusAt(length - 1);
      }
    },
    tabIndexFor: (i) => (i === clamped ? 0 : -1),
    select: setIndex,
  };
}

function ChassisCard(props: {
  readonly chassis: Chassis;
  readonly selected: boolean;
  readonly tabIndex: number;
  readonly innerRef: (el: HTMLButtonElement | null) => void;
  readonly onSelect: () => void;
}): React.ReactElement {
  const { chassis: c, selected, tabIndex, innerRef, onSelect } = props;
  return (
    <button
      type="button"
      ref={innerRef}
      tabIndex={tabIndex}
      aria-pressed={selected}
      onClick={onSelect}
      className={`block w-full border-b border-line px-3 py-2.5 text-left ${
        selected ? "border-l-2 border-l-sys bg-panel-3" : "hover:bg-panel-2"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-ink">{c.name}</span>
        <span className="ml-auto font-mono text-[12px] tabular-nums text-sys">{c.cost}</span>
      </div>
      <div className="mt-1.5 font-mono text-[10px] tabular-nums text-ink-3">
        MOVE {fxUnits(baseMovement(c))} · FOOT {fxUnits(c.footprint)}
      </div>
      <div className="mt-1.5">
        <CurveChart values={c.dial.map((s) => s.damage)} family={c.curveFamily} />
      </div>
    </button>
  );
}

function violationsFor(hardpointPath: string, violations: readonly Violation[]): readonly Violation[] {
  return violations.filter((v) => v.path.includes(hardpointPath));
}

export function ComposerView(props: ComposerViewProps): React.ReactElement {
  const { catalog, draft, name, targetBudget, budgetOptions, contextLabel, canUndo, shareString, saveLabel, justSaved, actions } =
    props;

  const [chassisFilter, setChassisFilter] = React.useState("");
  const [showAllMounts, setShowAllMounts] = React.useState(false);
  const [selectedPort, setSelectedPort] = React.useState<number | null>(null);
  const [mismatch, setMismatch] = React.useState<{ readonly hardpointIndex: number; readonly reason: string } | null>(
    null,
  );
  const searchRef = React.useRef<HTMLInputElement>(null);

  const chassis = draft.chassisCode !== null ? catalog.indexes.chassisByCode.get(draft.chassisCode) ?? null : null;
  const commander = draft.commanderCode !== null ? catalog.indexes.commanderTypeByCode.get(draft.commanderCode) ?? null : null;
  const violations = draftViolations(draft, catalog);
  const cost = draftCost(draft, catalog);
  const remaining = targetBudget - cost;
  const legal = isComposable(draft) && violations.length === 0;

  const filteredChassis = catalog.chassis.filter((c) =>
    c.name.toLowerCase().includes(chassisFilter.trim().toLowerCase()),
  );
  const chassisRoving = useRoving(filteredChassis.length);

  const ports = chassis?.hardpoints ?? [];
  const portRoving = useRoving(ports.length);

  const selectedHardpointType =
    selectedPort !== null ? ports[selectedPort]?.typeId ?? null : null;
  const compatibleMounts = catalog.mounts.filter((m) => m.requiredHardpointType === selectedHardpointType);
  const otherMounts = catalog.mounts.filter((m) => m.requiredHardpointType !== selectedHardpointType);
  const visibleMounts: readonly Mount[] =
    selectedHardpointType === null
      ? catalog.mounts
      : showAllMounts
        ? [...compatibleMounts, ...otherMounts]
        : compatibleMounts;
  const mountRoving = useRoving(visibleMounts.length);

  function typeName(typeId: Mount["requiredHardpointType"]): string {
    return catalog.indexes.hardpointTypeById.get(typeId)?.name ?? String(typeId);
  }

  function attemptMount(mount: Mount): void {
    const targetIndex =
      selectedPort ?? ports.findIndex((p, i) => p.typeId === mount.requiredHardpointType && mountAt(draft, i) === null);
    if (targetIndex < 0) {
      setMismatch({ hardpointIndex: -1, reason: "SELECT A PORT FIRST" });
      return;
    }
    const reason = mountMismatchReason(draft, targetIndex, mount.code, catalog);
    if (reason !== null) {
      setMismatch({ hardpointIndex: targetIndex, reason: `TYPE MISMATCH — ${reason}` });
      return;
    }
    setMismatch(null);
    actions.onMount(targetIndex, mount.code);
  }

  function handleRootKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    const target = e.target as HTMLElement;
    const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
    if (e.key === "/" && !isTyping) {
      e.preventDefault();
      searchRef.current?.focus();
    } else if (e.key === "c" && !isTyping) {
      e.preventDefault();
      if (draft.commanderCode !== null) {
        actions.onSetCommander(null);
      } else {
        const first = catalog.commanderTypes[0];
        if (first !== undefined) actions.onSetCommander(first.code);
      }
    } else if (e.key === "Backspace" && !isTyping) {
      e.preventDefault();
      if (selectedPort !== null && mountAt(draft, selectedPort) !== null) {
        actions.onUnmount(selectedPort);
        setMismatch(null);
      }
    }
  }

  return (
    <main className="min-h-full bg-void" role="main" onKeyDown={handleRootKeyDown}>
      <header className="flex h-12 items-center gap-4 border-b border-line bg-panel px-4">
        <a href="#/build" className="text-[11px] uppercase tracking-[0.14em] text-ink-3 hover:text-sys">
          ← Collection
        </a>
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink">Build Zone · Composer</span>
        <span className="h-4 w-px bg-line" />
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-2">{contextLabel}</span>
        <span className="h-4 w-px bg-line" />
        <label className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-4">Construct</span>
          <input
            value={name}
            onChange={(e) => actions.onSetName(e.target.value)}
            className="w-40 border border-line-2 bg-panel-3 px-2 py-1 text-[13px] text-ink outline-none focus-visible:border-sys"
          />
        </label>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-4">
              Search <kbd className="border border-line-2 px-1 text-[9px] text-ink-3">/</kbd>
            </span>
            <input
              ref={searchRef}
              value={chassisFilter}
              onChange={(e) => setChassisFilter(e.target.value)}
              placeholder="FILTER CHASSIS…"
              className="w-40 border border-line-2 bg-panel-3 px-2 py-1 text-[11px] text-ink outline-none placeholder:text-ink-4 focus-visible:border-sys"
            />
          </label>
          <a href="#/codex" className="border border-line-2 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-2 hover:border-sys hover:text-ink">
            Codex
          </a>
        </div>
      </header>

      <div className="grid" style={{ gridTemplateColumns: "280px 1fr 300px" }}>
        {/* Region 1 — CHASSIS */}
        <section aria-label="1. Chassis" className="border-r border-line bg-panel">
          <div className="flex h-9 items-center justify-between border-b border-line px-3">
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-2">1 · Chassis</span>
            <span className="font-mono text-[10px] tabular-nums text-ink-4">{filteredChassis.length} shown</span>
          </div>
          <div role="listbox" aria-label="Chassis" onKeyDown={chassisRoving.onKeyDown} className="max-h-[520px] overflow-y-auto">
            {filteredChassis.map((c, i) => (
              <ChassisCard
                key={c.id}
                chassis={c}
                selected={draft.chassisCode === c.code}
                tabIndex={chassisRoving.tabIndexFor(i)}
                innerRef={chassisRoving.setRefs(i)}
                onSelect={() => {
                  chassisRoving.select(i);
                  actions.onSetChassis(c.code);
                  setSelectedPort(null);
                  setMismatch(null);
                }}
              />
            ))}
          </div>
        </section>

        {/* Region 2 — CONSTRUCT */}
        <section aria-label="2. Construct" className="border-r border-line">
          <div className="flex h-9 items-center justify-between border-b border-line bg-panel px-4">
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-2">2 · Construct</span>
            {chassis !== null ? (
              <span className="font-mono text-[10px] tabular-nums text-ink-3">
                {chassis.name} · {ports.length} HARDPOINTS · {draft.mounts.length} FILLED
              </span>
            ) : null}
          </div>
          {chassis === null ? (
            <div className="px-6 py-10 font-mono text-[12px] text-ink-3">
              SELECT A CHASSIS TO BEGIN COMPOSING.
            </div>
          ) : (
            <div className="px-4 py-4">
              {commander !== null ? (
                <div className="mb-3 inline-block border border-sys/50 px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-sys">
                  ◆ CMD · {commander.name}
                </div>
              ) : null}
              <div role="listbox" aria-label="Hardpoints" onKeyDown={portRoving.onKeyDown} className="grid grid-cols-2 gap-2">
                {ports.map((port, i) => {
                  const assignment = mountAt(draft, i);
                  const mount = assignment !== null ? catalog.indexes.mountByCode.get(assignment.mountCode) ?? null : null;
                  const isSelected = selectedPort === i;
                  const portViolations = violationsFor(`mounts[${i}]`, violations);
                  const hasError = portViolations.length > 0 || (mismatch !== null && mismatch.hardpointIndex === i);
                  return (
                    <button
                      key={i}
                      type="button"
                      ref={portRoving.setRefs(i)}
                      tabIndex={portRoving.tabIndexFor(i)}
                      aria-pressed={isSelected}
                      aria-describedby={hasError ? `port-error-${i}` : undefined}
                      onClick={() => {
                        portRoving.select(i);
                        setSelectedPort(i);
                        setMismatch(null);
                      }}
                      className={`border px-3 py-2.5 text-left ${
                        hasError
                          ? "border-bad"
                          : isSelected
                            ? "border-sys bg-sys/10"
                            : mount !== null
                              ? "border-line-2 bg-panel-2"
                              : "border-line-2 border-dashed bg-panel"
                      }`}
                    >
                      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-4">
                        Port {i + 1} · {typeName(port.typeId)}
                      </div>
                      {mount !== null ? (
                        <>
                          <div className="mt-1 text-[12px] font-semibold text-ink">{mount.name}</div>
                          <div className="mt-0.5 font-mono text-[10px] tabular-nums text-ink-3">{mount.cost} PT</div>
                        </>
                      ) : (
                        <div className="mt-1 text-[12px] text-ink-3">EMPTY · LEGAL · COSTS 0</div>
                      )}
                    </button>
                  );
                })}
              </div>
              {mismatch !== null ? (
                <p role="alert" id={mismatch.hardpointIndex >= 0 ? `port-error-${mismatch.hardpointIndex}` : undefined} className="mt-3 border border-bad/50 bg-bad/[0.05] px-3 py-2 font-mono text-[11px] text-bad">
                  {mismatch.reason}
                </p>
              ) : null}

              <div className="mt-4 border border-line bg-panel p-3">
                <div className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-3">Construct cost</div>
                <div className="font-mono text-[11px] tabular-nums text-ink-2">
                  <div className="flex justify-between">
                    <span>{chassis.name}</span>
                    <span>{chassis.cost}</span>
                  </div>
                  {draft.mounts.map((m, i) => {
                    const mount = catalog.indexes.mountByCode.get(m.mountCode);
                    return (
                      <div key={i} className="flex justify-between">
                        <span>{mount?.name ?? `#${m.mountCode}`}</span>
                        <span>{mount?.cost ?? 0}</span>
                      </div>
                    );
                  })}
                  {commander !== null ? (
                    <div className="flex justify-between text-sys">
                      <span>◆ CMD {commander.name}</span>
                      <span>{commander.cost}</span>
                    </div>
                  ) : null}
                  <div className="mt-1 flex justify-between border-t border-line pt-1 text-[13px] text-ink">
                    <span>TOTAL</span>
                    <span>{cost}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Region 3 — MOUNTS */}
        <section aria-label="3. Mounts" className="bg-panel">
          <div className="flex h-9 items-center justify-between border-b border-line px-3">
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-2">3 · Mounts</span>
            <div className="flex items-center gap-1">
              {selectedHardpointType !== null ? (
                <span className="bg-sys px-1.5 py-[2px] text-[10px] uppercase tracking-[0.14em] text-void">
                  {typeName(selectedHardpointType)}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setShowAllMounts((v) => !v)}
                aria-pressed={showAllMounts}
                className="border border-line-2 px-1.5 py-[2px] text-[10px] uppercase tracking-[0.14em] text-ink-3 hover:text-ink-2"
              >
                Show all
              </button>
            </div>
          </div>
          <div role="listbox" aria-label="Mounts" onKeyDown={mountRoving.onKeyDown} className="max-h-[520px] overflow-y-auto">
            {visibleMounts.map((m, i) => {
              const compatible = selectedHardpointType === null || m.requiredHardpointType === selectedHardpointType;
              const wouldCost = cost + m.cost;
              const overBudget = chassis !== null && wouldCost > targetBudget;
              const isMounted = selectedPort !== null && mountAt(draft, selectedPort)?.mountCode === m.code;
              return (
                <button
                  key={m.id}
                  type="button"
                  ref={mountRoving.setRefs(i)}
                  tabIndex={mountRoving.tabIndexFor(i)}
                  disabled={chassis === null}
                  onClick={() => attemptMount(m)}
                  className={`block w-full border-b border-line px-3 py-2.5 text-left ${
                    isMounted ? "border-l-2 border-l-vector bg-panel-3" : compatible ? "hover:bg-panel-2" : "opacity-45"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">{m.name}</span>
                    {isMounted ? <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-ok">✓ Mounted</span> : null}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] tabular-nums text-ink-2">
                    <span className="border border-line-2 px-1 text-ink-4">{m.family}</span>
                    <span>DMG {m.damageDelta >= 0 ? "+" : ""}{m.damageDelta}</span>
                    <span>RNG {fxUnits(m.rangeDelta)}</span>
                    <span className={`ml-auto ${overBudget ? "text-warn" : "text-ink"}`}>{m.cost}</span>
                  </div>
                  {!compatible ? (
                    <div className="mt-1 font-mono text-[9.5px] text-ink-4">{typeName(m.requiredHardpointType)} PORT ONLY</div>
                  ) : null}
                  {overBudget ? (
                    <div className="mt-1 font-mono text-[9.5px] text-warn">+{wouldCost - targetBudget} OVER TARGET BUDGET</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Region 4 — DIAL + COMMANDER */}
      <section aria-label="4. Dial and commander" className="border-t border-line bg-panel px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.14em] text-ink-2">4 · Dial</span>
          {chassis !== null ? (
            <span className="font-mono text-[10px] tabular-nums text-ink-4">
              {chassis.name} · {chassis.curveFamily} · {chassis.dial.length} states
            </span>
          ) : null}
        </div>
        {chassis !== null ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 340px" }}>
            <CommanderDeltaGrid chassis={chassis} commander={commander} caption={`${chassis.name} dial`} />
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.14em] text-ink-2">
                  Commander tag <kbd className="border border-line-2 px-1 text-[9px] text-ink-3">C</kbd>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  aria-pressed={draft.commanderCode === null}
                  onClick={() => actions.onSetCommander(null)}
                  className={`border px-2 py-1.5 text-left ${draft.commanderCode === null ? "border-sys bg-sys/10" : "border-line-2 hover:border-sys"}`}
                >
                  <span className="text-[12px] font-semibold text-ink">NONE</span>
                </button>
                {catalog.commanderTypes.map((ct) => (
                  <button
                    key={ct.id}
                    type="button"
                    aria-pressed={draft.commanderCode === ct.code}
                    onClick={() => actions.onSetCommander(ct.code)}
                    className={`border px-2 py-1.5 text-left ${
                      draft.commanderCode === ct.code ? "border-sys bg-sys/10" : "border-line-2 hover:border-sys"
                    }`}
                  >
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[12px] font-semibold tracking-wide text-ink">{ct.name}</span>
                      <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-3">+{ct.cost}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[9px] text-ink-4">BASE {ct.commanderBase}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="font-mono text-[12px] text-ink-3">Select a chassis to see its dial.</p>
        )}
      </section>

      {/* Footer — budget + legality + actions */}
      <footer className="flex items-center gap-4 border-t border-line bg-panel-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Target budget</span>
          <select
            value={targetBudget}
            onChange={(e) => actions.onSetTargetBudget(Number(e.target.value))}
            className="border border-line-2 bg-panel-3 px-2 py-1 font-mono text-[12px] tabular-nums text-ink"
          >
            {budgetOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <span className="font-mono text-[13px] tabular-nums text-ink">
            {cost}/{targetBudget}
          </span>
          <span className={`font-mono text-[12px] tabular-nums ${remaining < 0 ? "text-warn" : "text-ok"}`}>
            {remaining < 0 ? `${Math.abs(remaining)} OVER TARGET` : `${remaining} REMAINING`}
          </span>
        </div>

        <div className="min-w-[220px] flex-1">
          {isComposable(draft) ? (
            legal ? (
              <Banner tone="ok" title="Construct legal">
                Every mount matches its port type.
              </Banner>
            ) : (
              <Banner tone="bad" assertive title="Construct illegal">
                <ul className="list-disc pl-5 font-mono text-[11px] text-ink-2">
                  {violations.map((v, i) => (
                    <li key={i}>
                      {v.rule}: {v.message}
                    </li>
                  ))}
                </ul>
              </Banner>
            )
          ) : (
            <Banner tone="info" title="Select a chassis">
              A construct is a chassis plus zero or more mounts.
            </Banner>
          )}
        </div>

        <button
          type="button"
          onClick={actions.onUndo}
          disabled={!canUndo}
          className="border border-line-2 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-ink-2 hover:border-sys disabled:opacity-40"
        >
          Undo
        </button>
        {shareString !== null ? (
          <button
            type="button"
            onClick={() => actions.onCopy(shareString)}
            className="border border-sys/60 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-sys hover:bg-sys/10"
          >
            Copy string
          </button>
        ) : null}
        <button
          type="button"
          onClick={actions.onSave}
          disabled={!legal}
          data-testid="save-construct"
          className="bg-sys px-5 py-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-void hover:brightness-110 disabled:opacity-40"
        >
          {saveLabel}
        </button>
        {justSaved ? (
          <span role="status" className="text-[11px] uppercase tracking-[0.14em] text-ok">
            ✓ Saved
          </span>
        ) : null}
      </footer>
    </main>
  );
}
