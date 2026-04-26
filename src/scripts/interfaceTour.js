/**
 * Post-welcome guided tour using [Intro.js](https://github.com/usablica/intro.js) (AGPL-3.0).
 * Before the tour, the app switches the graph into a **tour-only** layout: every tag, every
 * co-tag edge, tail nodes for one sample lecture, and the left icon rail—without opening slide panels.
 */
import introJs from 'intro.js';
import 'intro.js/minified/introjs.min.css';

function step(el, partial) {
    const element = typeof el === 'string' ? document.querySelector(el) : el;
    if (!element) return null;
    return { element, ...partial };
}

function buildTourSteps() {
    const steps = [
        {
            title: 'Guided tour',
            intro:
                'This walkthrough uses a <strong>demo layout</strong> of the network so you can see <strong>every node type</strong> and the <strong>left tool rail</strong> at once. The rail stays visible on the left during the tour so you can match each step to an icon. Whenever you leave the demo—<strong>Done</strong>, the close control, overlay click, or <kbd>Esc</kbd>—you return to the <strong>welcome</strong> screen.',
            position: 'bottom',
        },
        step('.icon-rail', {
            title: 'Left tool rail',
            intro:
                'These icons open tools and panels. In normal use they appear after you select a video; here they stay visible so you can see which control the next steps describe.',
            position: 'right',
        }),
        step('.graph-container', {
            title: 'Visualization stage',
            intro:
                'The <strong>network</strong> sits here: lectures, shared themes, and tail prompts laid out as a force-directed graph. You can pan and zoom on the background at any time.',
            position: 'bottom',
        }),
        step('#network-graph', {
            title: 'Nodes & edges',
            intro:
                '<strong>Charcoal</strong> circles are lecture videos. <strong>Amber</strong> circles are thematic tags (shared across videos). <strong>Coral / red</strong> circles are <em>tail</em> categories for the chatbot—here you see them for one sample lecture so the full palette is visible. Lines show how items connect.',
            position: 'bottom',
        }),
        step('.graph-controls', {
            title: 'Zoom controls',
            intro: 'Use <strong>+</strong>, <strong>−</strong>, and <strong>Reset</strong> to change scale. These stay available while you explore.',
            position: 'left',
        }),
        step('.icon-rail-btn[data-open="video"]', {
            title: 'Video',
            intro: 'Fullscreen playback of the selected lecture.',
            position: 'right',
        }),
        step('.icon-rail-btn[data-open="description"]', {
            title: 'Information',
            intro: 'Slide-in with title, speaker, and description for the selected video.',
            position: 'right',
        }),
        step('.icon-rail-btn[data-open="tags"]', {
            title: 'Tags:',
            intro: 'Browse tags for the lecture and run image searches from archival APIs.',
            position: 'right',
        }),
        step('.icon-rail-btn[data-open="tails"]', {
            title: 'Tail categories',
            intro: 'Lists tail prompts for the selected video—pick one to shape the chatbot conversation.',
            position: 'right',
        }),
        step('.icon-rail-btn[data-open="about"]', {
            title: 'About',
            intro: 'Full-screen project credits and context.',
            position: 'right',
        }),
        step('.icon-rail-btn[data-open="feedback"]', {
            title: 'Feedback',
            intro: 'Send an anonymous comment (stored on the project server).',
            position: 'right',
        }),
        {
            title: 'Next steps',
            intro:
                'Leaving the tour always returns you here. Tap <strong>Done</strong>, then choose <strong>Enter visualization</strong> for the standard experience: start from video nodes, then open the rail and panels as you go.',
            position: 'bottom',
        },
    ];

    return steps.filter(Boolean);
}

function attachTourCleanup(tour) {
    /** Runs for every tour end: last-step Done, ×, overlay, Esc, or mid-tour exit. */
    tour.onExit(() => {
        try {
            window.app?.cleanupInterfaceTour?.();
        } catch {
            /* ignore */
        }
        try {
            window.__showWelcomeScreen?.();
        } catch {
            /* ignore */
        }
        try {
            window.app?.networkGraph?.handleResize?.();
        } catch {
            /* ignore */
        }
    });
}

/**
 * Run the interface tour. Call after the welcome transition; assumes `window.app` exists.
 */
export function startInterfaceDemoTour() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        console.info('interfaceTour: skipped (prefers-reduced-motion: reduce).');
        return;
    }

    try {
        window.app?.prepareInterfaceTour?.();
    } catch (e) {
        console.warn('interfaceTour: prepare failed', e);
    }

    const steps = buildTourSteps();
    if (steps.length < 2) {
        console.warn('interfaceTour: not enough DOM targets for tour; skipping.');
        window.app?.cleanupInterfaceTour?.();
        try {
            window.__showWelcomeScreen?.();
        } catch {
            /* ignore */
        }
        return;
    }

    window.requestAnimationFrame(() => {
        const tour = introJs.tour();
        tour.setOptions({
            steps,
            showProgress: true,
            showBullets: true,
            exitOnOverlayClick: true,
            scrollToElement: true,
            disableInteraction: true,
            tooltipClass: 'interface-tour-tooltip',
            highlightClass: 'interface-tour-highlight',
        });

        attachTourCleanup(tour);

        window.app?.showLateralPanels?.();
        document.querySelector('.icon-rail')?.classList.add('icon-rail--demo-tour');
        tour.start().catch((err) => {
            console.warn('interfaceTour: intro did not start', err);
            window.app?.cleanupInterfaceTour?.();
            try {
                window.__showWelcomeScreen?.();
            } catch {
                /* ignore */
            }
        });
    });
}
