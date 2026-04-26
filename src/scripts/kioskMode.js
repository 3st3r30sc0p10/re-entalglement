/**
 * Presentation / kiosk mode: fullscreen the app, block common browser shortcuts,
 * and exit fullscreen only with Escape (opt out: ?no_kiosk=1).
 */

let kioskExitRequested = false;
let kioskListenersBound = false;

function requestFullscreenEl(el) {
    const req =
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.msRequestFullscreen;
    return req ? Promise.resolve(req.call(el)) : Promise.reject(new Error('no fullscreen'));
}

function exitFullscreenDoc() {
    if (document.exitFullscreen) return document.exitFullscreen();
    if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
    return Promise.resolve();
}

function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export function initKioskMode() {
    const params = new URLSearchParams(window.location.search);
    /** Default on for exhibition installs; add ?no_kiosk=1 to disable (dev / local). */
    const disabled = params.get('no_kiosk') === '1';

    if (disabled) {
        return {
            isEnabled: () => false,
            enterFullscreenFromGesture: () => {},
            tryEnterFullscreen: () => {},
            useTouchKeyboardForChat: () =>
                typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0,
        };
    }

    document.documentElement.classList.add('kiosk-root');
    document.body.classList.add('kiosk-mode');

    if (!kioskListenersBound) {
        kioskListenersBound = true;

        document.addEventListener('contextmenu', (e) => e.preventDefault(), { capture: true });

        document.addEventListener(
            'keydown',
            (e) => {
                if (e.key === 'Escape' && isFullscreen()) {
                    kioskExitRequested = true;
                    exitFullscreenDoc().catch(() => {});
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                if ((e.metaKey || e.ctrlKey) && ['KeyW', 'KeyT', 'KeyN'].includes(e.code)) {
                    e.preventDefault();
                }
                if (e.key === 'F5' || ((e.metaKey || e.ctrlKey) && (e.key === 'r' || e.key === 'R'))) {
                    e.preventDefault();
                }
                if (e.code === 'F12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyI')) {
                    e.preventDefault();
                }
                if ((e.metaKey || e.ctrlKey) && e.code === 'KeyL') {
                    e.preventDefault();
                }
                if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                    e.preventDefault();
                }
                if (e.key === 'F11') {
                    e.preventDefault();
                }
            },
            { capture: true }
        );

        const relock = () => {
            if (kioskExitRequested || !document.documentElement.classList.contains('kiosk-root')) return;
            if (!isFullscreen()) {
                requestFullscreenEl(document.documentElement).catch(() => {});
            }
        };

        document.addEventListener('fullscreenchange', relock);
        document.addEventListener('webkitfullscreenchange', relock);
    }

    const tryEnterFullscreen = () => {
        if (kioskExitRequested || !document.documentElement.classList.contains('kiosk-root')) return;
        if (isFullscreen()) return;
        requestFullscreenEl(document.documentElement).catch(() => {});
    };

    return {
        isEnabled: () => true,
        enterFullscreenFromGesture: () => {
            kioskExitRequested = false;
            tryEnterFullscreen();
        },
        tryEnterFullscreen,
        /** Prefer on-screen keys + suppress system keyboard on touch / coarse-pointer devices (not all desktops). */
        useTouchKeyboardForChat: () => {
            try {
                if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return true;
                return window.matchMedia('(pointer: coarse)').matches;
            } catch {
                return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
            }
        },
    };
}

export function isKioskMode() {
    return typeof document !== 'undefined' && document.documentElement.classList.contains('kiosk-root');
}
