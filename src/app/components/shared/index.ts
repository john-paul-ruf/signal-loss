/**
 * Shared component facade — every downstream session (build, setup, result,
 * match) imports its semantic primitives from here. Feature sessions never
 * fork these; they add their own components under a sibling directory.
 */

export { Banner, type BannerProps, type BannerTone } from "./Banner";
export { BudgetStepper, type BudgetStepperProps } from "./BudgetStepper";
export { Button, type ButtonProps, type ButtonVariant } from "./Button";
export { ConfirmModal, type ConfirmModalProps } from "./ConfirmModal";
export { DesktopGate, type DesktopGateProps } from "./DesktopGate";
export {
  SectionErrorBoundary,
  type SectionErrorBoundaryProps,
} from "./ErrorBoundary";
export { FocusTrap, type FocusTrapProps } from "./FocusTrap";
export { SeedField, type SeedFieldProps } from "./SeedField";
export { StatRow, type StatRowProps } from "./StatRow";
export { TermTooltip, type TermTooltipProps } from "./TermTooltip";
export { TextArea, TextInput, type TextAreaProps, type TextInputProps } from "./TextInput";
export {
  ToastRegion,
  type ToastEntry,
  type ToastRegionProps,
  type ToastTone,
} from "./Toast";
export {
  SegmentedControl,
  Toggle,
  type SegmentOption,
  type SegmentedControlProps,
  type ToggleProps,
} from "./Toggle";
