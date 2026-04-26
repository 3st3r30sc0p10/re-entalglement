/**
 * On-screen keyboard for chat on touch / kiosk setups (inserts into a textarea).
 */
const ROWS = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace'],
    ['123', ',', 'space', '.', '-', "'"]
];

const NUM_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export class TouchKeyboard {
    /**
     * @param {HTMLElement} host
     * @param {HTMLTextAreaElement} textarea
     */
    constructor(host, textarea) {
        this.host = host;
        this.textarea = textarea;
        this.shiftLock = false;
        this.numberMode = false;
        this.disabled = false;
        this._onKeyDown = (e) => {
            if (e.key === 'Escape') e.stopPropagation();
        };
    }

    mount() {
        if (!this.host || !this.textarea) return;
        this.host.innerHTML = '';
        this.host.classList.add('touch-keyboard');
        this.host.hidden = false;
        this.host.setAttribute('role', 'group');
        this.host.setAttribute('aria-label', 'On-screen keyboard');
        this.render();
        this.host.addEventListener('keydown', this._onKeyDown, true);
    }

    unmount() {
        if (!this.host) return;
        this.host.removeEventListener('keydown', this._onKeyDown, true);
        this.host.innerHTML = '';
        this.host.hidden = true;
        this.host.classList.remove('touch-keyboard');
    }

    setDisabled(on) {
        this.disabled = on;
        this.host?.querySelectorAll('.touch-keyboard__key').forEach((btn) => {
            btn.disabled = on;
        });
    }

    render() {
        if (!this.host) return;
        /* mount() clears once; shift / 123 / abc call render() again and must not stack rows */
        this.host.replaceChildren();

        const frag = document.createDocumentFragment();
        if (this.numberMode) {
            frag.appendChild(this._makeRow(NUM_ROW.map((k) => ({ type: 'char', ch: k }))));
            frag.appendChild(
                this._makeRow([
                    { type: 'sym', ch: '@' },
                    { type: 'sym', ch: '#' },
                    { type: 'sym', ch: '?' },
                    { type: 'sym', ch: '!' },
                    { type: 'sym', ch: ':' },
                    { type: 'action', id: 'abc', label: 'ABC' }
                ])
            );
        } else {
            for (const row of ROWS) {
                frag.appendChild(
                    this._makeRow(
                        row.map((id) => {
                            if (id === 'shift') return { type: 'action', id: 'shift', label: '⇧' };
                            if (id === 'backspace') return { type: 'action', id: 'backspace', label: '⌫' };
                            if (id === '123') return { type: 'action', id: '123', label: '123' };
                            if (id === 'space') return { type: 'action', id: 'space', label: 'Space' };
                            return {
                                type: 'char',
                                ch: this.shiftLock ? id.toUpperCase() : id
                            };
                        })
                    )
                );
            }
        }
        this.host.appendChild(frag);
        if (this.disabled) {
            this.host.querySelectorAll('.touch-keyboard__key').forEach((btn) => {
                btn.disabled = true;
            });
        }
    }

    _makeRow(specs) {
        const row = document.createElement('div');
        row.className = 'touch-keyboard__row';
        for (const spec of specs) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'touch-keyboard__key';
            if (spec.type === 'char' || spec.type === 'sym') {
                btn.textContent = spec.ch;
                btn.dataset.insert = spec.ch;
            } else if (spec.type === 'action') {
                btn.textContent = spec.label;
                btn.dataset.action = spec.id;
                if (spec.id === 'space') btn.classList.add('touch-keyboard__key--space');
                if (spec.id === 'shift') {
                    btn.classList.add('touch-keyboard__key--wide');
                    if (this.shiftLock) btn.classList.add('touch-keyboard__key--active');
                }
                if (spec.id === 'backspace') btn.classList.add('touch-keyboard__key--wide');
                if (spec.id === '123' || spec.id === 'abc') btn.classList.add('touch-keyboard__key--wide');
            }
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this._onKeyClick(btn);
            });
            row.appendChild(btn);
        }
        return row;
    }

    _onKeyClick(btn) {
        if (this.disabled) return;
        const ta = this.textarea;
        if (!ta) return;

        const insert = btn.dataset.insert;
        const action = btn.dataset.action;

        if (insert != null) {
            this._insertText(insert);
            return;
        }

        if (action === 'backspace') {
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            if (start === 0 && end === 0) return;
            if (start !== end) {
                ta.setRangeText('', start, end, 'end');
            } else {
                ta.setRangeText('', start - 1, start, 'end');
            }
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }

        if (action === 'space') {
            this._insertText(' ');
            return;
        }

        if (action === 'shift') {
            this.shiftLock = !this.shiftLock;
            this.render();
            return;
        }

        if (action === '123') {
            this.numberMode = true;
            this.shiftLock = false;
            this.render();
            return;
        }

        if (action === 'abc') {
            this.numberMode = false;
            this.render();
        }
    }

    _insertText(text) {
        const ta = this.textarea;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const max = Number(ta.getAttribute('maxlength')) || 1000;
        if (ta.value.length - (end - start) + text.length > max) return;
        ta.setRangeText(text, start, end, 'end');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.focus({ preventScroll: true });
    }
}
