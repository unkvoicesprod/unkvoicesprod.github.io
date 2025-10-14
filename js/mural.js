import { db, auth } from "./firebase-init.js";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

// IMPORTANTE: Cole o seu UID de usuário do Firebase aqui para ter permissões de administrador.
const ADMIN_UID = "COLE_O_SEU_UID_CORRETO_AQUI";

function startMuralScript() {
    const form = document.getElementById('mural-form');
    const postsContainer = document.getElementById('mural-posts-container');
    const authStatusContainer = document.getElementById('mural-auth-status');

    if (!form || !postsContainer || !authStatusContainer) {
        // Se os elementos não existem, não faz nada.
        // Isso pode acontecer se o mural.html ainda não foi carregado.
        return;
    }

    let currentUser = null;
    let unsubscribeFromPosts = null; // Para guardar a função de unsubscribe do onSnapshot

    // --- Gerir Autenticação ---
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        updateAuthUI();
        // Re-escuta as mensagens para adicionar/remover botões de apagar
        listenForPosts();
    });

    const muralCollection = collection(db, 'mural_mensagens');

    // --- Lidar com a submissão do formulário ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nomeInput = document.getElementById('mural-nome');
        const mensagemInput = document.getElementById('mural-mensagem');
        const submitButton = form.querySelector('button[type="submit"]');

        const nome = nomeInput.value.trim();
        const mensagem = mensagemInput.value.trim();

        if (nome === '' || mensagem === '') {
            alert('Por favor, preencha o seu nome e a mensagem.');
            return;
        }

        // Desativa o botão para evitar submissões múltiplas
        submitButton.disabled = true;
        submitButton.textContent = 'A enviar...';

        try {
            // Adiciona o documento ao Firestore
            await addDoc(muralCollection, {
                nome: nome,
                mensagem: mensagem,
                createdAt: serverTimestamp() // Usa o timestamp do servidor
            });

            // Limpa o formulário
            form.reset();

        } catch (error) {
            console.error("Erro ao adicionar mensagem: ", error);
            alert('Ocorreu um erro ao enviar a sua mensagem. Tente novamente.');
        } finally {
            // Reativa o botão
            submitButton.disabled = false;
            submitButton.textContent = 'Submeter Mensagem';
        }
    });

    function listenForPosts() {
        // Se já houver um listener ativo, cancela-o antes de criar um novo
        if (unsubscribeFromPosts) {
            unsubscribeFromPosts();
        }

        const q = query(muralCollection, orderBy('createdAt', 'desc'));
        // Guarda a função de unsubscribe para poder ser chamada mais tarde
        unsubscribeFromPosts = onSnapshot(q, (querySnapshot) => {
            renderPosts(querySnapshot);
        });
    }

    function renderPosts(querySnapshot) {
        postsContainer.innerHTML = ''; // Limpa o container
        const isAdmin = currentUser && currentUser.uid === ADMIN_UID;

        if (querySnapshot.empty) {
            postsContainer.innerHTML = '<p class="mural-empty">Ainda ninguém deixou uma mensagem. Sê o primeiro!</p>';
            return;
        }

        querySnapshot.forEach((document) => {
            const post = document.data();
            const postElement = document.createElement('div');
            postElement.className = 'mural-post';
            postElement.dataset.id = document.id; // Guarda o ID do documento

            const dataFormatada = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString('pt-PT') : 'agora mesmo';

            let adminControlsHTML = '';
            if (isAdmin) {
                adminControlsHTML = `<button class="mural-delete-btn" title="Apagar mensagem">×</button>`;
            }

            postElement.innerHTML = `
                ${adminControlsHTML}
                <p class="mural-post-content">${escapeHTML(post.mensagem)}</p>
                <div class="mural-post-footer">
                    <span class="mural-post-author"><i class="fa-solid fa-user-pen"></i> ${escapeHTML(post.nome)}</span>
                    <span class="mural-post-date"><i class="fa-regular fa-calendar-days"></i> ${dataFormatada}</span>
                </div>
            `;
            postsContainer.appendChild(postElement);
        });

        // Adiciona os event listeners aos botões de apagar
        if (isAdmin) {
            postsContainer.querySelectorAll('.mural-delete-btn').forEach(button => {
                button.addEventListener('click', handleDeleteClick);
            });
        }
    }

    async function handleDeleteClick(event) {
        const postElement = event.target.closest('.mural-post');
        const postId = postElement.dataset.id;

        if (confirm('Tem a certeza que quer apagar esta mensagem permanentemente?')) {
            try {
                await deleteDoc(doc(db, 'mural_mensagens', postId));
                // O onSnapshot irá atualizar a UI automaticamente.
            } catch (error) {
                console.error("Erro ao apagar mensagem:", error);
                alert('Não foi possível apagar a mensagem.');
            }
        }
    }

    function updateAuthUI() {
        if (currentUser) {
            const isAdmin = currentUser.uid === ADMIN_UID;
            authStatusContainer.innerHTML = `
                <p>Login como: ${currentUser.displayName} ${isAdmin ? '(Admin)' : ''}</p>
                <button id="mural-logout-btn" class="btn-secondary"><i class="fa-solid fa-right-from-bracket"></i> Logout</button>
            `;
            document.getElementById('mural-logout-btn').addEventListener('click', () => signOut(auth));
        } else {
            authStatusContainer.innerHTML = `
                <p><i class="fa-solid fa-lock"></i> Área de Moderação</p>
                <button id="mural-login-btn" class="btn"><i class="fa-brands fa-google"></i> Login</button>
            `;
            document.getElementById('mural-login-btn').addEventListener('click', () => {
                const provider = new GoogleAuthProvider();
                signInWithPopup(auth, provider).catch(error => {
                    console.error("Erro no login com Google:", error);
                });
            });
        }
    }
}

// Função simples para evitar XSS
function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// O script do mural só deve correr depois dos componentes HTML serem carregados
document.addEventListener('componentsLoaded', startMuralScript, { once: true });