import type { OperationCode, PickingState } from '../../api/barcode';
import type { TranslationKey } from '../../i18n';
import type { IconName } from '../../ui/Icon';
import type { Tone } from '../../ui/theme';

/** Icon and colour of each kind of operation. */
export const OPERATION_LOOK: Record<
  OperationCode,
  { icon: IconName; tone: Tone }
> = {
  incoming: { icon: 'receipt', tone: 'success' },
  outgoing: { icon: 'delivery', tone: 'info' },
  internal: { icon: 'transfer', tone: 'accent' },
};

/** Badge of each transfer state. */
export const STATE_LOOK: Record<
  PickingState,
  { label: TranslationKey; tone: Tone }
> = {
  draft: { label: 'barcode.state.draft', tone: 'neutral' },
  waiting: { label: 'barcode.state.waiting', tone: 'warning' },
  confirmed: { label: 'barcode.state.waiting', tone: 'warning' },
  assigned: { label: 'barcode.state.ready', tone: 'success' },
  done: { label: 'barcode.state.done', tone: 'neutral' },
  cancel: { label: 'barcode.state.cancel', tone: 'neutral' },
};
