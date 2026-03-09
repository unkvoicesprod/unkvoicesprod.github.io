import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { initializeAuth } from "./auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAGgvGXVg6Jmql8CugFx-WJblR-arce-y4",
    authDomain: "unkvoicesprod.firebaseapp.com",
    projectId: "unkvoicesprod",
    storageBucket: "unkvoicesprod.appspot.com",
    messagingSenderId: "745742457945",
    appId: "1:745742457945:web:05bf2241d1d6676f26a548"
};

let app, db, auth;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);

    console.log("Firebase inicializado com sucesso!");

    initializeAuth();
    console.log("- Project ID:", app.options.projectId);
} catch (error) {
    console.error("Erro ao inicializar o Firebase:", error);
}

export { app, db, auth };
