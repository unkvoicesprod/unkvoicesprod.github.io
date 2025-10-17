import { db, auth } from "./firebase-init.js";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { login, logout, getCurrentUser, isAdmin as isUserAdmin } from './auth.js';

function startMuralScript() {
    const form = document.getElementById('mural-form');
    const postsContainer = document.getElementById('mural-posts-container');
    const authStatusContainer = document.getElementById('mural-auth-status');
    const mensagemInput = document.getElementById('mural-mensagem');
    const charCounter = document.getElementById('mural-char-counter');

    if (!form || !postsContainer || !authStatusContainer) {
        // Se os elementos não existem, não faz nada.
        // Isso pode acontecer se o mural.html ainda não foi carregado.
        return;
    }

    // --- Lógica do Contador de Caracteres ---
    if (mensagemInput && charCounter) {
        const maxLength = mensagemInput.maxLength;
        charCounter.textContent = `0 / ${maxLength}`; // Estado inicial

        mensagemInput.addEventListener('input', () => {
            const currentLength = mensagemInput.value.length;
            charCounter.textContent = `${currentLength} / ${maxLength}`;

            // Adiciona uma classe para feedback visual quando o limite é atingido
            charCounter.classList.toggle('limit-reached', currentLength >= maxLength);
        });
    }

    let currentUser = null;
    let isAdmin = false;
    let unsubscribeFromPosts = null; // Para guardar a função de unsubscribe do onSnapshot

    // Ouve o evento global de mudança de autenticação
    window.addEventListener('authStateChanged', (event) => {
        currentUser = event.detail.user;
        isAdmin = event.detail.isAdmin;
        updateAuthUI();
        // Re-renderiza os posts para atualizar os controlos (editar/apagar)
        listenForPosts();
    });

    const muralCollection = collection(db, 'mural_mensagens');

    // --- Lidar com a submissão do formulário ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nomeInput = document.getElementById('mural-nome'); // mensagemInput já foi declarado acima
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
            const postData = {
                mensagem: mensagem,
                createdAt: serverTimestamp() // Usa o timestamp do servidor
            };

            if (currentUser) {
                postData.uid = currentUser.uid;
                postData.nome = currentUser.displayName;
            } else {
                postData.nome = nome;
            }

            // Adiciona o documento ao Firestore
            await addDoc(muralCollection, postData);

            form.reset();

        } catch (error) {
            console.error("Erro ao adicionar mensagem: ", error);
            alert('Ocorreu um erro ao enviar a sua mensagem. Tente novamente.');
        } finally {
            // Reativa o botão
            submitButton.disabled = false;
            // Se o usuário estiver logado, o nome não deve ser limpo
            if (!currentUser) {
                form.reset(); // Limpa o formulário completamente para visitantes
            } else {
                nomeInput.value = currentUser.displayName;
            }
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

        if (querySnapshot.empty) {
            postsContainer.innerHTML = '<p class="mural-empty">Ainda ninguém deixou uma mensagem. Sê o primeiro!</p>';
            return;
        }

        querySnapshot.forEach((doc, index) => {
            const post = doc.data();
            const postElement = document.createElement('div');
            postElement.className = 'mural-post';
            postElement.dataset.id = doc.id; // Guarda o ID do documento

            const dataFormatada = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString('pt-PT') : 'agora mesmo';

            // Adiciona um atraso escalonado para a animação de fade-in
            postElement.style.animationDelay = `${index * 100}ms`;

            let controlsHTML = '';
            const canEdit = isAdmin || (currentUser && currentUser.uid === post.uid);

            if (isAdmin) {
                controlsHTML += `<button class="mural-delete-btn" title="Apagar mensagem">×</button>`;
            }
            if (canEdit) {
                // Adiciona o botão de editar no rodapé
                controlsHTML += `<button class="mural-edit-btn" title="Editar mensagem"><i class="fa-solid fa-pencil"></i></button>`;
            }

            postElement.innerHTML = `
                <p class="mural-post-content">${escapeHTML(post.mensagem)}</p>
                <div class="mural-post-controls">${controlsHTML}</div>
                <div class="mural-post-footer">
                    <span class="mural-post-author"><i class="fa-solid fa-user-pen"></i> ${escapeHTML(post.nome)}</span>
                    <span class="mural-post-date"><i class="fa-regular fa-calendar-days"></i> ${dataFormatada}</span>
                </div>
            `;
            postsContainer.appendChild(postElement);
        });

        // Usa delegação de eventos para os botões de controlo
        postsContainer.removeEventListener('click', handlePostControlsClick); // Remove listener antigo para evitar duplicação
        postsContainer.addEventListener('click', handlePostControlsClick);
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

    function handlePostControlsClick(event) {
        const target = event.target;
        const deleteBtn = target.closest('.mural-delete-btn');
        const editBtn = target.closest('.mural-edit-btn');
        const saveBtn = target.closest('.mural-save-btn');
        const cancelBtn = target.closest('.mural-cancel-btn');

        if (deleteBtn) handleDeleteClick(event);
        if (editBtn) handleEditClick(event);
        if (saveBtn) handleSaveClick(event);
        if (cancelBtn) handleCancelClick(event);
    }

    function handleEditClick(event) {
        const postElement = event.target.closest('.mural-post');
        const contentElement = postElement.querySelector('.mural-post-content');
        const currentMessage = contentElement.innerText;

        postElement.classList.add('is-editing');
        contentElement.style.display = 'none';

        const editFormHTML = `
            <div class="mural-post-edit-form">
                <textarea class="mural-edit-textarea" rows="4">${currentMessage}</textarea>
                <div class="mural-edit-actions">
                    <button class="mural-cancel-btn btn-secondary">Cancelar</button>
                    <button class="mural-save-btn btn">Guardar</button>
                </div>
            </div>
        `;
        postElement.insertAdjacentHTML('afterbegin', editFormHTML);
        postElement.querySelector('.mural-edit-textarea').focus();
    }

    async function handleSaveClick(event) {
        const postElement = event.target.closest('.mural-post');
        const postId = postElement.dataset.id;
        const textarea = postElement.querySelector('.mural-edit-textarea');
        const newMessage = textarea.value.trim();

        if (newMessage) {
            const postRef = doc(db, 'mural_mensagens', postId);
            await updateDoc(postRef, { mensagem: newMessage });
            // O onSnapshot tratará de re-renderizar a UI.
        }
    }

    function handleCancelClick(event) {
        const postElement = event.target.closest('.mural-post');
        // Simplesmente remove a classe e o onSnapshot irá re-renderizar o post corretamente na próxima atualização.
        // Para uma resposta imediata, poderíamos reverter o DOM, mas deixar o onSnapshot tratar disso é mais simples.
        postElement.classList.remove('is-editing');
        postElement.querySelector('.mural-post-edit-form').remove();
        postElement.querySelector('.mural-post-content').style.display = 'block';
    }

    // --- Delegação de Eventos para Autenticação ---
    // Adiciona um único event listener no container pai para lidar com cliques nos botões de login/logout.
    // Isso é mais eficiente e evita problemas com elementos que são adicionados/removidos dinamicamente.
    authStatusContainer.addEventListener('click', (event) => {
        if (event.target.id === 'mural-login-btn') {
            login();
        }
        if (event.target.id === 'mural-logout-btn') {
            logout();
        }
    });

    function updateAuthUI() {
        if (currentUser) {
            // Preenche e bloqueia o campo de nome se o utilizador estiver logado
            const nomeInput = document.getElementById('mural-nome');
            nomeInput.value = currentUser.displayName;
            nomeInput.readOnly = true;

            authStatusContainer.innerHTML = `
                <p>Login como: ${currentUser.displayName} ${isAdmin ? '(Admin)' : ''}</p>
                <button id="mural-logout-btn" class="btn-secondary"><i class="fa-solid fa-right-from-bracket"></i> Logout</button>
            `;
        } else {
            const nomeInput = document.getElementById('mural-nome');
            nomeInput.readOnly = false; // Garante que o campo é editável
            nomeInput.value = ''; // Limpa o campo de nome ao fazer logout

            authStatusContainer.innerHTML = `
                <p><i class="fa-solid fa-lock"></i> Área de Moderação</p>
                <button id="mural-login-btn" class="btn"><i class="fa-brands fa-google"></i> Login</button>
            `;
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