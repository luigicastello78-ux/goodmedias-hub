export const insertAtCursor = (
  value: string,
  snippet: string,
  element: HTMLInputElement | HTMLTextAreaElement | null,
): { next: string; cursor: number } => {
  const start = element?.selectionStart ?? value.length;
  const end = element?.selectionEnd ?? value.length;
  const next = `${value.slice(0, start)}${snippet}${value.slice(end)}`;
  return { next, cursor: start + snippet.length };
};

export const restoreCursor = (
  element: HTMLInputElement | HTMLTextAreaElement | null,
  cursor: number,
) => {
  if (!element) {
    return;
  }
  requestAnimationFrame(() => {
    element.focus();
    element.setSelectionRange(cursor, cursor);
  });
};
