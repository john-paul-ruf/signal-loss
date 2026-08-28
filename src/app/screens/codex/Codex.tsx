import * as React from "react";
import type { Catalog, Chassis, Mount } from "../../../engine/index";
import { resolveCatalog } from "../../store/build/index";
import {
  CurveChart,
  DialStatGrid,
  HardpointBadges,
  baseMovement,
  dialStateRange,
  fxUnits,
  signed,
} from "../../components/build/index";
import { nextSort, sortWithTiebreak, type SortState } from "./sort";

const CONTRACT_LINE = "EVERY VALUE SHOWN HERE IS THE VALUE USED IN RESOLUTION";

interface ColumnDef<T, K extends string> {
  readonly key: K;
  readonly label: string;
  readonly numeric: boolean;
  readonly extract: (item: T) => string | number;
}

function SortableHeader<K extends string>(props: {
  readonly column: { readonly key: K; readonly label: string; readonly numeric: boolean };
  readonly sort: SortState<K>;
  readonly onSort: (key: K) => void;
}): React.ReactElement {
  const { column, sort, onSort } = props;
  const active = sort.key === column.key;
  return (
    <th
      scope="col"
      aria-sort={active ? sort.dir : "none"}
      className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] ${
        column.numeric ? "text-right" : "text-left"
      } ${active ? "text-sys" : "text-ink-3"}`}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className="inline-flex items-center gap-1 uppercase tracking-[0.14em] hover:text-ink-2"
      >
        {column.label}
        <span aria-hidden="true" className={active ? "opacity-100" : "opacity-40"}>
          {active ? (sort.dir === "ascending" ? "▲" : "▼") : "▲"}
        </span>
      </button>
    </th>
  );
}

function DisclosureButton(props: {
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly label: string;
  readonly controls: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-expanded={props.expanded}
      aria-controls={props.controls}
      onClick={props.onToggle}
      className="inline-flex items-center gap-2 text-left"
    >
      <span aria-hidden="true" className={`text-ink-3 ${props.expanded ? "text-sys" : ""}`}>
        {props.expanded ? "▾" : "▸"}
      </span>
      <span className="text-[14px] text-ink">{props.label}</span>
    </button>
  );
}

function ChassisTable(props: { readonly catalog: Catalog }): React.ReactElement {
  const { catalog } = props;
  const [sort, setSort] = React.useState<SortState<string>>({ key: "name", dir: "ascending" });
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set());

  const columns: readonly ColumnDef<Chassis, string>[] = [
    { key: "name", label: "Chassis", numeric: false, extract: (c) => c.name },
    { key: "cost", label: "Cost", numeric: true, extract: (c) => c.cost },
    { key: "curve", label: "Curve family", numeric: false, extract: (c) => c.curveFamily },
    { key: "move", label: "Move", numeric: true, extract: (c) => baseMovement(c) },
    { key: "foot", label: "Foot", numeric: true, extract: (c) => c.footprint },
    { key: "states", label: "States", numeric: true, extract: (c) => c.dial.length },
  ];
  const column = columns.find((c) => c.key === sort.key) ?? columns[0];
  if (column === undefined) throw new Error("codex: no sortable columns");
  const rows = sortWithTiebreak(catalog.chassis, column.extract, (c) => c.id, sort.dir);

  function typeNames(chassis: Chassis): readonly string[] {
    return chassis.hardpoints.map(
      (hp) => catalog.indexes.hardpointTypeById.get(hp.typeId)?.name ?? String(hp.typeId),
    );
  }
  function toggle(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-end gap-2 font-mono text-[10px] tabular-nums text-ink-3">
        <button
          type="button"
          className="border border-line px-2 py-1 hover:border-line-2 hover:text-ink-2"
          onClick={() => setExpanded(new Set(catalog.chassis.map((c) => c.id)))}
        >
          EXPAND ALL DIALS
        </button>
        <button
          type="button"
          className="border border-line px-2 py-1 hover:border-line-2 hover:text-ink-2"
          onClick={() => setExpanded(new Set())}
        >
          COLLAPSE
        </button>
      </div>
      <div className="border border-line bg-panel">
        <table className="w-full border-collapse">
          <thead className="bg-panel-2">
            <tr>
              {columns.map((c) => (
                <SortableHeader
                  key={c.key}
                  column={c}
                  sort={sort}
                  onSort={(key) => setSort((prev) => nextSort(prev, key))}
                />
              ))}
              <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
                Hardpoints
              </th>
              <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
                DMG across dial
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const isOpen = expanded.has(c.id);
              const detailId = `dial-${c.id}`;
              return (
                <React.Fragment key={c.id}>
                  <tr className="border-t border-line">
                    <td className="px-3 py-2">
                      <DisclosureButton
                        expanded={isOpen}
                        onToggle={() => toggle(c.id)}
                        controls={detailId}
                        label={c.name}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink">{c.cost}</td>
                    <td className="px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-ink-2">{c.curveFamily}</td>
                    <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-2">{fxUnits(baseMovement(c))}</td>
                    <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-2">{fxUnits(c.footprint)}</td>
                    <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-2">{c.dial.length}</td>
                    <td className="px-3 py-2">
                      <HardpointBadges typeNames={typeNames(c)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <CurveChart values={c.dial.map((s) => s.damage)} family={c.curveFamily} />
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr id={detailId}>
                      <td colSpan={columns.length + 2} className="bg-panel-2 p-0">
                        <div className="grid grid-cols-[1fr_360px] gap-6 border-t border-line-2 p-5">
                          <div>
                            <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-ink-3">
                              Dial — {c.dial.length} states · {c.curveFamily} · advancing past S
                              {c.dial.length} destroys the construct
                            </div>
                            <DialStatGrid chassis={c} caption={`${c.name} dial`} />
                          </div>
                          <div>
                            <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-ink-3">
                              Stat curves — DMG and RANGE across dial states
                            </div>
                            <div className="flex flex-col gap-3 border border-line bg-panel p-4">
                              <div className="flex items-center gap-3">
                                <span className="w-14 text-[10px] uppercase tracking-[0.14em] text-ink-3">DMG</span>
                                <CurveChart values={c.dial.map((s) => s.damage)} family={c.curveFamily} width={220} height={40} stroke="var(--color-ink)" />
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="w-14 text-[10px] uppercase tracking-[0.14em] text-ink-3">RNG</span>
                                <CurveChart values={c.dial.map((s) => dialStateRange(c, s))} family={c.curveFamily} width={220} height={40} stroke="var(--color-ink-3)" />
                              </div>
                            </div>
                            <div className="mt-3 flex gap-2 font-mono text-[10px] tabular-nums text-ink-3">
                              <span className="border border-line px-2 py-1">RESOLUTION RANGE {fxUnits(c.resolutionRange)}</span>
                              <span className="border border-line px-2 py-1">BASE RANGE {fxUnits(c.baseRange)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MountTable(props: { readonly catalog: Catalog }): React.ReactElement {
  const { catalog } = props;
  const [sort, setSort] = React.useState<SortState<string>>({ key: "name", dir: "ascending" });
  const columns: readonly ColumnDef<Mount, string>[] = [
    { key: "name", label: "Mount", numeric: false, extract: (m) => m.name },
    { key: "cost", label: "Cost", numeric: true, extract: (m) => m.cost },
    { key: "family", label: "Family", numeric: false, extract: (m) => m.family },
    { key: "port", label: "Required port", numeric: false, extract: (m) => portName(catalog, m) },
    { key: "dmg", label: "DMG Δ", numeric: true, extract: (m) => m.damageDelta },
    { key: "range", label: "RNG Δ", numeric: true, extract: (m) => m.rangeDelta },
  ];
  const column = columns.find((c) => c.key === sort.key) ?? columns[0];
  if (column === undefined) throw new Error("codex: no sortable columns");
  const rows = sortWithTiebreak(catalog.mounts, column.extract, (m) => m.id, sort.dir);
  return (
    <div className="border border-line bg-panel">
      <table className="w-full border-collapse">
        <thead className="bg-panel-2">
          <tr>
            {columns.map((c) => (
              <SortableHeader key={c.key} column={c} sort={sort} onSort={(key) => setSort((prev) => nextSort(prev, key))} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-t border-line">
              <td className="px-3 py-2 text-[14px] text-ink">{m.name}</td>
              <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink">{m.cost}</td>
              <td className="px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-ink-2">{m.family}</td>
              <td className="px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-ink-2">{portName(catalog, m)}</td>
              <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-2">{signed(m.damageDelta)}</td>
              <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-2">{signedFx(m.rangeDelta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function portName(catalog: Catalog, mount: Mount): string {
  return catalog.indexes.hardpointTypeById.get(mount.requiredHardpointType)?.name ?? String(mount.requiredHardpointType);
}

function signedFx(value: number): string {
  if (value === 0) return "0";
  const magnitude = fxUnits(Math.abs(value));
  return value > 0 ? `+${magnitude}` : `−${magnitude}`;
}

function CommanderTable(props: { readonly catalog: Catalog }): React.ReactElement {
  const { catalog } = props;
  return (
    <div className="border border-line bg-panel">
      <table className="w-full border-collapse">
        <thead className="bg-panel-2">
          <tr>
            {["Commander", "Cost", "Base pool", "R ladder", "Move Δ", "DMG Δ", "RNG Δ", "DEF Δ", "Extra states"].map((h, i) => (
              <th key={h} scope="col" className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3 ${i === 0 ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {catalog.commanderTypes.map((ct) => (
            <tr key={ct.id} className="border-t border-line">
              <td className="px-3 py-2 text-[14px] text-ink">{ct.name}</td>
              <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink">{ct.cost}</td>
              <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-2">{ct.commanderBase}</td>
              <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-2">{ct.rLadder.join(" · ")}</td>
              <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-2">{signedFx(ct.modifications.movementDelta)}</td>
              <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-2">{signed(ct.modifications.damageDelta)}</td>
              <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-2">{signedFx(ct.modifications.rangeDelta)}</td>
              <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-2">{signed(ct.modifications.defenseDelta)}</td>
              <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-2">{ct.modifications.extraDialStates}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Tab = "chassis" | "mounts";

export function Codex(): React.ReactElement {
  const catalog = resolveCatalog();
  const [tab, setTab] = React.useState<Tab>("chassis");
  return (
    <main className="min-h-full bg-void" role="main">
      <header className="sticky top-0 z-40 border-b border-line bg-void">
        <div className="flex h-12 items-center justify-between px-8">
          <div className="flex items-center gap-4">
            <a href="#/" className="text-[11px] uppercase tracking-[0.14em] text-ink-3 hover:text-sys">
              ← Boot
            </a>
            <span className="h-4 w-px bg-line" />
            <span className="text-[15px] font-semibold uppercase tracking-[0.14em] text-ink">Codex</span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-3">Full catalog reference</span>
          </div>
          <div className="flex items-center gap-6 font-mono text-[11px] tabular-nums text-ink-3">
            <span>CHASSIS <span className="text-ink-2">{catalog.chassis.length}</span></span>
            <span>MOUNTS <span className="text-ink-2">{catalog.mounts.length}</span></span>
            <span>COMMANDERS <span className="text-ink-2">{catalog.commanderTypes.length}</span></span>
          </div>
        </div>
        <div className="flex h-8 items-center gap-3 border-t border-line bg-panel px-8">
          <span className="h-1.5 w-1.5 bg-sys" />
          <span className="font-mono text-[11px] tabular-nums text-sys" style={{ letterSpacing: "0.06em" }}>
            {CONTRACT_LINE}
          </span>
          <span className="text-ink-4">·</span>
          <span className="text-[11px] text-ink-3">
            No unlocks, no rounding. The AI builds from this exact catalog.
          </span>
        </div>
      </header>

      <div className="px-8 pt-5 pb-16">
        <div className="mb-4 flex items-end border-b border-line" role="tablist" aria-label="Catalog category">
          <button
            type="button"
            role="tab"
            id="tab-chassis"
            aria-selected={tab === "chassis"}
            aria-controls="panel-chassis"
            onClick={() => setTab("chassis")}
            className={`h-[34px] px-[18px] text-[12px] font-semibold uppercase tracking-[0.14em] ${
              tab === "chassis" ? "border-b-2 border-sys text-ink" : "text-ink-3 hover:text-ink-2"
            }`}
          >
            Chassis <span className="font-mono text-[10px] tabular-nums text-ink-3">{catalog.chassis.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="tab-mounts"
            aria-selected={tab === "mounts"}
            aria-controls="panel-mounts"
            onClick={() => setTab("mounts")}
            className={`h-[34px] px-[18px] text-[12px] font-semibold uppercase tracking-[0.14em] ${
              tab === "mounts" ? "border-b-2 border-sys text-ink" : "text-ink-3 hover:text-ink-2"
            }`}
          >
            Mounts <span className="font-mono text-[10px] tabular-nums text-ink-3">{catalog.mounts.length}</span>
          </button>
        </div>

        {tab === "chassis" ? (
          <section id="panel-chassis" role="tabpanel" aria-labelledby="tab-chassis">
            <ChassisTable catalog={catalog} />
          </section>
        ) : (
          <section id="panel-mounts" role="tabpanel" aria-labelledby="tab-mounts">
            <MountTable catalog={catalog} />
          </section>
        )}

        <section className="mt-8" aria-labelledby="commander-heading">
          <h2 id="commander-heading" className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-2">
            Commander types
          </h2>
          <CommanderTable catalog={catalog} />
        </section>
      </div>
    </main>
  );
}
