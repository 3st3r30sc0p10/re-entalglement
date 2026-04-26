/**
 * Whether to show the on-screen keyboard and suppress the system soft keyboard
 * (kiosk heuristics, touch, coarse pointer). Used by chat and feedback dialogs.
 */
export function shouldPreferOnScreenKeyboard() {
    const k = typeof window !== 'undefined' ? window.__kioskSession : null;
    if (k && typeof k.useTouchKeyboardForChat === 'function' && k.useTouchKeyboardForChat()) {
        return true;
    }
    if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return true;
    try {
        if (window.matchMedia('(pointer: coarse)').matches) return true;
        if (window.matchMedia('(hover: none)').matches && window.matchMedia('(any-pointer: coarse)').matches) {
            return true;
        }
    } catch {
        /* ignore */
    }
    return typeof window !== 'undefined' && 'ontouchstart' in window;
}
