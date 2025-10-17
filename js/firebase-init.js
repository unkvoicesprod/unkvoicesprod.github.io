// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { initializeAuth } from "./auth.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAGgvGXVg6Jmql8CugFx-WJblR-arce-y4", // Chave de API corrigida
    authDomain: "unkvoicesprod.firebaseapp.com",
    projectId: "unkvoicesprod",
    storageBucket: "unkvoicesprod.appspot.com",
    messagingSenderId: "745742457945",
    appId: "1:745742457945:web:05bf2241d1d6676f26a548"
};

let app, db, auth;

try {
    // Initialize Firebase
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app); // Inicializa a autenticação
    console.log("✅ Firebase inicializado com sucesso!");

    // Inicia o sistema de autenticação para que o login funcione em todo o site
    initializeAuth();
    console.log("   - Project ID:", app.options.projectId);
} catch (error) {
    console.error("❌ Erro ao inicializar o Firebase:", error);
}

// Exporta as instâncias para serem usadas em outros módulos
export { app, db, auth };