# Preferences exclusion tests

Run with Node.js 18 or newer; no package installation or GNOME session is needed:

```sh
node --test tests/prefs-exclusions.test.cjs
```

The tests execute the actual `prefs.js` body in an isolated VM after removing
its imports and default export syntax. Small GObject, Gio, Adw, Gtk and settings
doubles cover exclusion normalization, add/remove persistence, installed-app
filtering, desktop-entry lookup, literal row labels, removal callbacks and
rerender cleanup. Production source is unchanged.

Save raw V8 unit coverage outside the checkout:

```sh
NODE_V8_COVERAGE="$(mktemp -d)" node --test tests/prefs-exclusions.test.cjs
```

V8 output describes the adapted VM source and test harness, not an
unchanged-source line percentage. These tests do not validate GTK rendering,
real GSettings, desktop discovery, a complete preferences window, or GNOME Shell
integration/end-to-end behavior. Integration/E2E coverage is unknown; this unit
output must not be treated as evidence of its absence or merged with data from
a different revision.
