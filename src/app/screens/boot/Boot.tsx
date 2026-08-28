import * as React from "react";
import {
  meetsDesktopViewport,
  probeStorageAvailability,
  readViewportSize,
  resolveBrowserStorage,
  MIN_VIEWPORT_HEIGHT,
  MIN_VIEWPORT_WIDTH,
  type ViewportSize,
} from "../../../platform/index";
import { APP_VERSION, resolveCatalog, SQUAD_LADDER } from "../../store/build/index";

const CONTRACT = "DETERMINISTIC · NO ROLLS · NO TIMERS · INTENT IS THE ONLY UNKNOWN";

interface EntryDef {
  readonly id: string;
  readonly index: string;
  readonly title: string;
  readonly href: string;
  readonly body: string;
}

const ENTRIES: readonly EntryDef[] = [
  {
    id: "new-match",
    index: "01",
    title: "New Match",
    href: "#/setup",
    body: "Pick a budget and a roster, take a seeded procedural map against four AI squads. Prebuilt rosters are ready and legality-checked.",
  },
  {
    id: "build-zone",
    index: "02",
    title: "Build Zone",
    href: "#/build",
    body: "Compose constructs from chassis and typed hardpoints. Tag one commander. Save rosters locally and trade them as share strings.",
  },
  {
    id: "codex",
    index: "03",
    title: "Codex",
    href: "#/codex",
    body: "Every chassis, every mount, every dial state, every commander modification. Nothing is gated and nothing is rounded.",
  },
];

/** Live viewport size with a resize subscription. SSR/tests read `{0,0}`. */
function useViewport(): ViewportSize {
  const [size, setSize] = React.useState<ViewportSize>(() => readViewportSize());
  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = (): void => setSize(readViewportSize());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

function storageStatus(): { readonly ok: boolean; readonly label: string } {
  const probe = probeStorageAvailability({
    key: "signal-loss:state",
    storage: resolveBrowserStorage(),
  });
  return probe.available
    ? { ok: true, label: "LOCAL STORE OK" }
    : { ok: false, label: "STORAGE UNAVAILABLE" };
}

export function Boot(): React.ReactElement {
  const catalog = resolveCatalog();
  const viewport = useViewport();
  // Treat the SSR/test `{0,0}` as "not gated" so static render shows entries.
  const gated =
    (viewport.width > 0 || viewport.height > 0) && !meetsDesktopViewport(viewport);
  const storage = storageStatus();

  return (
    <main className="mx-auto min-h-full max-w-[1280px] px-8" role="main">
      <header className="flex h-11 items-center justify-between border-b border-line">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">
            SIGNAL LOSS
          </span>
          <span className="text-ink-4">/</span>
          <span className="text-[11px] uppercase tracking-[0.14em] text-ink-3">BOOT</span>
        </div>
        <div className="flex items-center gap-6 font-mono text-[11px] tabular-nums text-ink-3">
          <span>
            BUILD <span className="text-ink-2">{APP_VERSION}</span>
          </span>
          <span>
            CATALOG <span className="text-ink-2">{catalog.chassis.length}</span> CHASSIS ·{" "}
            <span className="text-ink-2">{catalog.mounts.length}</span> MOUNTS ·{" "}
            <span className="text-ink-2">{catalog.commanderTypes.length}</span> CMD
          </span>
          <span>
            HASH <span className="text-ink-2">{catalog.hashes.catalog}</span>
          </span>
          <span className={storage.ok ? "text-ok" : "text-warn"}>● {storage.label}</span>
        </div>
      </header>

      <section className="flex items-end justify-between gap-16 pt-20 pb-10">
        <div>
          <div className="mb-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-ink-3">
            <span className="inline-block h-px w-8 bg-line-2" />
            FIVE-WAY SIMULTANEOUS SKIRMISH
          </div>
          <h1
            className="relative select-none uppercase text-ink"
            style={{ fontWeight: 700, fontSize: 88, lineHeight: 0.92, letterSpacing: "0.06em" }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 text-sys"
              style={{ transform: "translate(-1px,-1px)", opacity: 0.55 }}
            >
              Signal
              <br />
              Loss
            </span>
            <span
              aria-hidden="true"
              className="absolute inset-0 text-trace"
              style={{ transform: "translate(1px,1px)", opacity: 0.45 }}
            >
              Signal
              <br />
              Loss
            </span>
            <span className="relative text-ink">
              Signal
              <br />
              Loss
            </span>
          </h1>
          <p
            className="mt-8 font-mono text-[13px] tabular-nums text-ink-2"
            style={{ letterSpacing: "0.02em" }}
          >
            {CONTRACT}
          </p>
          <p className="mt-3 max-w-[560px] text-[14px] leading-relaxed text-ink-3">
            Build constructs from a catalog with nothing hidden. Plot movement and fire blind
            against four rival squads at once. Every number on screen is the number used in
            resolution.
          </p>
        </div>

        <div
          className="w-[300px] shrink-0 border border-line bg-panel/80"
          style={{ clipPath: "polygon(10px 0,100% 0,100% 100%,0 100%,0 10px)" }}
        >
          <div className="flex h-9 items-center justify-between border-b border-line px-4">
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-2">Squads</span>
            <span className="font-mono text-[11px] tabular-nums text-ink-3">5 / MATCH</span>
          </div>
          <ul className="p-2">
            {SQUAD_LADDER.map((squad) => (
              <li key={squad.id} className="flex h-8 items-center gap-3 px-2">
                <span aria-hidden="true" style={{ color: squad.colorVar }}>
                  {squad.glyph}
                </span>
                <span
                  className="w-6 font-mono text-[11px] tabular-nums"
                  style={{ color: squad.colorVar }}
                >
                  {squad.tag}
                </span>
                <span
                  className={`flex-1 text-[13px] ${squad.isPlayer ? "text-ink" : "text-ink-2"}`}
                >
                  {squad.name}
                </span>
                {squad.isPlayer ? (
                  <span className="border border-sys/50 px-1.5 py-px text-[10px] uppercase tracking-[0.14em] text-sys">
                    YOU
                  </span>
                ) : (
                  <span className="font-mono text-[11px] tabular-nums text-ink-4">
                    L*{squad.lightness}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-ink-3">
            Identity reads as <span className="text-ink-2">lightness</span> →{" "}
            <span className="text-ink-2">glyph</span> → <span className="text-ink-2">tag</span>.
            Hue is the last channel, never the only one.
          </div>
        </div>
      </section>

      {gated ? (
        <section className="pb-8">
          <div
            className="border border-warn/50 bg-panel p-8"
            role="alert"
            style={{ clipPath: "polygon(10px 0,100% 0,100% 100%,0 100%,0 10px)" }}
          >
            <div className="flex items-start gap-4">
              <span className="font-mono text-[20px] leading-none text-warn">!</span>
              <div>
                <div className="text-[18px] font-semibold uppercase tracking-[0.14em] text-warn">
                  Signal Loss is a desktop product
                </div>
                <p className="mt-3 font-mono text-[13px] tabular-nums text-ink-2">
                  {MIN_VIEWPORT_WIDTH}×{MIN_VIEWPORT_HEIGHT} MINIMUM · MOUSE + KEYBOARD REQUIRED
                </p>
                <p className="mt-3 max-w-[560px] text-[13px] text-ink-3">
                  The match shell assumes a real pointer and a wide canvas. Rather than reflow into
                  something that reads wrong, entry is withheld at this viewport. Widen the window to
                  continue.
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <nav className="grid grid-cols-3 gap-4 pb-8" aria-label="Primary">
          {ENTRIES.map((entry) => (
            <a
              key={entry.id}
              href={entry.href}
              className="group block border border-line bg-panel/70 p-5 transition-colors duration-90 hover:border-line-2 hover:bg-panel-2"
              style={{ clipPath: "polygon(10px 0,100% 0,100% 100%,0 100%,0 10px)" }}
            >
              <div className="mb-6 flex items-start justify-between">
                <span className="font-mono text-[11px] tabular-nums text-ink-4">
                  {entry.index}
                </span>
              </div>
              <div className="text-[18px] font-semibold uppercase tracking-[0.14em] text-ink">
                {entry.title}
              </div>
              <p className="mt-2 h-[60px] text-[13px] leading-relaxed text-ink-3">{entry.body}</p>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <span className="font-mono text-[11px] tabular-nums text-ink-3">OPEN</span>
                <span className="text-[14px] text-sys transition-transform group-hover:translate-x-1">
                  →
                </span>
              </div>
            </a>
          ))}
        </nav>
      )}

      <footer className="flex items-center justify-between border-t border-line py-5 text-[11px] uppercase tracking-[0.14em] text-ink-3">
        <div className="flex items-center gap-6">
          <span>No progression</span>
          <span className="text-ink-4">·</span>
          <span>No unlocks</span>
          <span className="text-ink-4">·</span>
          <span>No currency</span>
          <span className="text-ink-4">·</span>
          <span>No tutorial</span>
        </div>
        <div className="font-mono text-[11px] tabular-nums normal-case tracking-normal text-ink-3">
          DESKTOP ONLY · {MIN_VIEWPORT_WIDTH}×{MIN_VIEWPORT_HEIGHT} MINIMUM · MOUSE + KEYBOARD
        </div>
      </footer>
    </main>
  );
}
