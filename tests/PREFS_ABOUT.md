# Preferences About-window contracts

Run the dependency-free suite from the repository root:

```sh
node --test tests/prefs-about.test.cjs
```

The harness evaluates the real `prefs.js` module body after removing its
single-line GI/resource imports and replacing its default export with a VM
binding. Controlled GObject, ExtensionPreferences and Adw doubles allow
`_showAbout` to run without GTK, a desktop session, network access or credentials.
It checks metadata selection, modal parent identity, attribution links,
presentation ordering, repeated calls, literal metadata and failure propagation.
Other preferences methods are not invoked or claimed by this suite.

To save raw V8 unit coverage:

```sh
NODE_V8_COVERAGE=/tmp/shade-prefs-about-v8 node --test tests/prefs-about.test.cjs
```

Coverage ranges refer to the adapted VM source, not an unchanged-source line
percentage. The baseline `main` revision
`59b0afaf7320f72ef408621dafac19ec0214705b` has no documented/tracked test or
coverage runner; its default Node discovery finds zero tests. No integration or
end-to-end coverage mechanism is documented there, and the repository's Actions
workflows, runs, artifacts and revision checks were empty when inspected on
2026-10-10. End-to-end coverage is unknown, not zero; no compatible raw data is
available to merge. These contracts do not establish real GTK property handling,
dialog rendering, link activation or GNOME integration.
