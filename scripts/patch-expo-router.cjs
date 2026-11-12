const fs = require('node:fs');
const path = require('node:path');

const root = process.env.WAVEPLAY_EXPO_ROUTER_ROOT || path.resolve(__dirname, '../node_modules/expo-router');
const containerPath = path.join(root, 'build/fork/NavigationContainer.js');

if (!fs.existsSync(containerPath)) process.exit(0);

let source = fs.readFileSync(containerPath, 'utf8');
const marker = 'waveplay:defer-unhandled-link-until-mount';
if (source.includes(marker)) process.exit(0);

const before = `  const [lastUnhandledLink, setLastUnhandledLink] = react_1.default.useState();
    const { getInitialState } = (0, useLinking_1.useLinking)(refContainer, {
        enabled: isLinkingEnabled,
        prefixes: [],
        ...linking,
    }, setLastUnhandledLink);`;

const after = `  const [lastUnhandledLink, setLastUnhandledLink] = react_1.default.useState();
    // ${marker}: Expo Router may resolve Android's initial URL before this tree commits.
    const linkingMountedRef = react_1.default.useRef(false);
    const pendingUnhandledLinkRef = react_1.default.useRef(null);
    const handleUnhandledLinking = react_1.default.useCallback((path) => {
        if (!linkingMountedRef.current) {
            pendingUnhandledLinkRef.current = { path };
            return;
        }
        setLastUnhandledLink(path);
    }, []);
    react_1.default.useEffect(() => {
        linkingMountedRef.current = true;
        if (pendingUnhandledLinkRef.current !== null) {
            setLastUnhandledLink(pendingUnhandledLinkRef.current.path);
            pendingUnhandledLinkRef.current = null;
        }
        return () => {
            linkingMountedRef.current = false;
        };
    }, []);
    const { getInitialState } = (0, useLinking_1.useLinking)(refContainer, {
        enabled: isLinkingEnabled,
        prefixes: [],
        ...linking,
    }, handleUnhandledLinking);`;

if (!source.includes(before)) {
  throw new Error('expo-router cambió NavigationContainer.js; no se aplicó la corrección de enlace inicial.');
}

source = source.replace(before, after);
fs.writeFileSync(containerPath, source);
