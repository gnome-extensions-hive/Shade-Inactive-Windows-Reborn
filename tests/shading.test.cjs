const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const extensionPath = path.join(__dirname, '..', 'extension.js');
const source = fs.readFileSync(extensionPath, 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace('export default class ', 'class ');

function harness() {
    class BrightnessEffect {
        constructor(properties) {
            Object.assign(this, properties);
        }

        set_brightness(value) {
            this.brightness = value;
        }
    }

    const WindowType = {NORMAL: 0, DIALOG: 1, MODAL_DIALOG: 2, DESKTOP: 3};
    const shellGlobal = {
        display: {focus_window: null},
        get_window_actors: () => [],
    };
    const context = vm.createContext({
        Clutter: {
            BrightnessContrastEffect: BrightnessEffect,
            AnimationMode: {EASE_OUT_QUAD: 'ease-out-quad'},
            Color: {},
        },
        Meta: {WindowType},
        GObject: {
            registerClass: (_properties, klass) => klass,
            ParamSpec: {double: () => ({})},
            ParamFlags: {READWRITE: 1},
        },
        Extension: class {},
        Cogl: {},
        global: shellGlobal,
    });
    // Evaluate the real module body; only GNOME import/export syntax is adapted.
    vm.runInContext(`${source}\nglobalThis.TestExtension = ShadeInactiveWindowsExtension;`,
        context, {filename: extensionPath});
    const extension = new context.TestExtension();
    extension._actors = new Map();
    extension._focusedActor = null;
    extension._excludedApps = new Set();
    extension._shade = -0.4;
    extension._duration = 150;
    extension._windowTracker = {get_window_app: window => window.app ?? null};
    return {extension, shellGlobal, WindowType};
}

function makeWindow(type = 0, identifiers = {}) {
    return {
        get_window_type: () => type,
        get_wm_class: () => identifiers.wmClass ?? null,
        get_wm_class_instance: () => identifiers.instance ?? null,
        app: identifiers.appId ? {get_id: () => identifiers.appId} : null,
    };
}

function makeActor(window) {
    let nextId = 1;
    const signals = new Map();
    return {
        effects: new Map(),
        animations: [],
        disconnected: [],
        removedTransitions: [],
        removedEffects: [],
        get_meta_window: () => window,
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
        add_effect_with_name(name, effect) {
            assert.ok(!this.effects.has(name), 'duplicate effect');
            this.effects.set(name, effect);
        },
        ease_property(property, target, options) {
            this.animations.push({property, target, options});
        },
        remove_transition(property) {
            this.removedTransitions.push(property);
        },
        remove_effect(effect) {
            const entry = [...this.effects].find(([, value]) => value === effect);
            assert.ok(entry, 'effect not attached');
            this.effects.delete(entry[0]);
            this.removedEffects.push(effect);
        },
    };
}

test('settings normalize, deduplicate, and discard empty exclusions', () => {
    const {extension} = harness();
    extension._settings = {
        get_int: key => ({'shade-level': 65, 'fade-duration': 250})[key],
        get_strv: () => [' Example.DESKTOP ', '', '  ', 'example.desktop', 'OTHER'],
    };
    extension._reloadSettings();
    assert.equal(extension._shade, -0.65);
    assert.equal(extension._duration, 250);
    assert.deepEqual([...extension._excludedApps], ['example.desktop', 'other']);
});

for (const name of ['NORMAL', 'DIALOG', 'MODAL_DIALOG']) {
    test(`shading accepts ${name} windows`, () => {
        const {extension, WindowType} = harness();
        assert.equal(extension._shouldShade(makeWindow(WindowType[name])), true);
    });
}

test('shading rejects missing and unsupported windows', () => {
    const {extension, WindowType} = harness();
    assert.equal(extension._shouldShade(null), false);
    assert.equal(extension._shouldShade(makeWindow(WindowType.DESKTOP)), false);
});

for (const field of ['appId', 'wmClass', 'instance']) {
    test(`exclusions match normalized ${field}`, () => {
        const {extension} = harness();
        extension._excludedApps.add('example');
        assert.equal(extension._shouldShade(makeWindow(0, {[field]: ' ExAmPlE '})), false);
    });
}

test('unmatched or missing identifiers remain eligible with exclusions configured', () => {
    const {extension} = harness();
    extension._excludedApps.add('example');
    assert.equal(extension._shouldShade(makeWindow()), true);
    assert.equal(extension._shouldShade(makeWindow(0, {appId: 'other'})), true);
});

test('inactive actors receive one effect and the configured animation', () => {
    const {extension} = harness();
    const actor = makeActor(makeWindow());
    extension._updateActor(actor);
    const state = extension._actors.get(actor);
    const animation = actor.animations[0];
    assert.equal(actor.effects.size, 1);
    assert.equal(state.effect.enabled, true);
    assert.equal(animation.target, -0.4);
    assert.equal(animation.property, `@effects.${[...actor.effects.keys()][0]}.shade-value`);
    assert.equal(animation.options.duration, 150);
    assert.equal(animation.options.mode, 'ease-out-quad');
    animation.options.onComplete();
    assert.equal(state.effect.enabled, true);
    extension._updateActor(actor);
    assert.equal(actor.animations.length, 1);
    assert.equal(actor.effects.size, 1);
});

test('focus gain and loss reuse the effect and toggle it at animation completion', () => {
    const {extension, shellGlobal} = harness();
    const window = makeWindow();
    const actor = makeActor(window);
    extension._updateActor(actor);
    actor.animations[0].options.onComplete();
    const effect = extension._actors.get(actor).effect;

    shellGlobal.display.focus_window = window;
    extension._updateActor(actor);
    assert.equal(extension._focusedActor, actor);
    assert.equal(actor.animations[1].target, 0);
    assert.equal(effect.enabled, true);
    actor.animations[1].options.onComplete();
    assert.equal(effect.enabled, false);

    shellGlobal.display.focus_window = null;
    extension._updateActor(actor);
    assert.equal(actor.animations[2].target, -0.4);
    actor.animations[2].options.onComplete();
    assert.equal(effect.enabled, true);
    assert.equal(actor.effects.size, 1);
    assert.equal(extension._actors.get(actor).effect, effect);
});

test('zero-duration and zero-shade settings are preserved', () => {
    const {extension} = harness();
    extension._duration = 0;
    extension._shade = 0;
    const actor = makeActor(makeWindow());
    extension._updateActor(actor);
    assert.equal(actor.animations[0].options.duration, 0);
    assert.equal(actor.animations[0].target, 0);
    actor.animations[0].options.onComplete();
    assert.equal(extension._actors.get(actor).effect.enabled, false);
});

test('newly excluded actors lose their transition, effect, and destroy signal', () => {
    const {extension, shellGlobal} = harness();
    const window = makeWindow(0, {appId: 'example'});
    const actor = makeActor(window);
    shellGlobal.display.focus_window = window;
    extension._updateActor(actor);
    const {effect, destroyId} = extension._actors.get(actor);
    extension._excludedApps.add('example');
    extension._updateActor(actor);
    assert.equal(extension._actors.size, 0);
    assert.equal(extension._focusedActor, null);
    assert.deepEqual(actor.disconnected, [destroyId]);
    assert.deepEqual(actor.removedTransitions, [actor.animations[0].property]);
    assert.deepEqual(actor.removedEffects, [effect]);
    assert.equal(effect.enabled, false);
    assert.equal(actor.effects.size, 0);
});

test('destroy cleanup is idempotent, including after the actor map is cleared', () => {
    const {extension} = harness();
    const actor = makeActor(makeWindow());
    extension._updateActor(actor);
    actor.emit('destroy');
    extension._forgetActor(actor);
    extension._actors = null;
    extension._forgetActor(actor);
    assert.equal(actor.effects.size, 0);
    assert.equal(actor.disconnected.length, 1);
    assert.equal(actor.removedTransitions.length, 1);
    assert.equal(actor.removedEffects.length, 1);
});

test('refresh updates all current actors and clears stale focus', () => {
    const {extension, shellGlobal} = harness();
    const focusedWindow = makeWindow();
    const focused = makeActor(focusedWindow);
    const inactive = makeActor(makeWindow());
    const ignored = makeActor(null);
    extension._focusedActor = makeActor(makeWindow());
    shellGlobal.display.focus_window = focusedWindow;
    shellGlobal.get_window_actors = () => [inactive, ignored, focused];
    extension._refresh();
    assert.equal(extension._focusedActor, focused);
    assert.equal(extension._actors.size, 2);
    assert.equal(focused.animations[0].target, 0);
    assert.equal(inactive.animations[0].target, -0.4);
    assert.equal(ignored.effects.size, 0);
    shellGlobal.display.focus_window = null;
    extension._refresh();
    assert.equal(extension._focusedActor, null);
});
