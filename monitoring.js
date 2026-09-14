const net = require('net');

function parseMikroTikResponse(lines) {
  if (!Array.isArray(lines)) return {};
  const result = {};
  let current = null;

  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line) continue;
    if (line === '!re') {
      if (current) {
        Object.assign(result, current);
      }
      current = {};
      continue;
    }
    if (line === '!done' || line === '!trap') {
      if (current) {
        Object.assign(result, current);
        current = null;
      }
      continue;
    }
    if (line.startsWith('.id') || line.startsWith('>')) continue;

    const idx = line.indexOf('=');
    if (idx === -1) {
      continue;
    }

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;

    if (current) {
      current[key] = value === 'yes' ? true : value === 'no' ? false : value;
    } else {
      result[key] = value === 'yes' ? true : value === 'no' ? false : value;
    }
  }

  if (current) {
    Object.assign(result, current);
  }

  return result;
}

function normalizeMikroTikStatus(state) {
  if (!state || typeof state !== 'object') {
    return 'unknown';
  }

  if (typeof state.disabled === 'boolean') {
    return state.disabled ? 'down' : 'up';
  }

  if (typeof state.enabled === 'boolean') {
    return state.enabled ? 'up' : 'down';
  }

  const directChecks = [
    state.status,
    state.link,
    state.state,
    state.running,
    state.up
  ];

  for (const value of directChecks) {
    if (value === undefined || value === null || value === '') continue;
    const normalized = String(value).trim().toLowerCase();

    if (['up', 'active', 'enabled', 'online', 'yes', 'true', '1', 'running'].includes(normalized)) {
      return 'up';
    }

    if (['down', 'inactive', 'disabled', 'offline', 'no', 'false', '0', 'stopped'].includes(normalized)) {
      return 'down';
    }
  }

  return 'unknown';
}

async function callMikroTikApi({ host, port, username, password, command, timeout = 5000 }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let buffer = '';
    let sentLogin = false;
    let sentCommand = false;
    let settled = false;

    const cleanup = () => {
      socket.removeAllListeners();
      if (!socket.destroyed) socket.destroy();
    };

    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      if (err) reject(err);
      else resolve(result);
    };

    const timer = setTimeout(() => finish(new Error(`MikroTik API timeout (${host}:${port})`)), timeout);

    socket.on('connect', () => {
      socket.write(`\0${username}\0${password}\0`);
      sentLogin = true;
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      if (!sentCommand && buffer.includes('!done')) {
        sentCommand = true;
        socket.write(`${command}\r\n`);
        return;
      }

      if (sentCommand && buffer.includes('!done')) {
        finish(null, buffer);
      }
    });

    socket.on('error', (error) => finish(error));
    socket.on('close', () => {
      if (!sentCommand && !settled) {
        finish(new Error(`MikroTik API closed before command completed (${host}:${port})`));
      }
    });
  });
}

async function checkMikroTikMonitor(monitor, timeout = 5000) {
  const host = monitor.host || monitor.router || monitor.ip || monitor.url;
  const port = Number(monitor.port || process.env.MIKROTIK_PORT || 8728);
  const username = monitor.username || process.env.MIKROTIK_USERNAME || 'admin';
  const password = monitor.password || process.env.MIKROTIK_PASSWORD || '';

  if (!host) {
    return { ok: false, status: 'unknown', error: 'Monitor MikroTik tidak punya host/router' };
  }

  const interfaceName = (monitor.interface || monitor.name || '').trim();
  const command = interfaceName
    ? `/interface/print .proplist=name,status,disabled` 
    : '/interface/print .proplist=name,status,disabled';

  try {
    const payload = await callMikroTikApi({ host, port, username, password, command, timeout });
    const lines = String(payload).split(/\r?\n/);
    const normalized = parseMikroTikResponse(lines);
    const rawRecords = [];
    let current = {};

    for (const line of lines) {
      const value = String(line || '').trim();
      if (!value) continue;
      if (value === '!re') {
        if (Object.keys(current).length) {
          rawRecords.push(current);
        }
        current = {};
        continue;
      }
      if (value === '!done' || value === '!trap') {
        if (Object.keys(current).length) {
          rawRecords.push(current);
        }
        break;
      }
      if (value.startsWith('.id') || value.startsWith('>')) continue;
      const idx = value.indexOf('=');
      if (idx === -1) continue;
      const key = value.slice(0, idx).trim();
      const entry = value.slice(idx + 1).trim();
      current[key] = entry === 'yes' ? true : entry === 'no' ? false : entry;
    }

    if (Object.keys(current).length) {
      rawRecords.push(current);
    }

    const records = rawRecords.length ? rawRecords : [normalized];
    const selected = interfaceName
      ? records.find((r) => String(r.name || '').toLowerCase() === interfaceName.toLowerCase()) || records[0]
      : records[0];

    const status = normalizeMikroTikStatus(selected || normalized);
    const ok = status === 'up';

    return {
      ok,
      status,
      name: selected && selected.name ? String(selected.name) : interfaceName || 'MikroTik',
      raw: payload
    };
  } catch (error) {
    return {
      ok: false,
      status: 'down',
      error: error.message
    };
  }
}

module.exports = {
  parseMikroTikResponse,
  normalizeMikroTikStatus,
  callMikroTikApi,
  checkMikroTikMonitor
};
