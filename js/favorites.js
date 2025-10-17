import { db, auth } from './firebase-init.js';
import { doc, getDoc, setDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const LOCAL_STORAGE_KEY = 'unkvoices_favorites';

/**
 * Obtém a lista de IDs de favoritos do localStorage.
 * @returns {string[]} Array de IDs de favoritos.
 */
function getLocalFavorites() {
    try {
        const favorites = localStorage.getItem(LOCAL_STORAGE_KEY);
        return favorites ? JSON.parse(favorites) : [];
    } catch (e) {
        console.error("Erro ao ler favoritos do localStorage:", e);
        return [];
    }
}

/**
 * Salva a lista de IDs de favoritos no localStorage.
 * @param {string[]} favorites Array de IDs de favoritos.
 */
function saveLocalFavorites(favorites) {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(favorites));
        // Dispara um evento global para que a UI possa reagir
        window.dispatchEvent(new CustomEvent('favoritesChanged', { detail: { favorites } }));
    } catch (e) {
        console.error("Erro ao salvar favoritos no localStorage:", e);
    }
}

/**
 * Adiciona um item aos favoritos (local e Firebase se logado).
 * @param {string} itemId O ID do item a ser favoritado.
 */
export async function addFavorite(itemId) {
    const localFavorites = getLocalFavorites();
    if (!localFavorites.includes(itemId)) {
        const newFavorites = [...localFavorites, itemId];
        saveLocalFavorites(newFavorites);
    }

    const user = auth.currentUser;
    if (user) {
        const userFavoritesRef = doc(db, 'user_favorites', user.uid);
        await setDoc(userFavoritesRef, { favorites: arrayUnion(itemId) }, { merge: true });
    }
}

/**
 * Remove um item dos favoritos (local e Firebase se logado).
 * @param {string} itemId O ID do item a ser desfavoritado.
 */
export async function removeFavorite(itemId) {
    const localFavorites = getLocalFavorites();
    const newFavorites = localFavorites.filter(id => id !== itemId);
    saveLocalFavorites(newFavorites);

    const user = auth.currentUser;
    if (user) {
        const userFavoritesRef = doc(db, 'user_favorites', user.uid);
        await setDoc(userFavoritesRef, { favorites: arrayRemove(itemId) }, { merge: true });
    }
}

/**
 * Alterna o estado de favorito de um item.
 * @param {string} itemId O ID do item.
 */
export function toggleFavorite(itemId) {
    if (isFavorite(itemId)) {
        removeFavorite(itemId);
    } else {
        addFavorite(itemId);
    }
}

/**
 * Verifica se um item está na lista de favoritos.
 * @param {string} itemId O ID do item.
 * @returns {boolean} True se o item for um favorito.
 */
export function isFavorite(itemId) {
    return getLocalFavorites().includes(itemId);
}

/**
 * Obtém a lista completa de favoritos.
 * @returns {string[]} Array de IDs de favoritos.
 */
export function getFavorites() {
    return getLocalFavorites();
}

/**
 * Sincroniza os favoritos locais com o Firebase ao fazer login.
 * @param {User} user O objeto do usuário do Firebase.
 */
export async function syncFavoritesOnLogin(user) {
    if (!user) return;

    const localFavorites = getLocalFavorites();
    const userFavoritesRef = doc(db, 'user_favorites', user.uid);
    const userDoc = await getDoc(userFavoritesRef);

    let remoteFavorites = [];
    if (userDoc.exists()) {
        remoteFavorites = userDoc.data().favorites || [];
    }

    // Mescla favoritos locais e remotos, sem duplicatas
    const mergedFavorites = [...new Set([...localFavorites, ...remoteFavorites])];

    // Atualiza o localStorage para refletir o estado mesclado
    saveLocalFavorites(mergedFavorites);

    // Atualiza o Firebase com a lista mesclada, se houver diferenças
    if (mergedFavorites.length > remoteFavorites.length) {
        await setDoc(userFavoritesRef, { favorites: mergedFavorites });
    }
}