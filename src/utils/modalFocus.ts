/**
 * Radix Dialog/Sheet dismiss when focus leaves the browser window — including
 * switching to another tab. Staff lose in-progress forms when that happens.
 */
export function preventDismissOnTabBlur(event: Event) {
  if (document.hidden || !document.hasFocus()) {
    event.preventDefault();
  }
}

/** Use on Dialog/Sheet/Drawer `onOpenChange` to ignore spurious close events. */
export function guardOpenChangeOnTabBlur(
  nextOpen: boolean,
  onOpenChange: (open: boolean) => void,
) {
  if (!nextOpen && (document.hidden || !document.hasFocus())) {
    return;
  }
  onOpenChange(nextOpen);
}
