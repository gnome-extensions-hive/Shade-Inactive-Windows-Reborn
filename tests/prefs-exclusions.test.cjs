const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {test} = require('node:test');
const vm = require('node:vm');

const source = readFileSync(new URL('../prefs.js', `file://${__filename}`), 'utf8')
    .replace(/^import [^\n]*$/gm, '')
    .replace('export default class', 'class');

class Widget {
    constructor(properties) {
        Object.assign(this, properties);
        this.prefixes = [];
        this.suffixes = [];
        this.signals = new Map();
    }

    add_prefix(widget) {
        this.prefixes.push(widget);
    }

    add_suffix(widget) {
        this.suffixes.push(widget);
    }

    connect(signal, callback) {
        this.signals.set(signal, callback);
    }
}

function appInfo(id, name, {visible = true, displayName = name, icon = null} = {}) {
    return {
        get_id: () => id,
        get_name: () => name,
        get_display_name: () => displayName,
        get_icon: () => icon,
        should_show: () => visible,
    };
}

function fixture({values = [], apps = [], desktopApps = new Map()} = {}) {
    const writes = [];
    const lookups = [];
    let stored = [...values];
    const context = vm.createContext({
        ExtensionPreferences: class {
            gettext(text) {
                return text;
            }
        },
        GObject: {
            registerClass: (_metadata, klass) => klass,
            ParamSpec: {string: () => ({})},
            ParamFlags: {READWRITE: 1},
            Object: class {
                constructor(...args) {
                    this._init(...args);
                }

                _init(properties) {
                    Object.assign(this, properties);
                }
            },
        },
        Gio: {
            AppInfo: {get_all: () => apps},
            DesktopAppInfo: {
                new: identifier => {
                    lookups.push(identifier);
                    return desktopApps.get(identifier) ?? null;
                },
            },
            ThemedIcon: class {
                constructor(properties) {
                    Object.assign(this, properties);
                }
            },
        },
        Adw: {ActionRow: Widget},
        Gtk: {Button: Widget, Image: Widget, Align: {CENTER: 0}},
    });
    const Preferences = vm.runInContext(
        `${source}\nShadeInactiveWindowsPreferences;`, context, {filename: 'prefs.js'});
    const prefs = new Preferences();
    prefs._settings = {
        get_strv(key) {
            assert.equal(key, 'excluded-apps');
            return [...stored];
        },
        set_strv(key, value) {
            assert.equal(key, 'excluded-apps');
            stored = [...value];
            writes.push([...value]);
        },
    };
    prefs._installedApps = [];
    prefs._renderedExcludedApps = [];
    prefs._excludedGroup = {
        rows: [],
        add(row) {
            this.rows.push(row);
        },
        remove(row) {
            assert.ok(this.rows.includes(row), 'remove only a previously rendered row');
            this.rows.splice(this.rows.indexOf(row), 1);
        },
    };
    return {prefs, writes, lookups};
}

test('reads trimmed nonempty exclusions, preserving first spelling and order', () => {
    const {prefs, writes} = fixture({
        values: ['  Firefox.desktop ', '', ' ', 'FIREFOX.DESKTOP', 'Wine', 'wine', 'mpv'],
    });
    assert.deepEqual(Array.from(prefs._getExcludedIdentifiers()),
        ['Firefox.desktop', 'Wine', 'mpv']);
    assert.deepEqual(writes, [], 'reading must not rewrite settings');
});

test('an empty exclusion list stays empty', () => {
    const {prefs} = fixture();
    assert.deepEqual(Array.from(prefs._getExcludedIdentifiers()), []);
});

test('adding an identifier trims it and persists the normalized sorted list', () => {
    const {prefs, writes} = fixture({values: [' z.desktop ', 'A.desktop', 'a.desktop']});
    prefs._addExcludedIdentifier('  M.desktop  ');
    const expected = ['z.desktop', 'A.desktop', 'M.desktop'].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(writes, [expected]);
});

for (const value of ['', ' \t ', 'FIREFOX.DESKTOP', ' firefox.desktop ']) {
    test(`adding blank or duplicate identifier ${JSON.stringify(value)} does not write`, () => {
        const {prefs, writes} = fixture({values: ['Firefox.desktop']});
        prefs._addExcludedIdentifier(value);
        assert.deepEqual(writes, []);
    });
}

test('removing an identifier matches case-insensitively without removing other apps', () => {
    const {prefs, writes} = fixture({
        values: [' Firefox.desktop ', 'FIREFOX.DESKTOP', 'Firefox-beta.desktop', 'mpv'],
    });
    prefs._removeExcludedIdentifier('firefox.DESKTOP');
    assert.deepEqual(writes, [['Firefox-beta.desktop', 'mpv']]);
});

test('removing the final identifier persists an empty list', () => {
    const {prefs, writes} = fixture({values: ['Wine']});
    prefs._removeExcludedIdentifier('WINE');
    assert.deepEqual(writes, [[]]);
});

test('removing a missing identifier retains the normalized current list', () => {
    const {prefs, writes} = fixture({values: [' mpv ', 'MPV', 'Wine']});
    prefs._removeExcludedIdentifier('absent');
    assert.deepEqual(writes, [['mpv', 'Wine']]);
});

test('installed applications exclude hidden, missing-ID and duplicate entries and sort by name', () => {
    const icon = {name: 'player'};
    const {prefs} = fixture({apps: [
        appInfo('z.desktop', 'Zulu'),
        appInfo('hidden.desktop', 'Hidden', {visible: false}),
        appInfo(null, 'No ID'),
        appInfo('a.desktop', 'Fallback', {displayName: 'Alpha', icon}),
        appInfo('a.desktop', 'Duplicate'),
        appInfo('b.desktop', 'Beta', {displayName: ''}),
    ]});
    const result = Array.from(prefs._getInstalledApps());
    assert.deepEqual(result.map(app => [app.id, app.name]), [
        ['a.desktop', 'Alpha'], ['b.desktop', 'Beta'], ['z.desktop', 'Zulu'],
    ]);
    assert.equal(result[0].icon, icon);
});

test('a hidden duplicate does not prevent a later visible application from being listed', () => {
    const {prefs} = fixture({apps: [
        appInfo('app.desktop', 'Hidden', {visible: false}),
        appInfo('app.desktop', 'Visible'),
    ]});
    assert.deepEqual(Array.from(prefs._getInstalledApps(), app => app.name), ['Visible']);
});

test('app details prefer a case-insensitive installed match without a desktop lookup', () => {
    const {prefs, lookups} = fixture();
    const installed = {id: 'Firefox.desktop', name: 'Firefox', icon: {}};
    prefs._installedApps = [installed];
    assert.equal(prefs._getAppDetails('FIREFOX.DESKTOP'), installed);
    assert.deepEqual(lookups, []);
});

test('app details resolve a desktop entry when no installed match exists', () => {
    const icon = {name: 'editor'};
    const {prefs, lookups} = fixture({
        desktopApps: new Map([['editor.desktop', appInfo('editor.desktop', 'Editor', {icon})]]),
    });
    const details = prefs._getAppDetails('editor.desktop');
    assert.deepEqual([details.id, details.name, details.icon], ['editor.desktop', 'Editor', icon]);
    assert.deepEqual(lookups, ['editor.desktop']);
});

for (const [identifier, expected] of [
    ['Unknown.DESKTOP', 'Unknown'],
    ['Wine', 'Wine'],
    ['app.desktop.backup', 'app.desktop.backup'],
]) {
    test(`unknown app ${identifier} uses a literal fallback label and no icon`, () => {
        const {prefs} = fixture();
        const details = prefs._getAppDetails(identifier);
        assert.equal(details.name, expected);
        assert.equal(details.icon, null);
    });
}

test('rendered rows use literal labels, resolved icons and per-row removal callbacks', () => {
    const {prefs, writes} = fixture({values: ['<b>Custom</b>', 'Editor.desktop']});
    const icon = {name: 'editor'};
    prefs._installedApps = [{id: 'Editor.desktop', name: 'Editor', icon}];
    prefs._renderExcludedRows();
    const rows = prefs._excludedGroup.rows;
    assert.deepEqual(rows.map(row => [row.title, row.use_markup]),
        [['<b>Custom</b>', false], ['Editor', false]]);
    assert.equal(rows[0].prefixes[0].gicon.name, 'application-x-executable');
    assert.equal(rows[1].prefixes[0].gicon, icon);
    for (const row of rows)
        assert.equal(row.activatable_widget, row.suffixes[0]);
    rows[1].suffixes[0].signals.get('clicked')();
    assert.deepEqual(writes, [['<b>Custom</b>']]);
    rows[0].suffixes[0].signals.get('clicked')();
    assert.deepEqual(writes, [['<b>Custom</b>'], []]);
});

test('rerendering removes old rows and reflects current settings without accumulating rows', () => {
    const {prefs} = fixture({values: ['Old.desktop', 'Other']});
    prefs._renderExcludedRows();
    const oldRows = [...prefs._renderedExcludedApps];
    prefs._settings.set_strv('excluded-apps', ['New.desktop']);
    prefs._renderExcludedRows();
    assert.equal(prefs._excludedGroup.rows.length, 1);
    assert.equal(prefs._excludedGroup.rows[0].title, 'New');
    assert.equal(prefs._renderedExcludedApps[0], prefs._excludedGroup.rows[0]);
    for (const row of oldRows)
        assert.ok(!prefs._excludedGroup.rows.includes(row));
    prefs._settings.set_strv('excluded-apps', []);
    prefs._renderExcludedRows();
    assert.equal(prefs._excludedGroup.rows.length, 0);
    assert.equal(prefs._renderedExcludedApps.length, 0);
});
