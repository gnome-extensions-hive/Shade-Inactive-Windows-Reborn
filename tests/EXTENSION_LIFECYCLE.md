# Extension lifecycle tests

Run the dependency-free offline suite with Node.js 18 or newer:

```sh
node --test tests/extension-lifecycle.test.cjs
```

The suite evaluates the actual `extension.js` body in a VM after replacing its
GI/resource imports and default-export syntax. Controlled GNOME signal, settings,
drawing-area and constraint doubles exercise `enable`, `disable`, `_connect` and
`_initShadow`. Assertions cover initialization order, signal ownership, focus/map
callbacks, settings routing, repaint registration, teardown order, cleared
references, and repeated enable/disable cycles.

Shading, exclusion, shadow geometry and drawing methods are replaced with call
recorders: this suite checks their lifecycle wiring, not their implementations.
It does not validate real GJS loading, compositor signals, pixels, GSettings,
or GNOME integration/end-to-end behavior.

To retain raw V8 function/range unit coverage outside the repository:

```sh
NODE_V8_COVERAGE=/tmp/shade-lifecycle-coverage \
    node --test tests/extension-lifecycle.test.cjs
```

The adapted module appears under the absolute `extension.js` filename in the raw
JSON. Import removal changes offsets; these data are not an unchanged-source
line-coverage percentage. No integration/E2E coverage mechanism is documented
in the base repository. Such coverage remains unknown; do not infer its absence
from this offline suite or combine incompatible revisions/offsets.
