/**
 * Admin › Training Personas — supervisor-editable prospect personas for
 * the practice-call simulator (cloned from the CoachingRulesManagement
 * table+modal pattern). Because the Voice Agent is configured per
 * session, edits take effect on the very next practice session.
 * Roleplay prompts are only visible here — trainees never see them.
 */
import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Drama, Volume2 } from 'lucide-react';
import { Button, Input, Badge, Modal, ConfirmModal } from '../../components/common';
import { Table } from '../../components/common/Table';
import { useAuth } from '../../context/AuthContext';
import {
  listAdminPersonas,
  createPersona,
  updatePersona,
  deletePersona,
  type AdminPersona,
  type VoiceOption,
} from '../../services/personaAdminService';

interface FormState {
  label: string;
  description: string;
  voice: string;
  greeting: string;
  prompt: string;
  sortOrder: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  label: '',
  description: '',
  voice: '',
  greeting: '',
  prompt: '',
  sortOrder: '0',
  isActive: true,
};

const fieldClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500';

export function TrainingPersonasManagement() {
  const { user } = useAuth();
  const userId = user?.userId ?? '';

  const [personas, setPersonas] = useState<AdminPersona[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selected, setSelected] = useState<AdminPersona | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await listAdminPersonas(userId);
      setPersonas(data.personas);
      setVoices(data.voices);
    } catch {
      setPersonas([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpenModal = (persona?: AdminPersona) => {
    if (persona) {
      setSelected(persona);
      setFormData({
        label: persona.label,
        description: persona.description,
        voice: persona.voice,
        greeting: persona.greeting,
        prompt: persona.prompt,
        sortOrder: String(persona.sortOrder ?? 0),
        isActive: persona.isActive,
      });
    } else {
      setSelected(null);
      setFormData({ ...EMPTY_FORM, voice: voices[0]?.id ?? '' });
    }
    setError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelected(null);
    setError('');
  };

  const handleSubmit = async () => {
    if (!formData.label.trim()) return setError('Persona name is required');
    if (!formData.description.trim()) return setError('Description is required');
    if (!formData.greeting.trim()) return setError('Greeting is required');
    if (!formData.prompt.trim()) return setError('Roleplay prompt is required');

    setIsSubmitting(true);
    setError('');
    const payload = {
      label: formData.label.trim(),
      description: formData.description.trim(),
      voice: formData.voice,
      greeting: formData.greeting.trim(),
      prompt: formData.prompt.trim(),
      sortOrder: Number(formData.sortOrder) || 0,
      isActive: formData.isActive,
    };
    try {
      const result = selected
        ? await updatePersona(userId, selected.personaId, payload)
        : await createPersona(userId, payload);
      if (!result.persona) {
        setError(result.error ?? 'Save failed');
        return;
      }
      handleCloseModal();
      load();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (persona: AdminPersona) => {
    const result = await updatePersona(userId, persona.personaId, {
      isActive: !persona.isActive,
    });
    if (result.persona) load();
  };

  const handleConfirmDelete = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    const result = await deletePersona(userId, selected.personaId);
    setIsSubmitting(false);
    if (result.ok) {
      setIsDeleteModalOpen(false);
      setSelected(null);
      load();
    } else {
      setError(result.error ?? 'Failed to delete persona');
    }
  };

  const columns = [
    {
      key: 'label',
      header: 'Persona',
      render: (p: AdminPersona) => (
        <div className="flex items-center gap-2">
          <Drama className="w-4 h-4 text-emerald-600" />
          <div>
            <span className="font-medium">{p.label}</span>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md truncate">
              {p.description}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'voice',
      header: 'Voice',
      render: (p: AdminPersona) => (
        <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
          <Volume2 className="w-3.5 h-3.5" />
          {voices.find((v) => v.id === p.voice)?.label ?? p.voice}
        </span>
      ),
    },
    {
      key: 'sortOrder',
      header: 'Order',
      width: '70px',
      render: (p: AdminPersona) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">{p.sortOrder}</span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (p: AdminPersona) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToggleActive(p);
          }}
          title={p.isActive ? 'Click to disable' : 'Click to enable'}
        >
          <Badge variant={p.isActive ? 'success' : 'danger'}>
            {p.isActive ? 'Active' : 'Disabled'}
          </Badge>
        </button>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '100px',
      render: (p: AdminPersona) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenModal(p);
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Edit"
          >
            <Edit2 className="w-4 h-4 text-blue-600" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelected(p);
              setIsDeleteModalOpen(true);
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        These personas are the AI prospects trainees practice against in the Training
        simulator. Edits apply to the next practice session. Roleplay prompts are only
        visible here — trainees never see them.
      </p>

      <div className="flex justify-end">
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4" />
          Add Persona
        </Button>
      </div>

      <Table
        data={personas}
        columns={columns}
        keyField="personaId"
        isLoading={isLoading}
        emptyMessage="No personas yet — the defaults seed on first load."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selected ? 'Edit Persona' : 'Add Persona'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={handleCloseModal} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} isLoading={isSubmitting}>
              {selected ? 'Update' : 'Create'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Persona name"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="e.g. Angry billing dispute"
              required
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Voice
              </label>
              <select
                value={formData.voice}
                onChange={(e) => setFormData({ ...formData, voice: e.target.value })}
                className={fieldClass}
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label="Card description (shown to trainees)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Frank, 70 — disputes a bill he doesn't recognize, wants it fixed now."
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Opening line (spoken when the session starts)
            </label>
            <textarea
              value={formData.greeting}
              onChange={(e) => setFormData({ ...formData, greeting: e.target.value })}
              rows={2}
              placeholder="Hello? Who is this? Look, I've got a bill here that makes no sense…"
              className={fieldClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Roleplay prompt (the persona's character — trainees never see this)
            </label>
            <textarea
              value={formData.prompt}
              onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
              rows={10}
              placeholder="You are Frank Miller, 70, in zip code 75201… Include concrete scenario facts — name, ZIP, current plan, 2-3 medications, pharmacy — so discovery coaching and entity extraction have material. Describe the personality and how they escalate/de-escalate."
              className={`${fieldClass} font-mono text-sm`}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Tip: include concrete facts (name, ZIP, medications, pharmacy, doctor) so the
              trainee's discovery questions have real answers, and tell the persona to stay
              in character with short spoken replies.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Display order
              </label>
              <input
                type="number"
                min={0}
                max={999}
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                className={fieldClass}
              />
            </div>
            <label className="flex items-center gap-2 pt-6 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
            </label>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelected(null);
          setError('');
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Persona"
        message={`Are you sure you want to delete "${selected?.label}"? Trainees will no longer see it. Existing practice-session records are unaffected. This cannot be undone.`}
        confirmText="Delete"
        isLoading={isSubmitting}
      />
    </div>
  );
}
