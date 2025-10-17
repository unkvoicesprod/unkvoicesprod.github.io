import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

let currentUser = null;

/**
 * Inicia o sistema de autenticação, escutando por mudanças de estado.
 * Dispara eventos customizados para que outras partes da aplicação possam reagir.
 */
function initializeAuth() {
    // Lida com o resultado do redirecionamento de login do Google
    getRedirectResult(auth)
        .then((result) => {
            if (result && result.user) {
                // O utilizador acabou de fazer login com sucesso.
                // O onAuthStateChanged tratará da atualização da UI.
                console.log("Login via redirect bem-sucedido.");
            }
        })
        .catch((error) => {
            console.error("Erro no redirecionamento de login:", error);
            alert(`Erro no login: ${error.message}`);
        });

    // Observador principal do estado de autenticação
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        let isAdmin = false;

        if (user) {
            // Verifica se o utilizador é um admin consultando a coleção 'admins'
            const adminDocRef = doc(db, 'admins', user.uid);
            const adminDoc = await getDoc(adminDocRef);
            isAdmin = adminDoc.exists();
        }

        // Dispara um evento global com os detalhes do utilizador
        window.dispatchEvent(new CustomEvent('authStateChanged', {
            detail: {
                user: currentUser,
                isAdmin: isAdmin
            }
        }));
    });
}

/**
 * Inicia o processo de login com o Google.
 */
function login() {
    const provider = new GoogleAuthProvider();
    signInWithRedirect(auth, provider);
}

/**
 * Termina a sessão do utilizador.
 */
function logout() {
    signOut(auth);
}

/**
 * Retorna o utilizador atualmente autenticado.
 * @returns {User|null} O objeto do utilizador do Firebase ou null.
 */
function getCurrentUser() {
    return currentUser;
}

/**
 * Verifica se o utilizador atual é um administrador.
 * @returns {boolean}
 */
function isAdmin() {
    // Esta função agora é um placeholder, pois a verificação real é feita
    // no onAuthStateChanged e propagada por evento.
    // Para uso síncrono, podemos guardar o estado, mas o evento é mais fiável.
    console.warn("A função isAdmin() síncrona pode não ter o estado mais atual. Use o evento 'authStateChanged'.");
    // Para manter alguma compatibilidade, podemos tentar uma verificação rápida,
    // mas não é garantido que o estado de admin já tenha sido carregado.
    // A melhor abordagem é confiar no evento.
    return false;
}


export {
    initializeAuth,
    login,
    logout,
    getCurrentUser,
    isAdmin
};