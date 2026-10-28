/**
 * Copies text: the Clipboard API where the page may use it (HTTPS), otherwise the older
 * select-and-copy, which also works over plain HTTP. False when the browser allowed neither.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    // Missing outside secure contexts, despite the type.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused (no permission, or the tap no longer counts): try the older way.
  }
  return copyBySelection(text);
}

function copyBySelection(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  // Off screen, and big enough text that iOS doesn't zoom in on it.
  field.style.position = 'fixed';
  field.style.top = '-1000px';
  field.style.fontSize = '16px';
  document.body.append(field);
  field.select();
  field.setSelectionRange(0, text.length);
  try {
    // Deprecated, but the only way to copy where the Clipboard API isn't available.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
