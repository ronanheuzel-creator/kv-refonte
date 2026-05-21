// Helpers manipulation des structures Elementor.
//
// Une page Elementor stocke ses sections dans le meta `_elementor_data`
// (JSON stringifié, arbre d'objets { id, elType, settings, elements }).
//
// Ce module fournit les outils pour parser/modifier cet arbre.

import { randomBytes } from 'node:crypto';

/**
 * Génère un nouvel ID Elementor (8 caractères hex).
 * Utilisé quand on duplique/insère des éléments pour éviter les collisions.
 */
export function newElementorId() {
  return randomBytes(4).toString('hex');
}

/**
 * Régénère récursivement tous les IDs d'un arbre Elementor.
 * À utiliser après import d'un template pour éviter les conflits d'IDs.
 */
export function regenIds(node) {
  if (Array.isArray(node)) {
    return node.map(regenIds);
  }
  if (node && typeof node === 'object' && 'id' in node) {
    return {
      ...node,
      id: newElementorId(),
      elements: Array.isArray(node.elements) ? node.elements.map(regenIds) : node.elements,
    };
  }
  return node;
}

/**
 * Parse le _elementor_data stocké en JSON string sur une page WP.
 * @param {string|object|null} raw
 * @returns {Array} - liste des sections (toujours un tableau)
 */
export function parseElementorData(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

/**
 * Trouve récursivement le premier widget matchant un prédicat.
 * @param {Array|object} tree
 * @param {(node: object) => boolean} predicate
 * @returns {object|null}
 */
export function findWidget(tree, predicate) {
  const stack = Array.isArray(tree) ? [...tree] : [tree];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (predicate(node)) return node;
    if (Array.isArray(node.elements)) {
      stack.push(...node.elements);
    }
  }
  return null;
}

/**
 * Parcours récursif (visiteur). La fonction `visit` peut muter `node`.
 */
export function walk(tree, visit) {
  const arr = Array.isArray(tree) ? tree : [tree];
  for (const node of arr) {
    if (!node) continue;
    visit(node);
    if (Array.isArray(node.elements)) walk(node.elements, visit);
  }
}
