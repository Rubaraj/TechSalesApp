/**
 * Training simulator routes.
 *
 *   GET  /personas         trainee list — ACTIVE personas, display fields
 *                          only (the roleplay prompt never leaves the BE)
 *   GET  /personas/admin   full rows incl. prompt (admin)
 *   POST /personas         create (admin)
 *   PATCH /personas/:id    update (admin; personaId immutable)
 *   DELETE /personas/:id   delete (admin)
 *
 * Mutations invalidate the persona cache so the next practice session
 * uses the edited scenario (the Voice Agent is stateless per session).
 */
import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { repos } from '../repositories/registry.js';
import {
  loadPersonas,
  invalidatePersonasCache,
  slugifyPersonaId,
  CURATED_VOICES,
} from '../ai/simulator/personas.js';
import { simulatorEnabled } from '../config/env.js';
import type { SimulatorPersonaRecord } from '../types/index.js';

export const simulatorRouter = Router();

async function isAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const user = await repos.user.findById(userId);
  if (!user) return false;
  return user.accessLevel === 'admin' || user.isSuperAdmin === true;
}

function callerUserId(req: Request): string {
  return String(
    (req.query.userId as string | undefined) ??
      (req.body as { userId?: string } | undefined)?.userId ??
      '',
  );
}

interface PersonaBody {
  label?: string;
  description?: string;
  voice?: string;
  greeting?: string;
  prompt?: string;
  sortOrder?: unknown;
  isActive?: boolean;
}

function cleanPersonaBody(
  body: PersonaBody,
  requireCore: boolean,
): { error: string } | { value: Partial<SimulatorPersonaRecord> } {
  const value: Partial<SimulatorPersonaRecord> = {};
  if (body.label !== undefined) value.label = String(body.label).trim();
  if (body.description !== undefined) value.description = String(body.description).trim();
  if (body.greeting !== undefined) value.greeting = String(body.greeting).trim();
  if (body.prompt !== undefined) value.prompt = String(body.prompt).trim();
  if (body.voice !== undefined) {
    const voice = String(body.voice).trim();
    if (!voice.startsWith('aura-')) {
      return { error: '`voice` must be a Deepgram Aura model id (aura-…)' };
    }
    value.voice = voice;
  }
  if (body.sortOrder !== undefined) {
    const s = Number(body.sortOrder);
    if (!Number.isInteger(s) || s < 0 || s > 999) {
      return { error: '`sortOrder` must be an integer between 0 and 999' };
    }
    value.sortOrder = s;
  }
  if (body.isActive !== undefined) value.isActive = body.isActive === true;

  if (requireCore) {
    if (!value.label) return { error: '`label` is required' };
    if (!value.description) return { error: '`description` is required' };
    if (!value.greeting) return { error: '`greeting` is required' };
    if (!value.prompt) return { error: '`prompt` is required' };
    if (!value.voice) value.voice = CURATED_VOICES[0].id;
  }
  return { value };
}

// --- Trainee list (public within the app; no prompts) -----------------------

simulatorRouter.get(
  '/personas',
  asyncHandler(async (_req: Request, res: Response) => {
    const personas = await loadPersonas();
    res.json({
      success: true,
      data: {
        enabled: simulatorEnabled(),
        personas: personas.map(({ personaId, label, description }) => ({
          id: personaId,
          label,
          description,
        })),
      },
    });
  }),
);

// --- Admin CRUD -------------------------------------------------------------

simulatorRouter.get(
  '/personas/admin',
  asyncHandler(async (req: Request, res: Response) => {
    if (!(await isAdmin(callerUserId(req)))) {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }
    await loadPersonas(); // warm/seed
    const personas = await repos.simulatorPersona.findAll(false);
    personas.sort((a, b) => a.sortOrder - b.sortOrder);
    res.json({
      success: true,
      data: { total: personas.length, personas, voices: CURATED_VOICES },
    });
  }),
);

simulatorRouter.post(
  '/personas',
  asyncHandler(async (req: Request, res: Response) => {
    if (!(await isAdmin(callerUserId(req)))) {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }
    const cleaned = cleanPersonaBody((req.body ?? {}) as PersonaBody, true);
    if ('error' in cleaned) {
      res.status(400).json({ success: false, error: cleaned.error });
      return;
    }
    const existing = await repos.simulatorPersona.findAll(false);
    const personaId = slugifyPersonaId(
      cleaned.value.label!,
      existing.map((p) => p.personaId),
    );
    const persona = await repos.simulatorPersona.create({
      personaId,
      label: cleaned.value.label!,
      description: cleaned.value.description!,
      voice: cleaned.value.voice!,
      greeting: cleaned.value.greeting!,
      prompt: cleaned.value.prompt!,
      sortOrder: cleaned.value.sortOrder ?? existing.length + 1,
      isActive: cleaned.value.isActive ?? true,
    });
    invalidatePersonasCache();
    res.status(201).json({ success: true, data: persona });
  }),
);

simulatorRouter.patch(
  '/personas/:id',
  asyncHandler(async (req: Request, res: Response) => {
    if (!(await isAdmin(callerUserId(req)))) {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }
    const cleaned = cleanPersonaBody((req.body ?? {}) as PersonaBody, false);
    if ('error' in cleaned) {
      res.status(400).json({ success: false, error: cleaned.error });
      return;
    }
    // personaId is immutable — never present in the cleaned value.
    const updated = await repos.simulatorPersona.update(String(req.params.id), cleaned.value);
    if (!updated) {
      res.status(404).json({ success: false, error: 'Persona not found' });
      return;
    }
    invalidatePersonasCache();
    res.json({ success: true, data: updated });
  }),
);

simulatorRouter.delete(
  '/personas/:id',
  asyncHandler(async (req: Request, res: Response) => {
    if (!(await isAdmin(callerUserId(req)))) {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }
    const deleted = await repos.simulatorPersona.delete(String(req.params.id));
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Persona not found' });
      return;
    }
    invalidatePersonasCache();
    res.json({ success: true, data: { deleted: true } });
  }),
);
