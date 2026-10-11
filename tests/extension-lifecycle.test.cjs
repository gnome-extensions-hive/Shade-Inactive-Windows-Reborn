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
        emit(signal, ...args) {
            for (const entry of [...signals.values()]) {
                if (entry.signal === signal)
                    entry.callback(this, ...args);
            }
        },
    }, properties);
}

function harness() {
    const calls = [];
    const shadows = [];
    const settings = signalObject({
        get_int(key) {
            calls.push(['get_int', key]);
            assert.equal(key, 'fade-duration');
            return 350;
        },
    });
    const display = signalObject({focus_window: null});
    const windowManager = signalObject();
    const overview = signalObject();
    const sessionMode = signalObject();
    const children = [];
    const tracker = {};

    class DrawingArea {
        constructor(properties) {
            Object.assign(this, signalObject(), properties);
            this.constraints = [];
            this.repaintCount = 0;
            this.destroyCount = 0;
            shadows.push(this);
        }
        add_constraint(constraint) {
            this.constraints.push(constraint);
        }
        queue_repaint() {
            this.repaintCount++;
        }
        destroy() {
            assert.equal(this.signals.size, 0, 'repaint handler must be disconnected');
            this.destroyCount++;
        }
    }

    class BindConstraint {
        constructor(properties) {
            Object.assign(this, properties);
        }
    }

    const context = vm.createContext({
        Clutter: {
            BrightnessContrastEffect: class {},
            BindConstraint,
            BindCoordinate: {X: 'x', Y: 'y'},
        },
        Cogl: {Color: {from_string() {}}},
        GObject: {
            registerClass: (_properties, klass) => klass,
            ParamSpec: {double: () => ({})},
            ParamFlags: {READWRITE: 1},
        },
        Shell: {WindowTracker: {get_default: () => tracker}},
        St: {DrawingArea},
        Extension: class {
            getSettings() { return settings; }
        },
        Main: {overview, sessionMode},
        global: {
            display,
            window_manager: windowManager,
            window_group: {add_child: child => children.push(child)},
        },
    });
    vm.runInContext(
        `${source}\nglobalThis.TestExtension = ShadeInactiveWindowsExtension;`,
        context, {filename: extensionPath});
    const extension = new context.TestExtension();

    // Other held suites own these methods; only their lifecycle call contracts are tested here.
    extension._readShadowSettings = () => calls.push(['readShadowSettings']);
    extension._focusShadow = () => calls.push(['focusShadow']);
    extension._syncShadow = (...args) => calls.push(['syncShadow', ...args]);
    extension._drawShadow = () => calls.push(['drawShadow']);
    extension._reloadSettings = () => {
        assert.equal(extension._settings, settings);
        assert.equal(extension._windowTracker, tracker);
        assert.ok(extension._actors);
        extension._excludedApps = new Set();
        calls.push(['reloadSettings']);
    };
    extension._refresh = () => calls.push(['refresh']);
    extension._updateActor = actor => calls.push(['updateActor', actor, extension._focusedActor]);
    extension._forgetActor = actor => {
        calls.push(['forgetActor', actor]);
        extension._actors.delete(actor);
    };
    extension._disconnectShadow = () => calls.push(['disconnectShadow']);

    return {
        extension, calls, shadows, settings, display, windowManager,
        overview, sessionMode, children, tracker,
        emitters: [settings, display, windowManager, overview, sessionMode],
    };
}

test('enable initializes fresh state before settings and initial refresh', () => {
    const h = harness();
    h.extension.enable();
    assert.equal(h.extension._actors.size, 0);
    assert.equal(h.extension._focusedActor, null);
    assert.equal(h.extension._settings, h.settings);
    assert.equal(h.extension._windowTracker, h.tracker);
    assert.deepEqual(h.calls, [
        ['readShadowSettings'], ['focusShadow'], ['reloadSettings'], ['refresh'],
    ]);
});

test('shadow initialization creates a hidden nonreactive child and X/Y constraints', () => {
    const h = harness();
    h.extension.enable();
    const shadow = h.extension._actorShadow;
    assert.deepEqual(h.children, [shadow]);
    assert.equal(shadow.reactive, false);
    assert.equal(shadow.can_focus, false);
    assert.equal(shadow.visible, false);
    assert.deepEqual(shadow.constraints, [h.extension._bindShadowX, h.extension._bindShadowY]);
    assert.equal(h.extension._bindShadowX.coordinate, 'x');
    assert.equal(h.extension._bindShadowY.coordinate, 'y');
    assert.equal(h.extension._signalsShadow.length, 0);
    shadow.emit('repaint');
    assert.deepEqual(h.calls.at(-1), ['drawShadow']);
    assert.ok(shadow.signals.has(h.extension._repaintId));
});

test('all global lifecycle signals are tracked on the object that owns their IDs', () => {
    const h = harness();
    h.extension.enable();
    const expected = [
        [h.display, 'notify::focus-window'], [h.display, 'restacked'],
        [h.windowManager, 'map'], [h.windowManager, 'switch-workspace'],
        [h.overview, 'showing'], [h.overview, 'hidden'], [h.sessionMode, 'updated'],
        [h.settings, 'changed'], [h.settings, 'changed'],
        [h.display, 'notify::focus-window'], [h.windowManager, 'map'],
    ];
    const actual = Array.from(h.extension._signals,
        ([object, id]) => [object, object.signals.get(id).signal]);
    assert.deepEqual(actual, expected);
});

test('_connect retains identical numeric IDs belonging to different objects', () => {
    const h = harness();
    const first = signalObject();
    const second = signalObject();
    const callback = () => {};
    h.extension._signals = [];
    h.extension._connect(first, 'first', callback);
    h.extension._connect(second, 'second', callback);
    assert.deepEqual(Array.from(h.extension._signals, pair => Array.from(pair)),
        [[first, 1], [second, 1]]);
    assert.equal(first.signals.get(1).callback, callback);
    assert.equal(second.signals.get(1).callback, callback);
});

for (const [emitter, signal, method] of [
    ['display', 'restacked', 'syncShadow'],
    ['windowManager', 'switch-workspace', 'syncShadow'],
    ['overview', 'showing', 'syncShadow'],
    ['overview', 'hidden', 'syncShadow'],
    ['sessionMode', 'updated', 'syncShadow'],
]) {
    test(`${emitter} ${signal} synchronizes shadow without invalidating geometry`, () => {
        const h = harness();
        h.extension.enable();
        h.calls.length = 0;
        h[emitter].emit(signal);
        assert.deepEqual(h.calls, [[method]]);
    });
}

test('map forwards the actual mapped actor and updates shadow focus', () => {
    const h = harness();
    h.extension.enable();
    const actor = {};
    h.calls.length = 0;
    h.windowManager.emit('map', actor);
    assert.deepEqual(h.calls, [['focusShadow'], ['updateActor', actor, null]]);
});

test('focus change clears old focus before updating previous and current actors', () => {
    const h = harness();
    h.extension.enable();
    const previous = {};
    const current = {};
    h.extension._focusedActor = previous;
    h.display.focus_window = {get_compositor_private: () => current};
    h.calls.length = 0;
    h.display.emit('notify::focus-window');
    assert.deepEqual(h.calls, [
        ['focusShadow'], ['updateActor', previous, null], ['updateActor', current, null],
    ]);
});

test('focus loss updates the previous actor without dereferencing a missing window', () => {
    const h = harness();
    h.extension.enable();
    const previous = {};
    h.extension._focusedActor = previous;
    h.calls.length = 0;
    h.display.emit('notify::focus-window');
    assert.equal(h.extension._focusedActor, null);
    assert.deepEqual(h.calls, [['focusShadow'], ['updateActor', previous, null]]);
});

test('focus notification with no previous or current compositor actor is safe', () => {
    const h = harness();
    h.extension.enable();
    h.display.focus_window = {get_compositor_private: () => null};
    h.calls.length = 0;
    h.display.emit('notify::focus-window');
    assert.deepEqual(h.calls, [['focusShadow']]);
});

test('fade-duration changes only read duration, without refreshing or repainting', () => {
    const h = harness();
    h.extension.enable();
    h.calls.length = 0;
    h.settings.emit('changed', 'fade-duration');
    assert.equal(h.extension._duration, 350);
    assert.deepEqual(h.calls, [['get_int', 'fade-duration']]);
    assert.equal(h.extension._actorShadow.repaintCount, 0);
});

for (const key of ['shade-level', 'excluded-apps']) {
    test(`${key} changes reload settings before refreshing actors`, () => {
        const h = harness();
        h.extension.enable();
        h.calls.length = 0;
        h.settings.emit('changed', key);
        assert.deepEqual(h.calls, [['reloadSettings'], ['refresh']]);
        assert.equal(h.extension._actorShadow.repaintCount, 0);
    });
}

for (const key of ['shadow-enabled', 'shadow-width', 'shadow-color']) {
    test(`${key} changes refresh shadow geometry and repaint, then refresh shading`, () => {
        const h = harness();
        h.extension.enable();
        h.calls.length = 0;
        h.settings.emit('changed', key);
        assert.deepEqual(h.calls, [
            ['readShadowSettings'], ['syncShadow', true], ['reloadSettings'], ['refresh'],
        ]);
        assert.equal(h.extension._actorShadow.repaintCount, 1);
    });
}

test('disable disconnects every global handler before forgetting each tracked actor', () => {
    const h = harness();
    h.extension.enable();
    const actors = [{}, {}, {}];
    for (const actor of actors)
        h.extension._actors.set(actor, {});
    const trackedActors = h.extension._actors;
    h.extension._forgetActor = actor => {
        for (const emitter of h.emitters)
            assert.equal(emitter.signals.size, 0);
        assert.equal(h.extension._actors, trackedActors);
        h.calls.push(['forgetActor', actor]);
        trackedActors.delete(actor);
    };
    h.calls.length = 0;
    h.extension.disable();
    assert.deepEqual(h.calls, [
        ...actors.map(actor => ['forgetActor', actor]), ['disconnectShadow'],
    ]);
    assert.equal(trackedActors.size, 0);
    assert.deepEqual(h.emitters.map(emitter => emitter.disconnected.length), [2, 3, 3, 2, 1]);
});

test('disable disconnects shadow bindings before discarding them and destroys the drawing area', () => {
    const h = harness();
    h.extension.enable();
    const shadow = h.extension._actorShadow;
    const repaintId = h.extension._repaintId;
    const x = h.extension._bindShadowX;
    const y = h.extension._bindShadowY;
    h.extension._disconnectShadow = () => {
        assert.equal(h.extension._bindShadowX, x);
        assert.equal(h.extension._bindShadowY, y);
        assert.equal(h.extension._actorShadow, shadow);
        assert.equal(shadow.destroyCount, 0);
        h.calls.push(['disconnectShadow']);
    };
    h.extension._focusActorShadow = {};
    h.extension._windowShadow = {};
    h.extension._shadowFrame = {};
    h.extension._shadowColor = {};
    h.extension.disable();
    assert.deepEqual(shadow.disconnected, [repaintId]);
    assert.equal(shadow.destroyCount, 1);
    for (const key of [
        '_signals', '_actors', '_focusedActor', '_settings', '_windowTracker',
        '_excludedApps', '_repaintId', '_bindShadowX', '_bindShadowY',
        '_actorShadow', '_focusActorShadow', '_windowShadow', '_signalsShadow',
        '_shadowFrame', '_shadowColor',
    ])
        assert.equal(h.extension[key], null, key);
});

test('disable still destroys the shadow when its repaint handler was already removed', () => {
    const h = harness();
    h.extension.enable();
    const shadow = h.extension._actorShadow;
    shadow.disconnect(h.extension._repaintId);
    h.extension._repaintId = null;
    h.extension.disable();
    assert.equal(shadow.disconnected.length, 1);
    assert.equal(shadow.destroyCount, 1);
});

test('events emitted after disable cannot invoke stale lifecycle callbacks', () => {
    const h = harness();
    h.extension.enable();
    const shadow = h.extension._actorShadow;
    h.extension.disable();
    h.calls.length = 0;
    for (const emitter of h.emitters) {
        for (const signal of [
            'changed', 'notify::focus-window', 'restacked', 'map',
            'switch-workspace', 'showing', 'hidden', 'updated',
        ])
            emitter.emit(signal, 'shadow-width');
    }
    shadow.emit('repaint');
    assert.deepEqual(h.calls, []);
});

test('enable after disable allocates fresh state without duplicating callbacks', () => {
    const h = harness();
    h.extension.enable();
    const oldActors = h.extension._actors;
    const oldSignals = h.extension._signals;
    const oldShadowSignals = h.extension._signalsShadow;
    const oldShadow = h.extension._actorShadow;
    h.extension.disable();
    h.extension.enable();
    assert.notEqual(h.extension._actors, oldActors);
    assert.notEqual(h.extension._signals, oldSignals);
    assert.notEqual(h.extension._signalsShadow, oldShadowSignals);
    assert.notEqual(h.extension._actorShadow, oldShadow);
    assert.equal(oldShadow.destroyCount, 1);
    assert.equal(h.extension._signals.length, 11);
    h.calls.length = 0;
    h.settings.emit('changed', 'excluded-apps');
    assert.deepEqual(h.calls, [['reloadSettings'], ['refresh']]);
    h.extension.disable();
    for (const emitter of h.emitters)
        assert.equal(emitter.signals.size, 0);
    assert.ok(h.shadows.every(shadow => shadow.destroyCount === 1));
});
