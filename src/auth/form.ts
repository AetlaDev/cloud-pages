export function setFieldError(fieldId: string, message: string): void {
  const field = document.getElementById(fieldId);
  if (!field) return;

  const errorSlot = field.querySelector('[slot="error"]');
  const changed = (errorSlot?.textContent ?? '') !== message;
  if (errorSlot) errorSlot.textContent = message;

  if (message) {
    if (changed && field.hasAttribute('data-invalid')) {
      field.removeAttribute('data-invalid');
      void field.offsetWidth;
    }
    field.setAttribute('data-invalid', '');
  } else {
    field.removeAttribute('data-invalid');
  }

  const control = field.querySelector<HTMLInputElement>('input, textarea, select');
  if (!control) return;

  control.setCustomValidity(message);
  control.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

export function clearErrors(...fieldIds: string[]): void {
  fieldIds.forEach((id) => setFieldError(id, ''));
}

let submitAttempted = false;

export function markSubmitAttempted(): void {
  submitAttempted = true;
}

export function liveValidate(
  input: HTMLInputElement,
  fieldId: string,
  check: (value: string) => string,
): void {
  const run = () => {
    const skipEmpty = input.value === '' && !submitAttempted;
    setFieldError(fieldId, skipEmpty ? '' : check(input.value));
  };
  input.addEventListener('input', run);
  input.addEventListener('blur', run);
}

export function setBusy(button: HTMLElement | null, busy: boolean): void {
  if (!button) return;
  button.toggleAttribute('disabled', busy);
}
