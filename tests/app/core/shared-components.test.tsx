/**
 * Structural tests for shared components. These use `react-dom/server`
 * `renderToStaticMarkup` because Session 01's toolchain does not include
 * `jsdom` or `@testing-library/react`. Every test asserts on the STATIC
 * markup — roles, aria attributes, disabled state, and label associations.
 *
 * A follow-up session (07 or a Session-01 toolchain amend) that installs
 * jsdom + testing-library can layer interactive keyboard tests on top; the
 * component surface authored here is already keyboard-complete by
 * construction (arrow keys in SegmentedControl, focus trap in
 * ConfirmModal, native inputs elsewhere).
 */

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Banner,
  BudgetStepper,
  Button,
  ConfirmModal,
  DesktopGate,
  SectionErrorBoundary,
  SeedField,
  StatRow,
  TermTooltip,
  TextArea,
  TextInput,
  ToastRegion,
  Toggle,
  SegmentedControl,
} from "../../../src/app/components/shared/index";

function markup(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("shared/Button", () => {
  it("uses variant className and disables when loading", () => {
    const html = markup(
      <Button variant="danger" loading>
        DELETE
      </Button>,
    );
    expect(html).toContain("sl-btn--danger");
    expect(html).toContain("sl-btn--loading");
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
  });

  it("renders type=button by default and passes label text through", () => {
    const html = markup(<Button>SAVE</Button>);
    expect(html).toContain('type="button"');
    expect(html).toContain(">SAVE</button>");
  });
});

describe("shared/Toggle", () => {
  it("marks aria-checked from the checked prop", () => {
    const on = markup(<Toggle label="Reduced motion" checked={true} onChange={() => {}} />);
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain("ON");
    const off = markup(<Toggle label="Reduced motion" checked={false} onChange={() => {}} />);
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain("OFF");
  });
});

describe("shared/SegmentedControl", () => {
  it("renders each option as role=radio with only the selected one tabbable", () => {
    const html = markup(
      <SegmentedControl
        label="Budget"
        value="A"
        options={[
          { value: "A", label: "AAA" },
          { value: "B", label: "BBB" },
        ]}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Budget"');
    // Selected radio: aria-checked="true", tabIndex=0
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('tabindex="0"');
    // Unselected radio: aria-checked="false", tabIndex=-1
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('tabindex="-1"');
  });
});

describe("shared/BudgetStepper", () => {
  it("disables the decrement button at the low end", () => {
    const html = markup(
      <BudgetStepper label="Budget" value={25} options={[25, 50, 75]} onChange={() => {}} />,
    );
    // First button is decrement; disabled at value 25.
    expect(html).toMatch(/aria-label="Decrease"[^>]*disabled=""/);
    // Increment is enabled.
    expect(html).toMatch(/aria-label="Increase"(?![^>]*disabled)/);
  });

  it("disables the increment button at the high end", () => {
    const html = markup(
      <BudgetStepper label="Budget" value={75} options={[25, 50, 75]} onChange={() => {}} />,
    );
    expect(html).toMatch(/aria-label="Increase"[^>]*disabled=""/);
  });

  it("labels the output with aria-live=polite for screen-reader announcement", () => {
    const html = markup(
      <BudgetStepper label="Budget" value={50} options={[25, 50, 75]} onChange={() => {}} />,
    );
    expect(html).toContain('aria-live="polite"');
  });
});

describe("shared/TextInput", () => {
  it("associates the label with the input", () => {
    const html = markup(<TextInput label="Name" defaultValue="Alpha" />);
    expect(html).toMatch(/<label[^>]*for="([^"]+)"[^>]*>[^<]*<span[^>]*>Name<\/span><input[^>]*id="\1"/);
  });

  it("marks aria-invalid and role=alert when an error is provided", () => {
    const html = markup(<TextInput label="Name" errorMessage="Required." />);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Required.");
  });

  it("renders a hint when provided", () => {
    const html = markup(<TextInput label="Name" hint="Max 32 chars." />);
    expect(html).toContain("Max 32 chars.");
    expect(html).toMatch(/aria-describedby="[^"]+-hint"/);
  });
});

describe("shared/TextArea", () => {
  it("renders as <textarea> with correct labeling", () => {
    const html = markup(<TextArea label="Note" defaultValue="hello" />);
    expect(html).toContain("<textarea");
    expect(html).toContain("Note");
  });
});

describe("shared/StatRow", () => {
  it("renders label + value + optional unit", () => {
    const html = markup(<StatRow label="Cost" value={42} unit="pts" />);
    expect(html).toContain("Cost");
    expect(html).toContain(">42<");
    expect(html).toContain("pts");
  });

  it("applies emphasis modifier class", () => {
    const html = markup(<StatRow label="Cost" value={99} emphasis="bad" />);
    expect(html).toContain("sl-stat--bad");
  });
});

describe("shared/Banner", () => {
  it("uses role=alert when assertive", () => {
    const html = markup(<Banner tone="bad" title="Storage full" assertive />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain("sl-banner--bad");
  });

  it("uses role=status by default (polite)", () => {
    const html = markup(<Banner tone="info" title="Copied to clipboard" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});

describe("shared/ToastRegion", () => {
  it("renders a role=log with polite live region regardless of tone", () => {
    const html = markup(
      <ToastRegion
        toasts={[
          { id: "a", message: "Saved", tone: "ok" },
          { id: "b", message: "Failed", tone: "bad" },
        ]}
      />,
    );
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Saved");
    expect(html).toContain("Failed");
  });
});

describe("shared/ConfirmModal", () => {
  it("returns null when closed", () => {
    const html = markup(
      <ConfirmModal
        open={false}
        title="Delete?"
        confirmLabel="DELETE"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toBe("");
  });

  it("uses role=dialog with aria-modal and destructive button variant", () => {
    const html = markup(
      <ConfirmModal
        open={true}
        title="Delete Alpha?"
        confirmLabel="DELETE ALPHA"
        onConfirm={() => {}}
        onCancel={() => {}}
        destructive
      >
        This cannot be undone.
      </ConfirmModal>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Delete Alpha?");
    expect(html).toContain("This cannot be undone.");
    expect(html).toContain("sl-btn--danger");
    expect(html).toContain("DELETE ALPHA");
    expect(html).toContain("CANCEL");
  });
});

describe("shared/TermTooltip", () => {
  it("attaches aria-describedby pointing at the tooltip id", () => {
    const html = markup(<TermTooltip term="TRACE" definition="Zone shrinks each round." />);
    expect(html).toMatch(/aria-describedby="([^"]+)"/);
    expect(html).toContain('role="tooltip"');
    expect(html).toContain("Zone shrinks each round.");
  });
});

describe("shared/SeedField", () => {
  it("renders a text input and a generate button", () => {
    const html = markup(
      <SeedField value="seed-x" onChange={() => {}} onGenerate={() => {}} />,
    );
    expect(html).toContain("SEED");
    expect(html).toContain('value="seed-x"');
    expect(html).toContain("GENERATE");
  });

  it("propagates the errorMessage to the underlying TextInput", () => {
    const html = markup(
      <SeedField value="" onChange={() => {}} onGenerate={() => {}} errorMessage="Required." />,
    );
    expect(html).toContain("Required.");
    expect(html).toContain('aria-invalid="true"');
  });
});

describe("shared/DesktopGate", () => {
  it("returns null when the viewport is above the threshold", () => {
    const html = markup(
      <DesktopGate
        visible={false}
        minWidth={1280}
        minHeight={720}
        currentWidth={1920}
        currentHeight={1080}
      />,
    );
    expect(html).toBe("");
  });

  it("uses role=alertdialog and states both required and current dimensions", () => {
    const html = markup(
      <DesktopGate
        visible={true}
        minWidth={1280}
        minHeight={720}
        currentWidth={900}
        currentHeight={600}
      />,
    );
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("1280");
    expect(html).toContain("720");
    expect(html).toContain("900");
    expect(html).toContain("600");
  });
});

describe("shared/SectionErrorBoundary", () => {
  it("renders children when no error is thrown", () => {
    const html = markup(
      <SectionErrorBoundary>
        <p>content</p>
      </SectionErrorBoundary>,
    );
    expect(html).toContain("content");
  });
});
