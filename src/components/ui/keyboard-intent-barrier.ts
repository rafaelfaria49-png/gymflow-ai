export function isConfirmActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}

export function createKeyboardIntentBarrier() {
  let armed = false;

  return {
    resetForOpen(): void {
      armed = false;
    },

    onKeyDown(): void {
      // Arming is keyed to keyup so a held activation key from the previous
      // step cannot count as a new intention.
    },

    onKeyUp(): void {
      armed = true;
    },

    shouldBlockKeyboardActivation(key: string, repeat: boolean): boolean {
      if (!isConfirmActivationKey(key)) return false;
      if (repeat) return true;
      return !armed;
    },

    isKeyboardArmed(): boolean {
      return armed;
    },
  };
}
