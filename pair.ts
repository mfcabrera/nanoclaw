/**
 * Quick pairing script — uses phone number pairing code.
 * Usage: npx tsx pair.ts +491629712902
 */
import fs from 'fs';
import path from 'path';
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';

const phoneNumber = process.argv[2];
if (!phoneNumber) {
  console.error('Usage: npx tsx pair.ts +<phone_number>');
  process.exit(1);
}

const authDir = path.join(process.cwd(), 'store', 'auth');
fs.mkdirSync(authDir, { recursive: true });

const logger = pino({ level: 'silent' });
let pairingCodeShown = false;

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  if (state.creds.registered) {
    console.log('✅ Already registered! Start NanoClaw:');
    console.log('  launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist');
    process.exit(0);
  }

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    browser: Browsers.ubuntu('Chrome'),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log('\n✅ Connected! Auth saved. Now run:');
      console.log('  launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist');
      setTimeout(() => process.exit(0), 1000);
      return;
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        fs.rmSync(authDir, { recursive: true, force: true });
        fs.mkdirSync(authDir, { recursive: true });
        console.log('Logged out, cleared auth. Retrying...');
      }
      setTimeout(() => connect(), 5000);
    }
  });

  if (!pairingCodeShown) {
    await new Promise(r => setTimeout(r, 2500));
    try {
      const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
      pairingCodeShown = true;
      console.log('');
      console.log('========================================');
      console.log(`  PAIRING CODE:  ${code}`);
      console.log('========================================');
      console.log('');
      console.log('On your phone:');
      console.log('  WhatsApp → Linked Devices → Link a Device');
      console.log('  Tap "Link with phone number instead"');
      console.log(`  Enter: ${code}`);
      console.log('');
      console.log('Waiting...');
    } catch {
      // Will retry on reconnect
    }
  }
}

console.log('Connecting...');
connect();
