import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

let currentUser = null;
let lastAuthError = null;

function initializeAuth() {
    getRedirectResult(auth)
        .then((result) => {
            if (result && result.user) {
                console.log("Login via redirect bem-sucedido.");
            }
        })
        .catch((error) => {
            console.error("Erro no redirecionamento de login:", error);
            alert(`Erro no login: ${error.message}`);
        });

    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        let isAdmin = false;

        if (user && !user.isAnonymous) {
            const adminDocRef = doc(db, "admins", user.uid);
            const adminDoc = await getDoc(adminDocRef);
            isAdmin = adminDoc.exists();
        }

        window.dispatchEvent(new CustomEvent("authStateChanged", {
            detail: {
                user: currentUser,
                isAdmin,
                authError: lastAuthError
            }
        }));
    });
}

function login() {
    const provider = new GoogleAuthProvider();
    signInWithRedirect(auth, provider);
}

function logout() {
    signOut(auth);
}

function getCurrentUser() {
    return currentUser;
}

function isAdmin() {
    return false;
}

export {
    initializeAuth,
    login,
    logout,
    getCurrentUser,
    isAdmin
};
