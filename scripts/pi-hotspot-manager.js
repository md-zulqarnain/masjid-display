#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');

function normalizeHotspotConfig(config = {}) {
    const hotspot = config && typeof config === 'object' ? config : {};
    const hotspotName = typeof hotspot.hotspotName === 'string' ? hotspot.hotspotName.trim() : '';
    const fallbackHotspotName = typeof hotspot.fallbackHotspotName === 'string' && hotspot.fallbackHotspotName.trim()
        ? hotspot.fallbackHotspotName.trim()
        : 'Masjid-Display';
    const searchSeconds = Number.isFinite(Number(hotspot.searchSeconds)) ? Number(hotspot.searchSeconds) : 60;

    return {
        enabled: hotspot.enabled === true,
        hotspotName,
        fallbackHotspotName,
        searchSeconds: Math.min(300, Math.max(15, searchSeconds)),
        status: ['idle', 'searching', 'connected', 'hotspot', 'error'].includes(hotspot.status) ? hotspot.status : 'idle',
        lastCheckedAt: typeof hotspot.lastCheckedAt === 'string' ? hotspot.lastCheckedAt : null
    };
}

function readSettings() {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) {
            return { wifiHotspot: normalizeHotspotConfig({ enabled: false, hotspotName: '', fallbackHotspotName: 'Masjid-Display', searchSeconds: 60, status: 'idle' }) };
        }

        const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        return { wifiHotspot: normalizeHotspotConfig(data.wifiHotspot || {}) };
    } catch (error) {
        return { wifiHotspot: normalizeHotspotConfig({ enabled: false, hotspotName: '', fallbackHotspotName: 'Masjid-Display', searchSeconds: 60, status: 'error', lastCheckedAt: new Date().toISOString() }) };
    }
}

function writeSettings(partial) {
    const current = readSettings();
    const next = { ...current, ...partial };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
    return next;
}

function runCommand(command) {
    try {
        return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch (error) {
        return ((error && error.stdout) ? String(error.stdout).trim() : '') || ((error && error.stderr) ? String(error.stderr).trim() : '');
    }
}

function listWifiNetworks() {
    const commands = [
        'nmcli -t -f SSID dev wifi list 2>/dev/null',
        'iwlist wlan0 scan 2>/dev/null | grep -E "ESSID:" || true',
        'iw dev wlan0 scan 2>/dev/null | grep -E "SSID:" || true'
    ];

    const names = new Set();

    for (const command of commands) {
        const output = runCommand(command);
        if (!output) continue;

        const matches = output
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                const match = line.match(/ESSID:"([^"]+)"/i) || line.match(/SSID:([^\s]+)/i) || line.match(/^(.*)$/);
                return match ? match[1].replace(/^"|"$/g, '').trim() : '';
            })
            .filter(Boolean);

        matches.forEach(name => names.add(name));
    }

    return Array.from(names);
}

function sleep(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        // wait quietly to avoid extra process churn
    }
}

function connectToTarget(target) {
    const commands = [
        `nmcli device wifi connect "${target}"`,
        `nmcli connection up "${target}" || true`
    ];

    for (const command of commands) {
        const result = runCommand(command);
        if (result && !result.toLowerCase().includes('not found') && !result.toLowerCase().includes('error')) {
            return { ok: true, output: result };
        }
    }

    return { ok: false, output: 'Connection attempt did not succeed' };
}

function startFallbackHotspot(fallbackName) {
    const commands = [
        `create_ap wlan0 wlan0 "${fallbackName}" --no-virt -g 192.168.50.1`,
        `sudo create_ap wlan0 wlan0 "${fallbackName}" --no-virt -g 192.168.50.1`,
        `hostapd -B /etc/hostapd/hostapd.conf || true`
    ];

    for (const command of commands) {
        const result = runCommand(command);
        if (result && !result.toLowerCase().includes('not found') && !result.toLowerCase().includes('command not found')) {
            return { ok: true, output: result };
        }
    }

    return { ok: false, output: 'No supported hotspot tool is available on this Raspberry Pi.' };
}

function main() {
    const settings = readSettings();
    const hotspot = settings.wifiHotspot || normalizeHotspotConfig({ enabled: false, hotspotName: '', fallbackHotspotName: 'Masjid-Display', searchSeconds: 60, status: 'idle' });

    if (!hotspot.enabled || !hotspot.hotspotName) {
        console.log(JSON.stringify({ status: 'disabled', message: 'Wi‑Fi auto-switch is disabled or no hotspot name is configured.' }));
        return;
    }

    const targetName = hotspot.hotspotName.trim();
    const searchSeconds = Math.min(300, Math.max(15, Number(hotspot.searchSeconds) || 60));

    writeSettings({ wifiHotspot: normalizeHotspotConfig({ ...hotspot, status: 'searching', lastCheckedAt: new Date().toISOString() }) });

    const endTime = Date.now() + (searchSeconds * 1000);
    let connected = false;

    while (Date.now() < endTime && !connected) {
        const networks = listWifiNetworks();
        const found = networks.some(name => name.toLowerCase() === targetName.toLowerCase());

        if (found) {
            const connection = connectToTarget(targetName);
            connected = connection.ok;
            writeSettings({ wifiHotspot: normalizeHotspotConfig({ ...hotspot, enabled: true, hotspotName: targetName, fallbackHotspotName: hotspot.fallbackHotspotName || 'Masjid-Display', searchSeconds, status: connected ? 'connected' : 'error', lastCheckedAt: new Date().toISOString() }) });
            console.log(JSON.stringify({ status: connected ? 'connected' : 'error', targetName, networks, message: connected ? 'Connected to target Wi‑Fi' : 'Connection attempt failed' }));
            return;
        }

        sleep(5000);
    }

    const fallbackName = hotspot.fallbackHotspotName || 'Masjid-Display';
    const fallback = startFallbackHotspot(fallbackName);
    writeSettings({ wifiHotspot: normalizeHotspotConfig({ ...hotspot, enabled: true, hotspotName: targetName, fallbackHotspotName: fallbackName, searchSeconds, status: fallback.ok ? 'hotspot' : 'error', lastCheckedAt: new Date().toISOString() }) });

    console.log(JSON.stringify({
        status: fallback.ok ? 'hotspot' : 'error',
        searchedFor: targetName,
        searchSeconds,
        fallbackName,
        output: fallback.output
    }));
}

main();
