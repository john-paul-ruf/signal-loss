import * as React from "react";
import { Banner } from "../../components/shared/index";
import type {
  Catalog,
  ChassisCode,
  Prebuilt,
} from "../../../engine/index";
import type {
  ConstructSnapshotV1,
  PersistedStateV1,
  RepositoryError,
  SavedRosterV1,
} from "../../../platform/index";
import {
  constructCostOf,
  rosterSummary,
  type RosterSummary,
} from "../../store/build/collection-model";
import { exportRoster, importShareString, type ImportOutcome } from "../../store/build/share";

/**
 * Presentational collection screen (design.md §5.1). All persistence lives in
 * the container; this component is a pure function of `state` + `catalog` +
 * injected actions, so it renders identically under test (renderToStaticMarkup)
 * and in the browser. It owns only local UI interaction state (selection,
 * import buffer, armed destructive toggles).
 */
export interface CollectionActionsView {
  readonly onDuplicatePrebuilt: (prebuilt: Prebuilt) => void;
  readonly onSaveImportedRoster: (
    name: string,
    budget: number,
    snapshots: readonly ConstructSnapshotV1[],
  ) => void;
  readonly onRename: (id: SavedRosterV1["id"], name: string) => void;
  readonly onDuplicate: (id: SavedRosterV1["id"], copyName: string) => void;
  readonly onDelete: (id: SavedRosterV1["id"]) => void;
  readonly onResetCorrupt: () => void;
  readonly onCopy: (text: string) => void;
}

export interface CollectionViewProps {
  readonly catalog: Catalog;
  readonly state: PersistedStateV1 | undefined;
  readonly persistenceUnavailable: boolean;
  readonly clipboardAvailable: boolean;
  readonly lastError: RepositoryError | null;
  readonly corrupt: boolean;
  readonly corruptRaw: string | null;
  readonly actions: CollectionActionsView;
}

function chassisName(catalog: Catalog, code: number): string {
  return catalog.indexes.chassisByCode.get(code as ChassisCode)?.name ?? `#${code}`;
}

function StorageBanners(props: CollectionViewProps): React.ReactElement | null {
  const { persistenceUnavailable, lastError, corrupt, corruptRaw, clipboardAvailable, actions } = props;
  const [armedReset, setArmedReset] = React.useState(false);
  const banners: React.ReactElement[] = [];

  if (persistenceUnavailable) {
    banners.push(
      <Banner key="unavailable" tone="bad" assertive title="Saves unavailable">
        Local storage is disabled in this browser. You can build this session, but nothing will
        persist across a reload.
      </Banner>,
    );
  }
  if (lastError?.kind === "QUOTA_EXCEEDED") {
    banners.push(
      <Banner key="quota" tone="warn" assertive title="Storage full">
        The last save failed — the browser storage quota is exhausted. Delete rosters to free space.
      </Banner>,
    );
  }
  if (lastError?.kind === "STALE_REVISION") {
    banners.push(
      <Banner key="stale" tone="warn" title="Changed in another tab">
        This collection was modified elsewhere. Reload to see the current state before saving again.
      </Banner>,
    );
  }
  if (lastError?.kind === "UNSUPPORTED_VERSION") {
    banners.push(
      <Banner key="version" tone="bad" assertive title="Saved by a newer build">
        The stored collection was written by a newer version and cannot be read. It has not been
        overwritten.
      </Banner>,
    );
  }
  if (corrupt) {
    banners.push(
      <Banner
        key="corrupt"
        tone="bad"
        assertive
        title="Stored collection is corrupt"
        action={
          <div className="flex items-center gap-2">
            {clipboardAvailable && corruptRaw !== null ? (
              <button
                type="button"
                onClick={() => actions.onCopy(corruptRaw)}
                className="border border-line-2 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-2 hover:bg-panel-2"
              >
                Copy raw data
              </button>
            ) : null}
            {armedReset ? (
              <button
                type="button"
                onClick={() => {
                  actions.onResetCorrupt();
                  setArmedReset(false);
                }}
                className="border border-bad px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-bad hover:bg-bad/10"
              >
                Confirm reset
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setArmedReset(true)}
                className="border border-bad/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-bad hover:bg-bad/10"
              >
                Reset store
              </button>
            )}
          </div>
        }
      >
        The raw data is preserved. Reset is a separate, armed, destructive recovery — it replaces
        the stored collection with an empty one.
      </Banner>,
    );
  }
  if (banners.length === 0) return null;
  return <div className="flex flex-col gap-2 px-6 pt-4">{banners}</div>;
}

function ImportResult(props: {
  readonly outcome: ImportOutcome;
  readonly onAdd: () => void;
}): React.ReactElement | null {
  const { outcome, onAdd } = props;
  switch (outcome.status) {
    case "empty":
      return null;
    case "ok-roster":
      return (
        <div role="status" className="border border-ok/50 bg-ok/[0.05] px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ok">{outcome.message}</div>
          <button
            type="button"
            onClick={onAdd}
            className="mt-2 border border-sys/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-sys hover:bg-sys/10"
          >
            Add to collection
          </button>
        </div>
      );
    case "ok-construct":
      return (
        <div role="status" className="border border-ok/50 bg-ok/[0.05] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-ok">
          {outcome.message}
        </div>
      );
    case "malformed":
    case "unknown":
    case "version":
      return (
        <div role="alert" className="border border-bad/50 bg-bad/[0.05] px-3 py-2 font-mono text-[12px] text-bad">
          {outcome.message}
        </div>
      );
    case "illegal":
      return (
        <div role="alert" className="border border-bad/50 bg-bad/[0.05] px-3 py-2">
          <div className="font-mono text-[12px] text-bad">{outcome.message}</div>
          <ul className="mt-1 list-disc pl-5 text-[11px] text-ink-3">
            {outcome.violations.map((v, i) => (
              <li key={i}>
                {v.rule}: {v.message}
              </li>
            ))}
          </ul>
        </div>
      );
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

export function CollectionView(props: CollectionViewProps): React.ReactElement {
  const { catalog, state, actions } = props;
  const prebuilts = catalog.prebuilts;
  const rosters = state?.rosters ?? [];

  const [selectedId, setSelectedId] = React.useState<string | null>(rosters[0]?.id ?? null);
  const [importText, setImportText] = React.useState("");
  const [importOutcome, setImportOutcome] = React.useState<ImportOutcome>({ status: "empty" });
  const [importName, setImportName] = React.useState("IMPORTED ROSTER");
  const [armedDeleteId, setArmedDeleteId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState<string | null>(null);

  const selected: SavedRosterV1 | undefined = rosters.find((r) => r.id === selectedId);
  const summary: RosterSummary | null = selected ? rosterSummary(selected, catalog) : null;

  function runImport(): void {
    setImportOutcome(importShareString(importText, catalog));
  }
  function addImported(): void {
    if (importOutcome.status !== "ok-roster") return;
    actions.onSaveImportedRoster(importName, importOutcome.budget, importOutcome.snapshots);
    setImportText("");
    setImportOutcome({ status: "empty" });
  }

  const shareString = selected ? exportRoster(selected, catalog) : null;

  return (
    <main className="min-h-full bg-void" role="main">
      <header className="flex h-12 items-center gap-4 border-b border-line bg-panel px-4">
        <a href="#/" className="text-[11px] uppercase tracking-[0.14em] text-ink-3 hover:text-sys">
          ← Boot
        </a>
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink">Build Zone · Collection</span>
        <nav className="ml-6 flex items-stretch" aria-label="Build zone">
          <span className="flex items-center border-b-2 border-sys px-4 text-[11px] uppercase tracking-[0.14em] text-ink">
            Collection
          </span>
          <a
            href="#/composer"
            className="flex items-center border-b-2 border-transparent px-4 text-[11px] uppercase tracking-[0.14em] text-ink-3 hover:text-ink-2"
          >
            Composer
          </a>
          <a
            href="#/codex"
            className="flex items-center border-b-2 border-transparent px-4 text-[11px] uppercase tracking-[0.14em] text-ink-3 hover:text-ink-2"
          >
            Codex
          </a>
        </nav>
      </header>

      <StorageBanners {...props} />

      <div className="grid" style={{ gridTemplateColumns: "300px 1fr" }}>
        {/* Column 1 — roster list: pinned prebuilts + saved */}
        <section className="border-r border-line bg-panel" aria-label="Rosters">
          <div className="border-b border-line bg-panel-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">
            Prebuilt · pinned · read-only
          </div>
          <ul>
            {prebuilts.map((p) => (
              <li key={p.id} className="border-b border-line px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[14px] text-ink">{p.name}</span>
                  <span className="border border-line-2 px-1.5 font-mono text-[11px] tabular-nums text-ink-2">
                    {p.budget}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[11px] tabular-nums text-ink-3">
                  {p.constructs.length} CST · <span className="text-ok">● LEGAL</span> · PREBUILT
                </div>
                <button
                  type="button"
                  onClick={() => actions.onDuplicatePrebuilt(p)}
                  className="mt-2 w-full border border-sys/60 py-1 text-[11px] uppercase tracking-[0.14em] text-sys hover:bg-sys/10"
                >
                  Duplicate to edit
                </button>
              </li>
            ))}
          </ul>
          <div className="border-b border-line bg-panel-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">
            Saved · local
          </div>
          <ul>
            {rosters.length === 0 ? (
              <li className="px-3 py-3 font-mono text-[11px] text-ink-3">
                NO SAVED ROSTERS · DUPLICATE A PREBUILT OR IMPORT ONE
              </li>
            ) : (
              rosters.map((r) => {
                const rs = rosterSummary(r, catalog);
                const isSel = r.id === selectedId;
                return (
                  <li key={r.id} className={`border-b border-line ${isSel ? "bg-panel-3" : ""}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      aria-current={isSel ? "true" : undefined}
                      className={`block w-full px-3 py-2 text-left ${isSel ? "border-l-2 border-l-vector" : ""}`}
                    >
                      <span className="flex items-baseline justify-between">
                        <span className="text-[14px] text-ink">{r.name}</span>
                        <span className="border border-line-2 px-1.5 font-mono text-[11px] tabular-nums text-ink-2">
                          {r.budget}
                        </span>
                      </span>
                      <span className="mt-1 block font-mono text-[11px] tabular-nums text-ink-3">
                        {rs.constructCount} CST ·{" "}
                        {rs.legal ? (
                          <span className="text-ok">● LEGAL</span>
                        ) : (
                          <span className="text-bad">✕ ILLEGAL</span>
                        )}
                        {rs.commanderName !== null ? ` · ◆ ${rs.commanderName}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        {/* Column 2 — roster detail */}
        <section className="overflow-y-auto bg-void" aria-label="Roster detail">
          {selected === undefined || summary === null ? (
            <div className="px-6 py-8 font-mono text-[12px] text-ink-3">
              SELECT A ROSTER, OR IMPORT ONE BELOW.
            </div>
          ) : (
            <div className="px-6 pt-5">
              <div className="flex items-start justify-between">
                {renameValue === null ? (
                  <h1 className="text-[30px] font-bold uppercase tracking-[0.06em] text-ink">
                    {selected.name}
                  </h1>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (renameValue.trim().length > 0) actions.onRename(selected.id, renameValue.trim());
                      setRenameValue(null);
                    }}
                    className="flex items-center gap-2"
                  >
                    <label className="sr-only" htmlFor="rename-input">
                      New roster name
                    </label>
                    <input
                      id="rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="border border-line-2 bg-panel-3 px-2 py-1 text-[18px] text-ink"
                    />
                    <button type="submit" className="border border-sys/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-sys">
                      Save
                    </button>
                  </form>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRenameValue(selected.name)}
                    className="border border-line-2 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-2 hover:bg-panel-2"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => actions.onDuplicate(selected.id, `${selected.name} COPY`)}
                    className="border border-line-2 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-2 hover:bg-panel-2"
                  >
                    Duplicate
                  </button>
                  {armedDeleteId === selected.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        actions.onDelete(selected.id);
                        setArmedDeleteId(null);
                        setSelectedId(null);
                      }}
                      className="border border-bad px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-bad hover:bg-bad/10"
                    >
                      Confirm delete
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setArmedDeleteId(selected.id)}
                      className="border border-bad/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-bad hover:bg-bad/10"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-baseline gap-3">
                <span className="text-[11px] uppercase tracking-[0.14em] text-ink-3">Budget</span>
                <span className="font-mono text-[28px] font-semibold tabular-nums text-ink">
                  {summary.cost}
                </span>
                <span className="font-mono text-[16px] tabular-nums text-ink-3">/ {selected.budget}</span>
                <span className="ml-2 font-mono text-[12px] tabular-nums text-warn">
                  {Math.max(0, selected.budget - summary.cost)} REMAINING
                </span>
              </div>

              <div className="mt-4">
                {summary.legal ? (
                  <Banner tone="ok" title="Legal">
                    <span className="font-mono text-[12px] tabular-nums text-ink-2">
                      {summary.constructCount} CONSTRUCTS ·{" "}
                      {summary.commanderName !== null ? `1 COMMANDER (${summary.commanderName})` : "NO COMMANDER"}{" "}
                      · {summary.cost} / {selected.budget} PTS
                    </span>
                  </Banner>
                ) : (
                  <Banner tone="bad" assertive title="Illegal — preserved for repair">
                    <ul className="list-disc pl-5 font-mono text-[12px] text-ink-2">
                      {summary.violations.map((v, i) => (
                        <li key={i}>
                          {v.rule}: {v.message}
                        </li>
                      ))}
                    </ul>
                  </Banner>
                )}
              </div>

              <div className="mt-5">
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">
                  Constructs
                </h2>
                <div className="grid grid-cols-3 gap-px border border-line bg-line">
                  {selected.constructs.map((snapshot, i) => (
                    <div key={i} className="bg-panel p-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[13px] font-semibold text-ink">
                          {chassisName(catalog, snapshot.chassisCode)}
                        </span>
                        <span className="font-mono text-[13px] tabular-nums text-ink">
                          {constructCostOf(snapshot, catalog)}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-[11px] tabular-nums text-ink-3">
                        {snapshot.mounts.length} MOUNT(S)
                        {snapshot.commanderCode !== null ? " · ◆ CMD" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">
                  Share string
                </h2>
                {shareString === null ? (
                  <p className="font-mono text-[12px] text-warn">
                    Budget {selected.budget} is not a legal export budget — repair before sharing.
                  </p>
                ) : (
                  <div className="flex items-start gap-2">
                    <label className="sr-only" htmlFor="share-out">
                      Roster share string
                    </label>
                    <textarea
                      id="share-out"
                      readOnly
                      value={shareString}
                      rows={2}
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-full border border-line-2 bg-panel-3 px-2 py-1 font-mono text-[12px] text-ink"
                    />
                    <button
                      type="button"
                      onClick={() => actions.onCopy(shareString)}
                      className="shrink-0 border border-sys/60 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-sys hover:bg-sys/10"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Import panel — a persistent screen state, not a toast (FR-7) */}
          <div className="mx-6 mb-8 mt-6 border border-line bg-panel p-4">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">
              Import a share string
            </h2>
            <label className="sr-only" htmlFor="share-in">
              Paste a share string to import
            </label>
            <textarea
              id="share-in"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={2}
              placeholder="SL1-…"
              className="w-full border border-line-2 bg-panel-3 px-2 py-1 font-mono text-[12px] text-ink placeholder:text-ink-4"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={runImport}
                className="border border-sys/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-sys hover:bg-sys/10"
              >
                Import
              </button>
              {importOutcome.status === "ok-roster" ? (
                <>
                  <label className="sr-only" htmlFor="import-name">
                    Name for the imported roster
                  </label>
                  <input
                    id="import-name"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    className="border border-line-2 bg-panel-3 px-2 py-1.5 text-[12px] text-ink"
                  />
                </>
              ) : null}
            </div>
            <div className="mt-2">
              <ImportResult outcome={importOutcome} onAdd={addImported} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
