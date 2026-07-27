/**
 * Single WebSocket upgrade router for the HTTP server.
 *
 * There must be exactly ONE 'upgrade' listener: the old per-module pattern
 * (each module registering its own listener with a catch-all destroy) kills
 * every other module's freshly-upgraded socket one tick after handshake.
 * Routing is by PATHNAME — `req.url` can carry a query string
 * (/ws/simulator?userId=...), so a raw === match would never hit.
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocketServer } from 'ws';
import { env, simulatorEnabled } from '../config/env.js';
import { logger } from '../config/logger.js';
import { createTwilioMediaStreamWss } from './twilioMediaStream.ws.js';
import { createSimulatorWss } from './simulatorSession.ws.js';

export function attachWs(httpServer: import('node:http').Server): void {
  const twilioWss = env.TWILIO_ENABLED ? createTwilioMediaStreamWss() : null;
  const simulatorWss = simulatorEnabled() ? createSimulatorWss() : null;

  const route = (pathname: string): WebSocketServer | null => {
    if (pathname === '/ws/twilio-media') return twilioWss;
    if (pathname === '/ws/simulator') return simulatorWss;
    return null;
  };

  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = new URL(req.url ?? '', 'http://localhost').pathname;
    const wss = route(pathname);
    if (!wss) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  logger.info(
    { twilio: !!twilioWss, simulator: !!simulatorWss },
    'WS upgrade router attached',
  );
}
