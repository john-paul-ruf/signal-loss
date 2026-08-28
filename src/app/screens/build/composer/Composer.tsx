import * as React from "react";
import { copyText, resolveBrowserClipboard } from "../../../../platform/index";
import { BUDGETS, type ChassisCode, type CommanderCode, type MountCode } from "../../../../engine/index";
import { resolveCatalog } from "../../../store/build/catalog";
import {
  CollectionProvider,
  useCollection,
  useCollectionBinding,
} from "../../../store/build/collection-context";
import { constructToSnapshot, snapshotToConstruct } from "../../../store/build/collection-model";
import { exportConstructSnapshot } from "../../../store/build/share";
import { consumeComposerRequest, type ComposerRequest } from "../../../store/build/composer-context";
import {
  draftFromConstruct,
  draftToConstruct,
  draftViolations,
  isComposable,
  removeMount,
  setChassis,
  setCommander,
  setMount,
  EMPTY_DRAFT,
  type ComposerDraft,
} from "../../../store/build/composer";
import { ComposerView } from "./ComposerView";

function Splash(): React.ReactElement {
  return (
    <main className="flex min-h-full items-center justify-center bg-void" role="status">
      <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-3">Loading composer…</p>
    </main>
  );
}

function ComposerContainer(): React.ReactElement {
  const catalog = React.useMemo(() => resolveCatalog(), []);
  const { store } = useCollectionBinding();
  const collection = useCollection((s) => s.collection);
  const clipboard = React.useMemo(() => resolveBrowserClipboard(), []);

  // Consumed exactly once per mount — a fresh hash navigation remounts this route.
  const [request] = React.useState<ComposerRequest | null>(() => consumeComposerRequest());
  const roster = React.useMemo(
    () => (request !== null ? collection?.rosters.find((r) => r.id === request.rosterId) : undefined),
    [collection, request],
  );
  const activeContext = request !== null && roster !== undefined ? request : null;

  const [initialized, setInitialized] = React.useState(false);
  const [draft, setDraft] = React.useState<ComposerDraft>(EMPTY_DRAFT);
  const [history, setHistory] = React.useState<readonly ComposerDraft[]>([]);
  const [name, setName] = React.useState("NEW CONSTRUCT");
  const [targetBudget, setTargetBudget] = React.useState<number>(100);
  const [justSaved, setJustSaved] = React.useState(false);

  React.useEffect(() => {
    if (initialized || collection === undefined) return;
    if (activeContext !== null && roster !== undefined) {
      const existing = roster.constructs[activeContext.constructIndex];
      setDraft(existing !== undefined ? draftFromConstruct(snapshotToConstruct(existing)) : EMPTY_DRAFT);
      setTargetBudget(roster.budget);
      setName(roster.name);
    }
    setInitialized(true);
    // Only ever runs once — the ref-like `initialized` guard is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, initialized]);

  function apply(next: ComposerDraft): void {
    setHistory((h) => [...h, draft]);
    setDraft(next);
    setJustSaved(false);
  }

  function save(): void {
    if (!isComposable(draft)) return;
    if (draftViolations(draft, catalog).length > 0) return;
    const snapshot = constructToSnapshot(draftToConstruct(draft));
    if (activeContext !== null && roster !== undefined) {
      const snapshots = roster.constructs.slice();
      if (activeContext.constructIndex < snapshots.length) {
        snapshots[activeContext.constructIndex] = snapshot;
      } else {
        snapshots.push(snapshot);
      }
      const ok = store.getState().saveRosterUpdate(roster.name, roster.id, roster.budget, snapshots);
      if (ok) setJustSaved(true);
      return;
    }
    const ok = store.getState().saveConstructCreate(name.trim().length > 0 ? name.trim() : "UNNAMED CONSTRUCT", snapshot);
    if (ok) setJustSaved(true);
  }

  const shareString = isComposable(draft) ? exportConstructSnapshot(constructToSnapshot(draftToConstruct(draft)), catalog) : null;
  const contextLabel =
    activeContext !== null && roster !== undefined
      ? `ROSTER · ${roster.name}`
      : request !== null && roster === undefined
        ? "ROSTER · (deleted — standalone)"
        : "STANDALONE CONSTRUCT";

  return (
    <ComposerView
      catalog={catalog}
      draft={draft}
      name={name}
      targetBudget={targetBudget}
      budgetOptions={BUDGETS}
      contextLabel={contextLabel}
      canUndo={history.length > 0}
      shareString={shareString}
      saveLabel="Save construct"
      justSaved={justSaved}
      actions={{
        onSetChassis: (code: ChassisCode) => apply(setChassis(draft, code)),
        onSetCommander: (code: CommanderCode | null) => apply(setCommander(draft, code)),
        onMount: (hardpointIndex: number, mountCode: MountCode) => apply(setMount(draft, hardpointIndex, mountCode)),
        onUnmount: (hardpointIndex: number) => apply(removeMount(draft, hardpointIndex)),
        onSetName: setName,
        onSetTargetBudget: setTargetBudget,
        onUndo: () => {
          setHistory((h) => {
            const prev = h[h.length - 1];
            if (prev === undefined) return h;
            setDraft(prev);
            return h.slice(0, -1);
          });
          setJustSaved(false);
        },
        onSave: save,
        onCopy: (text: string) => {
          void copyText(text, clipboard);
        },
      }}
    />
  );
}

export function Composer(): React.ReactElement {
  return (
    <CollectionProvider fallback={<Splash />}>
      <ComposerContainer />
    </CollectionProvider>
  );
}
