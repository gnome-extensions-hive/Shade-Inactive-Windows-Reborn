# Offline shadow contract tests

Run with Node.js 18 or newer from the repository root:

```sh
node --test tests/shadow-contracts.test.cjs
```

Save raw V8 unit coverage outside the working tree:

```sh
NODE_V8_COVERAGE=/tmp/shade-shadow-v8 node --test tests/shadow-contracts.test.cjs
```

The runner evaluates the real `extension.js` body with GNOME imports replaced
by explicit doubles and the default export adapted for Node's VM. It exercises
`_focusShadow`, `_syncShadow`, `_readShadowSettings`, `_connectShadow`,
`_disconnectShadow`, `_drawShadow` and `_roundedRectShadow`.

Assertions cover visibility gates, geometry caching and invalidation, stacking,
opacity, focus changes, signal and binding cleanup, color fallback, Cairo
clipping and alpha falloff, bounded layer counts, radius clamping and disposal
on both successful and failed drawing.

Raw coverage refers to the adapted VM source, not an unchanged-source line
percentage. These tests do not validate actual Cairo pixels, GNOME signal
delivery, compositor bindings, full extension enable/disable or integration/E2E
behavior. No integration/E2E coverage source is currently documented on the
base branch; its coverage remains unknown. Merge raw coverage only from the
same source revision and compatible adapters.
