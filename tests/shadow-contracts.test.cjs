const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const extensionPath = path.join(__dirname, '..', 'extension.js');
const source = fs.readFileSync(extensionPath, 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace('export default class ', 'class ');

function signalObject(properties = {}) {
    let nextId = 1;
    const signals = new Map();
    return Object.assign({
        signals,
        disconnected: [],
        connect(signal, callback) {
            const id = nextId++;
            signals.set(id, {signal, callback});
            return id;
        },
        disconnect(id) {
            assert.ok(signals.delete(id), `unknown signal ${id}`);
            this.disconnected.push(id);
        },
        emit(signal) {
            for (const entry of [...signals.values()]) {
                if (entry.signal === signal)
                    entry.callback();
            }
        },
    }, properties);
}

function harness({fallbackColor = false} = {}) {
    const placements = [];
    const group = {set_child_below_sibling: (...args) => placements.push(args)};
    const workspace = {};
    const shellGlobal = {
        display: {focus_window: null},
        window_group: group,
        workspace_manager: {get_active_workspace: () => workspace},
    };
    const Main = {overview: {visible: false}, sessionMode: {isLocked: false}};
    const WindowType = {NORMAL: 0, DIALOG: 1, MODAL_DIALOG: 2, DESKTOP: 3};
    const colors = [];
    const black = {red: 0, green: 0, blue: 0};
    const color = {red: 51, green: 102, blue: 153};
    const Color = {
        from_string(value) {
            colors.push(value);
            return value === 'invalid' ? [false, null] :
                [true, value === '#000000' ? black : color];
        },
    };
    const context = vm.createContext({
        Clutter: {BrightnessContrastEffect: class {}, Color},
        Meta: {WindowType},
        GObject: {
            registerClass: (_properties, klass) => klass,
            ParamSpec: {double: () => ({})},
            ParamFlags: {READWRITE: 1},
        },
        Extension: class {},
        Cogl: fallbackColor ? {} : {Color},
        Cairo: {Operator: {CLEAR: 'clear', OVER: 'over'},
            FillRule: {EVEN_ODD: 'even-odd', WINDING: 'winding'}},
        Main,
        global: shellGlobal,
    });
    vm.runInContext(`${source}\nglobalThis.TestExtension = ShadeInactiveWindowsExtension;`,
        context, {filename: extensionPath});
    const extension = new context.TestExtension();
    const binding = () => ({
        source: null,
        offset: null,
        set_source(value) { this.source = value; },
        set_offset(value) { this.offset = value; },
    });
    const shadow = {
        visible: false,
        sizes: [],
        hide() { this.visible = false; },
        show() { this.visible = true; },
        set_size(...size) { this.sizes.push(size); },
    };
    const actor = signalObject({
        visible: true, mapped: true, opacity: 193,
        scale_x: 1, scale_y: 1, translation_x: 0, translation_y: 0,
        get_parent: () => group,
    });
    let frameReads = 0;
    const frame = {x: 100, y: 200, width: 300, height: 180};
    const window = signalObject({
        minimized: false, maximized_horizontally: false, maximized_vertically: false,
        get_compositor_private: () => actor,
        is_fullscreen: () => false,
        located_on_workspace(value) { assert.equal(value, workspace); return true; },
        get_window_type: () => WindowType.NORMAL,
        get_frame_rect() { frameReads++; return frame; },
        get_buffer_rect: () => ({x: 94, y: 191}),
    });
    Object.assign(extension, {
        _signalsShadow: [],
        _actorShadow: shadow,
        _bindShadowX: binding(),
        _bindShadowY: binding(),
        _focusActorShadow: actor,
        _windowShadow: window,
        _shadowFrame: null,
        _shadowEnabled: true,
        _shadowWidth: 10,
        _shadowRadius: 6,
        _shadowOpacity: 0.4,
        _shadowColor: color,
    });
    shellGlobal.display.focus_window = window;
    return {extension, actor, window, shadow, shellGlobal, Main, WindowType,
        placements, frame, colors, color, black, frameReads: () => frameReads};
}

test('eligible shadow geometry includes padding, offsets, stacking and actor opacity', () => {
    const h = harness();
    h.extension._syncShadow();
    assert.equal(h.shadow.visible, true);
    assert.equal(h.shadow.opacity, 193);
    assert.deepEqual(h.shadow.sizes, [[324, 204]]);
    assert.equal(h.extension._bindShadowX.offset, -6);
    assert.equal(h.extension._bindShadowY.offset, -3);
    assert.equal(h.extension._shadowFrame, h.frame);
    assert.deepEqual(h.placements, [[h.shadow, h.actor]]);
    h.actor.opacity = 71;
    h.extension._syncShadow();
    assert.equal(h.shadow.opacity, 71);
    assert.equal(h.frameReads(), 1);
    assert.equal(h.shadow.sizes.length, 1);
});

test('explicit geometry invalidation recomputes resized frames and changed shadow width', () => {
    const h = harness();
    h.extension._syncShadow();
    h.frame.width = 400;
    h.extension._shadowWidth = 20;
    h.extension._syncShadow(true);
    assert.equal(h.frameReads(), 2);
    assert.deepEqual(h.shadow.sizes, [[324, 204], [444, 224]]);
    assert.equal(h.extension._bindShadowX.offset, -16);
    assert.equal(h.extension._bindShadowY.offset, -13);
});

const visibilityGates = {
    disabled: h => { h.extension._shadowEnabled = false; },
    'missing window': h => { h.extension._windowShadow = null; },
    'missing actor': h => { h.extension._focusActorShadow = null; },
    'missing parent': h => { h.actor.get_parent = () => null; },
    'foreign parent': h => { h.actor.get_parent = () => ({}); },
    invisible: h => { h.actor.visible = false; },
    unmapped: h => { h.actor.mapped = false; },
    minimized: h => { h.window.minimized = true; },
    fullscreen: h => { h.window.is_fullscreen = () => true; },
    maximized: h => {
        h.window.maximized_horizontally = h.window.maximized_vertically = true;
    },
    'other workspace': h => { h.window.located_on_workspace = () => false; },
    'unsupported window type': h => { h.window.get_window_type = () => h.WindowType.DESKTOP; },
    overview: h => { h.Main.overview.visible = true; },
    locked: h => { h.Main.sessionMode.isLocked = true; },
    'horizontal scaling': h => { h.actor.scale_x = 0.9; },
    'vertical scaling': h => { h.actor.scale_y = 0.9; },
    'horizontal translation': h => { h.actor.translation_x = 1; },
    'vertical translation': h => { h.actor.translation_y = 1; },
};

for (const [name, apply] of Object.entries(visibilityGates)) {
    test(`shadow hides for ${name} without updating geometry or stacking`, () => {
        const h = harness();
        h.extension._syncShadow();
        apply(h);
        h.extension._syncShadow(true);
        assert.equal(h.shadow.visible, false);
        assert.equal(h.extension._shadowFrame, null);
        assert.equal(h.frameReads(), 1);
        assert.equal(h.placements.length, 1);
        assert.equal(h.shadow.sizes.length, 1);
    });
}

for (const type of ['NORMAL', 'DIALOG', 'MODAL_DIALOG']) {
    test(`shadow accepts ${type} and a window maximized on only one axis`, () => {
        const h = harness();
        h.window.get_window_type = () => h.WindowType[type];
        h.window.maximized_horizontally = true;
        h.extension._syncShadow();
        assert.equal(h.shadow.visible, true);
        h.window.maximized_horizontally = false;
        h.window.maximized_vertically = true;
        h.extension._syncShadow();
        assert.equal(h.shadow.visible, true);
    });
}

function focus(h) {
    h.extension._focusActorShadow = null;
    h.extension._windowShadow = null;
    h.extension._focusShadow();
}

test('focus binds both coordinates and subscribes exactly to geometry and visibility signals', () => {
    const h = harness();
    focus(h);
    assert.equal(h.extension._bindShadowX.source, h.actor);
    assert.equal(h.extension._bindShadowY.source, h.actor);
    assert.equal(h.extension._windowShadow, h.window);
    assert.deepEqual([...h.window.signals.values()].map(entry => entry.signal),
        ['size-changed', 'workspace-changed', 'notify::minimized', 'notify::fullscreen']);
    assert.deepEqual([...h.actor.signals.values()].map(entry => entry.signal),
        ['notify::width', 'notify::height', 'notify::visible', 'notify::mapped',
            'notify::opacity', 'notify::scale-x', 'notify::scale-y',
            'notify::translation-x', 'notify::translation-y', 'destroy']);
    h.extension._focusShadow();
    assert.equal(h.extension._signalsShadow.length, 14);
    assert.equal(h.actor.disconnected.length, 0);
    assert.equal(h.window.disconnected.length, 0);
    assert.equal(h.frameReads(), 1);
});

test('geometry callbacks invalidate while visibility callbacks preserve cached frames', () => {
    const h = harness();
    focus(h);
    for (const [object, signal] of [[h.window, 'size-changed'],
        [h.actor, 'notify::width'], [h.actor, 'notify::height']]) {
        const before = h.frameReads();
        object.emit(signal);
        assert.equal(h.frameReads(), before + 1);
    }
    const before = h.frameReads();
    h.actor.visible = false;
    h.actor.emit('notify::visible');
    assert.equal(h.shadow.visible, false);
    h.actor.visible = true;
    h.actor.emit('notify::visible');
    assert.equal(h.shadow.visible, true);
    h.actor.opacity = 42;
    h.actor.emit('notify::opacity');
    assert.equal(h.shadow.opacity, 42);
    assert.equal(h.frameReads(), before);
});

test('changing focus disconnects old signals and transfers both binding sources', () => {
    const h = harness();
    focus(h);
    const nextActor = signalObject({get_parent: h.actor.get_parent, visible: true,
        mapped: true, opacity: 255, scale_x: 1, scale_y: 1,
        translation_x: 0, translation_y: 0});
    const nextWindow = {
        ...h.window,
        ...signalObject(),
        get_compositor_private: () => nextActor,
    };
    h.shellGlobal.display.focus_window = nextWindow;
    h.extension._focusShadow();
    assert.equal(h.actor.signals.size, 0);
    assert.equal(h.window.signals.size, 0);
    assert.equal(h.actor.disconnected.length, 10);
    assert.equal(h.window.disconnected.length, 4);
    assert.equal(h.extension._bindShadowX.source, nextActor);
    assert.equal(h.extension._bindShadowY.source, nextActor);
    assert.equal(h.extension._focusActorShadow, nextActor);
    assert.equal(h.extension._signalsShadow.length, 14);
    assert.equal(h.shadow.visible, true);
});

test('focus loss releases signal handlers and bindings and hides the shadow', () => {
    const h = harness();
    focus(h);
    h.shellGlobal.display.focus_window = null;
    h.extension._focusShadow();
    assert.equal(h.extension._focusActorShadow, undefined);
    assert.equal(h.extension._windowShadow, null);
    assert.equal(h.shadow.visible, false);
    assert.equal(h.extension._bindShadowX.source, null);
    assert.equal(h.extension._bindShadowY.source, null);
    assert.equal(h.extension._signalsShadow.length, 0);
    assert.equal(h.actor.signals.size + h.window.signals.size, 0);
});

test('actor destruction releases shadow references and repeated disconnect is harmless', () => {
    const h = harness();
    focus(h);
    h.actor.emit('destroy');
    assert.equal(h.extension._focusActorShadow, null);
    assert.equal(h.extension._windowShadow, null);
    assert.equal(h.shadow.visible, false);
    assert.equal(h.extension._bindShadowX.source, null);
    assert.equal(h.extension._bindShadowY.source, null);
    assert.equal(h.extension._signalsShadow.length, 0);
    h.extension._disconnectShadow();
    assert.equal(h.actor.disconnected.length, 10);
    assert.equal(h.window.disconnected.length, 4);
});

for (const fallbackColor of [false, true]) {
    test(`shadow settings use ${fallbackColor ? 'Clutter fallback' : 'Cogl'} colors and opacity`, () => {
        const h = harness({fallbackColor});
        let value = '#336699';
        h.extension._settings = {
            get_boolean(key) { assert.equal(key, 'shadow-enabled'); return false; },
            get_int: key => ({'shadow-width': 0, 'shadow-opacity': 75, 'shadow-radius': 8})[key],
            get_string(key) { assert.equal(key, 'shadow-color'); return value; },
        };
        h.extension._readShadowSettings();
        assert.equal(h.extension._shadowEnabled, false);
        assert.equal(h.extension._shadowWidth, 0);
        assert.equal(h.extension._shadowRadius, 8);
        assert.equal(h.extension._shadowOpacity, 0.75);
        assert.equal(h.extension._shadowColor, h.color);
        value = 'invalid';
        h.extension._readShadowSettings();
        assert.equal(h.extension._shadowColor, h.black);
        assert.deepEqual(h.colors, ['#336699', 'invalid', '#000000']);
    });
}

function drawingContext() {
    const calls = [];
    const cr = Object.fromEntries(['setOperator', 'paint', 'rectangle', 'setFillRule',
        'clip', 'setSourceRGBA', 'fill', 'newSubPath', 'arc', 'closePath', '$dispose']
        .map(name => [name, (...args) => calls.push([name, ...args])]));
    return {cr, calls};
}

test('drawing without a frame clears the surface and disposes the Cairo context', () => {
    const h = harness();
    const {cr, calls} = drawingContext();
    h.shadow.get_context = () => cr;
    h.extension._drawShadow();
    assert.deepEqual(calls, [['setOperator', 'clear'], ['paint'],
        ['setOperator', 'over'], ['$dispose']]);
});

for (const [width, steps] of [[0, 8], [10, 10], [40, 24]]) {
    test(`shadow width ${width} draws ${steps} bounded falloff layers with a clipped interior`, () => {
        const h = harness();
        const {cr, calls} = drawingContext();
        h.extension._shadowWidth = width;
        h.extension._syncShadow();
        h.shadow.get_context = () => cr;
        h.shadow.get_surface_size = () => h.shadow.sizes.at(-1);
        h.extension._drawShadow();
        assert.deepEqual(calls.slice(0, 4), [['setOperator', 'clear'], ['paint'],
            ['setOperator', 'over'], ['rectangle', 0, 0, 300 + 2 * (width + 2),
                180 + 2 * (width + 2)]]);
        const clipIndex = calls.findIndex(([name]) => name === 'clip');
        assert.deepEqual(calls.slice(clipIndex - 1, clipIndex + 2),
            [['setFillRule', 'even-odd'], ['clip'], ['setFillRule', 'winding']]);
        const rgba = calls.filter(([name]) => name === 'setSourceRGBA');
        assert.equal(rgba.length, steps);
        assert.equal(calls.filter(([name]) => name === 'fill').length, steps);
        assert.equal(calls.filter(([name]) => name === 'arc').length, 4 * (steps + 1));
        for (let i = 0; i < steps; i++) {
            assert.deepEqual(rgba[i].slice(1, 4), [0.2, 0.4, 0.6]);
            assert.equal(rgba[i][4], (0.4 / steps) * 1.5 * (1 - i / steps) ** 2);
        }
        const lastExtent = width * ((steps - 1) / steps);
        const arcs = calls.filter(([name]) => name === 'arc');
        assert.equal(arcs.at(-1)[3], 6 + lastExtent);
        assert.deepEqual(calls.at(-1), ['$dispose']);
    });
}

test('drawing errors propagate and still dispose the Cairo context', () => {
    const h = harness();
    const {cr, calls} = drawingContext();
    const failure = new Error('drawing failed');
    cr.paint = () => { throw failure; };
    h.shadow.get_context = () => cr;
    assert.throws(() => h.extension._drawShadow(), error => error === failure);
    assert.deepEqual(calls.at(-1), ['$dispose']);
});

for (const [radius, clamped] of [[-5, 0], [4, 4], [50, 10]]) {
    test(`rounded rectangle clamps radius ${radius} to ${clamped}`, () => {
        const {extension} = harness();
        const {cr, calls} = drawingContext();
        extension._roundedRectShadow(cr, 3, 7, 40, 20, radius);
        assert.deepEqual(calls, [
            ['newSubPath'],
            ['arc', 43 - clamped, 7 + clamped, clamped, -Math.PI / 2, 0],
            ['arc', 43 - clamped, 27 - clamped, clamped, 0, Math.PI / 2],
            ['arc', 3 + clamped, 27 - clamped, clamped, Math.PI / 2, Math.PI],
            ['arc', 3 + clamped, 7 + clamped, clamped, Math.PI, Math.PI * 1.5],
            ['closePath'],
        ]);
    });
}
