'use client';

import React, { useState, useEffect } from 'react';
import { X, Check, Home, Tag, Save } from 'lucide-react';
import { DashboardProperty } from './DashboardPropertyCard';
import {
  PROPERTY_TYPE_DEFS,
  isCommercialHouseType,
  normalizeHouseType,
  usesFloorHouseType,
} from '@/lib/propertyTypes';

interface EditPropertyModalProps {
  isOpen: boolean;
  property: DashboardProperty | null;
  onClose: () => void;
  onSave: (updatedProperty: DashboardProperty) => void;
}

export default function EditPropertyModal({
  isOpen,
  property,
  onClose,
  onSave,
}: EditPropertyModalProps) {
  const [formData, setFormData] = useState<Partial<DashboardProperty>>({});

  useEffect(() => {
    if (property) {
      setFormData({
        ...property,
        houseType: normalizeHouseType(property.houseType) || 'maison',
        price: property.type === 'rent' ? property.rent || property.price : property.price || property.rent,
      });
    }
  }, [property]);

  if (!isOpen || !property) return null;

  const selectedHouseType =
    normalizeHouseType(formData.houseType) || normalizeHouseType(property.houseType) || 'maison';
  const isCommercial = isCommercialHouseType(selectedHouseType);
  const usesFloor = usesFloorHouseType(selectedHouseType);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isRent = formData.type === 'rent';
    const numPrice = Number(formData.price) || 0;

    const updated: DashboardProperty = {
      ...property,
      ...formData,
      title: formData.title || property.title,
      description: formData.description || property.description,
      type: formData.type || property.type,
      houseType: selectedHouseType,
      floor: usesFloor ? (formData.floor?.trim() || null) : null,
      area: Number(formData.area ?? property.area ?? 0),
      rooms: isCommercial ? 0 : Number(formData.rooms ?? property.rooms ?? 0),
      bathrooms: isCommercial ? 0 : Number(formData.bathrooms ?? property.bathrooms ?? 0),
      toilet: Number(formData.toilet ?? property.toilet ?? 0),
      price: isRent ? property.price : numPrice,
      rent: isRent ? numPrice : property.rent,
      status: formData.status || property.status,
    };

    onSave(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Modifier l'annonce
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Mettez à jour les informations de votre bien
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-10 h-10 rounded-full bg-zinc-100/90 dark:bg-zinc-800/90 border border-zinc-300/90 dark:border-zinc-600/80 shadow-xs text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 flex items-center justify-center transition-all active:scale-90 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5 stroke-[2.25]" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Titre */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
              Titre de l'annonce *
            </label>
            <input
              type="text"
              required
              value={formData.title || ''}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
            />
          </div>

          {/* Type d'opération & Statut */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
                Type d'offre
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'sale' })}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                    formData.type === 'sale'
                      ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 border-zinc-950 dark:border-white shadow-xs'
                      : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  Vente
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'rent' })}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                    formData.type === 'rent'
                      ? 'bg-brand-green text-white border-brand-green shadow-xs'
                      : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                  }`}
                >
                  <Home className="w-3.5 h-3.5" />
                  Location
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
                Statut
              </label>
              <select
                value={formData.status || 'active'}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
              >
                <option value="active">En ligne</option>
                <option value="pending">En validation</option>
                <option value="draft">En pause (Brouillon)</option>
              </select>
            </div>
          </div>

          {/* Catégorie du bien */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
              Catégorie
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {PROPERTY_TYPE_DEFS.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, houseType: def.id })}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer truncate ${
                    selectedHouseType === def.id
                      ? 'bg-brand-green text-white border-brand-green shadow-xs'
                      : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                  }`}
                >
                  {def.shortLabel}
                </button>
              ))}
            </div>
          </div>

          {usesFloor && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
                {selectedHouseType === 'appartement' ? 'Étage' : 'Niveau / Emplacement (opt.)'}
              </label>
              <input
                type="text"
                value={formData.floor ?? ''}
                onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                placeholder={isCommercial ? 'Ex: RDC, Galerie marchande...' : 'Ex: RDC, 2ème étage...'}
                className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>
          )}

          {/* Prix & Surface */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
                Prix (Ariary) *
              </label>
              <input
                type="number"
                required
                value={formData.price ?? ''}
                onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
                Surface (m²)
              </label>
              <input
                type="number"
                value={formData.area ?? ''}
                onChange={(e) => setFormData({ ...formData, area: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>
          </div>

          {/* Pièces, Douches & WC */}
          {!isCommercial ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
                  Nombre de pièces
                </label>
                <input
                  type="number"
                  min={0}
                  value={formData.rooms ?? ''}
                  onChange={(e) => setFormData({ ...formData, rooms: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
                  Salles de bain
                </label>
                <input
                  type="number"
                  min={0}
                  value={formData.bathrooms ?? ''}
                  onChange={(e) => setFormData({ ...formData, bathrooms: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
                  Toilettes / W.C
                </label>
                <input
                  type="number"
                  min={0}
                  value={formData.toilet ?? ''}
                  onChange={(e) => setFormData({ ...formData, toilet: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
                Toilettes / W.C (optionnel)
              </label>
              <input
                type="number"
                min={0}
                value={formData.toilet ?? ''}
                onChange={(e) => setFormData({ ...formData, toilet: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-full bg-brand-green hover:bg-emerald-600 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

