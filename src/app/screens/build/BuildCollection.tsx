import * as React from "react";
import { copyText, resolveBrowserClipboard } from "../../../platform/index";
import { resolveCatalog } from "../../store/build/index";
import {
  CollectionProvider,
  useCollection,
  useCollectionBinding,
} from "../../store/build/collection-context";
import { prebuiltToSnapshots } from "../../store/build/collection-model";
import { CollectionView, type CollectionActionsView } from "./CollectionView";

/** Loading splash shown while the migration preloads and the store boots. */
function Splash(): React.ReactElement {
  return (
    <main className="flex min-h-full items-center justify-center bg-void" role="status">
      <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-3">
        Loading collection…
      </p>
    </main>
  );
}

function CollectionContainer(): React.ReactElement {
  const catalog = React.useMemo(() => resolveCatalog(), []);
  const { store, persistenceUnavailable: bindingUnavailable } = useCollectionBinding();

  const collection = useCollection((s) => s.collection);
  const lastError = useCollection((s) => s.lastError);
  const corrupt = useCollection((s) => s.corrupt);
  const corruptRaw = useCollection((s) => s.corruptRaw);
  const storeUnavailable = useCollection((s) => s.persistenceUnavailable);

  const clipboard = React.useMemo(() => resolveBrowserClipboard(), []);
  const actions = React.useMemo<CollectionActionsView>(
    () => ({
      onDuplicatePrebuilt: (prebuilt) => {
        store.getState().saveRosterCreate(prebuilt.name, prebuilt.budget, prebuiltToSnapshots(prebuilt));
      },
      onSaveImportedRoster: (name, budget, snapshots) => {
        store.getState().saveRosterCreate(name, budget, snapshots);
      },
      onRename: (id, name) => {
        store.getState().renameEntity(id, name);
      },
      onDuplicate: (id, copyName) => {
        store.getState().duplicateEntity(id, copyName);
      },
      onDelete: (id) => {
        store.getState().deleteEntity(id);
      },
      onResetCorrupt: () => {
        store.getState().resetCorruptStore();
      },
      onCopy: (text) => {
        void copyText(text, clipboard);
      },
    }),
    [store, clipboard],
  );

  return (
    <CollectionView
      catalog={catalog}
      state={collection}
      persistenceUnavailable={bindingUnavailable || storeUnavailable}
      clipboardAvailable={clipboard !== null}
      lastError={lastError}
      corrupt={corrupt}
      corruptRaw={corruptRaw}
      actions={actions}
    />
  );
}

export function BuildCollection(): React.ReactElement {
  return (
    <CollectionProvider fallback={<Splash />}>
      <CollectionContainer />
    </CollectionProvider>
  );
}
