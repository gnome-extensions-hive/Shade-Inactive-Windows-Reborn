const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const filename = path.join(__dirname, '..', 'prefs.js');
const source = fs.readFileSync(filename, 'utf8')
    .replace(/^import .*;[^\r\n]*$/gm, '')
    .replace('export default class ShadeInactiveWindowsPreferences',
        'globalThis.Preferences = class ShadeInactiveWindowsPreferences');

function harness({metadata = {}, failAt} = {}) {
    const events = [];
    const windows = [];
    const failure = new Error(`About failure: ${failAt}`);
    const context = vm.createContext({
        ExtensionPreferences: class {},
        GObject: {
            registerClass: (_properties, klass) => klass,
            Object: class {},
            ParamSpec: {string: () => ({})},
            ParamFlags: {READWRITE: 1},
        },
        Adw: {
            AboutWindow: class {
                constructor(properties) {
                    events.push('construct');
                    if (failAt === 'construct')
                        throw failure;
                    this.properties = properties;
                    this.links = [];
                    this.presented = false;
                    windows.push(this);
                }

                add_link(label, url) {
                    events.push('link');
                    if (failAt === 'link')
                        throw failure;
                    this.links.push([label, url]);
                }

                present() {
                    events.push('present');
                    if (failAt === 'present')
                        throw failure;
                    this.presented = true;
                }
            },
        },
    });
    vm.runInContext(source, context, {filename});
    const prefs = new context.Preferences();
    prefs.metadata = metadata;
    return {prefs, windows, events, failure};
}

test('uses extension metadata rather than fixed application identity', () => {
    const metadata = {
        name: 'Custom extension',
        'version-name': '1.2.3-review',
        version: 99,
        url: 'https://example.invalid/extension',
    };
    const {prefs, windows} = harness({metadata});
    prefs._showAbout({});
    const properties = windows[0].properties;
    assert.equal(properties.application_name, metadata.name);
    assert.equal(properties.version, metadata['version-name']);
    assert.equal(properties.website, metadata.url);
    assert.equal(properties.issue_url, `${metadata.url}/issues`);
    assert.equal(properties.developer_name, 'Binh Nguyen');
    assert.equal(properties.comments, 'Inspired by Shade Inactive Windows by hepaajan.');
});

test('uses the exact caller window as the modal parent', () => {
    const {prefs, windows} = harness();
    const parent = {name: 'preferences parent'};
    prefs._showAbout(parent);
    assert.strictEqual(windows[0].properties.transient_for, parent);
    assert.equal(windows[0].properties.modal, true);
});

test('adds both project attribution links before presenting once', () => {
    const {prefs, windows, events} = harness();
    prefs._showAbout({});
    assert.deepEqual(windows[0].links, [
        ['Developer website', 'https://www.binhnguyensoft.com'],
        ['Original project', 'https://github.com/hepaajan/shade-inactive-windows'],
    ]);
    assert.deepEqual(events, ['construct', 'link', 'link', 'present']);
    assert.equal(windows[0].presented, true);
});

test('creates an independent dialog with the current metadata on each call', () => {
    const metadata = {name: 'First', 'version-name': '1', url: 'https://example.invalid/first'};
    const {prefs, windows} = harness({metadata});
    const firstParent = {};
    const secondParent = {};
    prefs._showAbout(firstParent);
    prefs.metadata = {name: 'Second', 'version-name': '2', url: 'https://example.invalid/second'};
    prefs._showAbout(secondParent);
    assert.equal(windows.length, 2);
    assert.notStrictEqual(windows[0], windows[1]);
    assert.equal(windows[0].properties.application_name, 'First');
    assert.equal(windows[1].properties.application_name, 'Second');
    assert.equal(windows[1].properties.version, '2');
    assert.equal(windows[1].properties.issue_url, 'https://example.invalid/second/issues');
    assert.strictEqual(windows[0].properties.transient_for, firstParent);
    assert.strictEqual(windows[1].properties.transient_for, secondParent);
    assert.ok(windows.every(window => window.presented));
});

test('passes literal metadata without modifying the caller object', () => {
    const metadata = Object.freeze({
        name: '<b>Literal & name</b>',
        'version-name': 'release candidate',
        url: 'https://example.invalid/project',
    });
    const {prefs, windows} = harness({metadata});
    prefs._showAbout({});
    assert.strictEqual(prefs.metadata, metadata);
    assert.equal(windows[0].properties.application_name, '<b>Literal & name</b>');
    assert.equal(windows[0].properties.version, 'release candidate');
});

test('does not substitute the numeric extension version for version-name', () => {
    const {prefs, windows} = harness({metadata: {name: 'Extension', version: 42}});
    prefs._showAbout({});
    assert.equal(windows[0].properties.version, undefined);
});

for (const failAt of ['construct', 'link', 'present']) {
    test(`propagates ${failAt} failure without reporting presentation success`, () => {
        const {prefs, windows, events, failure} = harness({failAt});
        assert.throws(() => prefs._showAbout({}), error => error === failure);
        if (failAt === 'construct') {
            assert.equal(windows.length, 0);
            assert.deepEqual(events, ['construct']);
        } else {
            assert.equal(windows[0].presented, false);
            assert.deepEqual(events, failAt === 'link'
                ? ['construct', 'link']
                : ['construct', 'link', 'link', 'present']);
        }
    });
}
