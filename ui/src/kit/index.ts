// The kit (SPEC §6.8): the shared primitives, restyled to the mock.
export { Button, type ButtonVariant, ChipButton, GhostButton, IconButton } from './Button.tsx';
export { Count } from './Count.tsx';
export { type EscapeLayer, pushEscape, useEscape } from './escape.ts';
export { IC, Icon, type IconName, type MockIconName } from './Icon.tsx';
export {
  AGENT_HUE_DEGREES,
  AgentMark,
  agentHueDegrees,
  Buddy,
  Checkbox,
  Chevron,
  EnumChip,
  SeverityBars,
  StepPill,
  Tile,
} from './Marks.tsx';
export { Node, NodeMark, nodeLabel } from './Node.tsx';
export { Pill, type PillTone } from './Pill.tsx';
export { anchorAbove, anchorBelow, type Place } from './pop/anchors.ts';
export { Dialog } from './pop/Dialog.tsx';
export { MenuItem, MenuLabel, MenuNote, MenuRule } from './pop/Menu.tsx';
export { Pop, PopContext, type PopEdge, popParts, usePop } from './pop/Pop.tsx';
export { ToastHost, type ToastOptions, toast } from './pop/toast.tsx';
export { Seg, type SegOption } from './Seg.tsx';
export { Severity, type SeverityLevel } from './Severity.tsx';
export { Swap } from './Swap.tsx';
export { Tooltip } from './Tooltip.tsx';
export { TypeTag } from './TypeTag.tsx';
