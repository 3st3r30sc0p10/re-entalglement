import gsap from 'gsap';

const PT = '#page-transition';
const BUNDLE = '.page-transition__bundle';

const S_PACK = '.graph-view-pack';

/** Phase targets ~4s: A 0–0.5 · B wipes · C hold 0.6 · D peel 0.8 · E/F stagger + settle */
const TIMING = {
    outgoingHold: 0.5,
    plum: 0.7,
    navyDelay: 0.12,
    navy: 0.58,
    edge: 0.44,
    edgeLag: 0.05,
    blackoutHold: 0.6,
    maskPeel: 0.8,
    settleUp: 0.38,
    settleDown: 0.42,
};

function transitionLayers() {
    const pt = document.querySelector(PT);
    return pt ? gsap.utils.toArray('.page-transition__layer', pt) : [];
}

function cinematicTargets() {
    return gsap.utils.toArray(S_PACK);
}

/**
 * Reset overlay + clear transforms on graph chrome (e.g. when idle welcome returns).
 */
export function resetWelcomePageTransition() {
    const pt = document.querySelector(PT);
    const bundle = document.querySelector(BUNDLE);
    if (!pt || !bundle) return;

    const layers = transitionLayers();
    gsap.killTweensOf([bundle, ...layers, ...cinematicTargets()]);
    gsap.set(bundle, { clearProps: 'transform' });
    gsap.set(layers, { clearProps: 'transform' });
    gsap.set(cinematicTargets(), { clearProps: 'all' });

    pt.classList.remove('page-transition--active');
    pt.setAttribute('aria-hidden', 'true');
    pt.removeAttribute('inert');
    pt.style.removeProperty('display');
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Cinematic welcome → graph: layered wipes, navy hold, mask peel, staggered chrome, micro-settle.
 */
export function runWelcomePageTransition({ onMaskHold, onComplete }) {
    const pt = document.querySelector(PT);
    const bundle = document.querySelector(BUNDLE);
    const plum = document.querySelector('.page-transition__layer--plum');
    const edge = document.querySelector('.page-transition__layer--edge');
    const navy = document.querySelector('.page-transition__layer--navy');

    if (!pt || !bundle || !plum || !navy) {
        onMaskHold?.();
        onComplete?.();
        return null;
    }

    if (prefersReducedMotion()) {
        pt.style.display = 'none';
        onMaskHold?.();
        onComplete?.();
        return null;
    }

    const layers = transitionLayers();
    gsap.killTweensOf([bundle, ...layers, ...cinematicTargets()]);

    gsap.set(bundle, { x: '0%', force3D: true });
    gsap.set(layers, { x: '100%', force3D: true });

    pt.style.display = 'block';
    pt.classList.add('page-transition--active');
    pt.setAttribute('aria-hidden', 'false');
    pt.setAttribute('inert', '');

    const tPlum = TIMING.outgoingHold;
    const wipeEnd = tPlum + TIMING.plum;
    const peelStart = wipeEnd + TIMING.blackoutHold;

    const tl = gsap.timeline({
        defaults: { force3D: true },
        onComplete: () => {
            pt.classList.remove('page-transition--active');
            pt.setAttribute('aria-hidden', 'true');
            pt.removeAttribute('inert');
            pt.style.display = 'none';
            gsap.set(bundle, { clearProps: 'transform' });
            gsap.set(layers, { clearProps: 'transform' });
            onComplete?.();
        },
    });

    /* Phase A — outgoing hero hold (no visible change; burns time only) */
    tl.fromTo(
        pt,
        { opacity: 1 },
        { opacity: 1, duration: TIMING.outgoingHold, ease: 'none' },
        0
    );

    /* Phase B — stacked vertical wipes (transform only) */
    tl.fromTo(
        plum,
        { x: '100%' },
        { x: '0%', duration: TIMING.plum, ease: 'power4.inOut', immediateRender: false },
        tPlum
    );

    tl.fromTo(
        navy,
        { x: '100%' },
        { x: '0%', duration: TIMING.navy, ease: 'power4.inOut', immediateRender: false },
        tPlum + TIMING.navyDelay
    );

    if (edge) {
        tl.fromTo(
            edge,
            { x: '100%' },
            { x: '0%', duration: TIMING.edge, ease: 'power3.inOut', immediateRender: false },
            tPlum + TIMING.edgeLag
        );
    }

    /* Phase C — full-screen hold; safe window for DOM / layout under mask */
    tl.call(() => onMaskHold?.(), null, wipeEnd);
    tl.addLabel('afterHold', wipeEnd + TIMING.blackoutHold);

    /* Phase D — mask bundle exits left (reveals pre-mounted layout) */
    tl.fromTo(
        bundle,
        { x: '0%' },
        {
            x: '-100%',
            duration: TIMING.maskPeel,
            ease: 'power3.inOut',
            immediateRender: false,
        },
        'afterHold'
    );

    /* Phase E / F — graph stage only (full-bleed network; no surrounding chrome) */
    const p = peelStart;
    tl.from(S_PACK, {
        x: -50,
        scale: 0.92,
        opacity: 0,
        duration: 0.72,
        ease: 'back.out(1.35)',
    }, p - 0.45);

    /* Phase F — micro-settle */
    const peelEnd = peelStart + TIMING.maskPeel;
    const settleStart = peelEnd + 0.28;
    tl.to(S_PACK, {
        scale: 1.012,
        duration: TIMING.settleUp,
        ease: 'power2.out',
    }, settleStart);

    tl.to(S_PACK, {
        scale: 1,
        duration: TIMING.settleDown,
        ease: 'power3.inOut',
    });

    return tl;
}
