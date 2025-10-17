import { db, auth } from "./firebase-init.js";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, deleteDoc, updateDoc, runTransaction, limit, startAfter, getDocs, where } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

function startMuralScript() {
    const form = document.getElementById('mural-form');
    const postsContainer = document.getElementById('mural-posts-container');
    const mensagemInput = document.getElementById('mural-mensagem');
    const charCounter = document.getElementById('mural-char-counter');

    if (!form || !postsContainer) {
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

    let unsubscribeFromPosts = null; // Para guardar a função de unsubscribe do onSnapshot
    let editTimerInterval = null; // Para guardar o intervalo do temporizador de edição
    let lastVisiblePost = null; // Para a paginação
    let isLoadingMore = false; // Para evitar múltiplos carregamentos
    const POSTS_PER_PAGE = 10; // Número de posts a carregar de cada vez
    let allPostsLoaded = false; // Flag para saber se todos os posts foram carregados
    let loadMoreButton = null; // Referência para o botão "Carregar Mais"

    const muralCollection = collection(db, 'mural_mensagens');

    // --- Lidar com a submissão do formulário ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nomeInput = document.getElementById('mural-nome'); // mensagemInput já foi declarado acima
        const submitButton = form.querySelector('button[type="submit"]');
        const parentId = form.dataset.parentId || null; // Verifica se é uma resposta

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
            // 1. Obter a localização do utilizador (pode ser null)
            const location = await getUserLocation();

            const postData = {
                mensagem: mensagem,
                createdAt: serverTimestamp(), // Usa o timestamp do servidor
                nome: nome,
                authorId: getOrCreateAuthorId() // ID anónimo para o autor
            };

            // Se for uma resposta, adiciona o parentId
            if (parentId) {
                postData.parentId = parentId;
            }

            // 2. Adicionar a localização ao postData se ela foi obtida
            if (location) {
                postData.location = location;
            }

            // Adiciona o documento ao Firestore
            await addDoc(muralCollection, postData);

            form.reset();
            cancelReply(); // Limpa o estado de resposta do formulário

        } catch (error) {
            console.error("Erro ao adicionar mensagem: ", error);
            showNotification('Ocorreu um erro ao enviar a sua mensagem. Tente novamente.', 'error');
        } finally {
            // Reativa o botão
            submitButton.disabled = false;
            submitButton.textContent = 'Submeter Mensagem';
        }
    });

    /**
     * Cria ou recupera um ID de autor anónimo do localStorage.
     * @returns {string} O ID do autor.
     */
    function getOrCreateAuthorId() {
        let authorId = localStorage.getItem('muralAuthorId');
        if (!authorId) {
            // Gera um ID "único" simples
            authorId = 'anon_' + Date.now().toString(36) + Math.random().toString(36).substring(2);
            localStorage.setItem('muralAuthorId', authorId);
        }
        return authorId;
    }

    /**
     * Tenta obter a localização do utilizador (cidade e país).
     * Requer permissão do utilizador.
     * @returns {Promise<string|null>} Uma string como "Cidade, País" ou null.
     */
    async function getUserLocation() {
        return new Promise(async (resolve) => {
            if (!navigator.geolocation) {
                resolve(null); // Navegador não suporta geolocalização
                return;
            }

            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    try {
                        // Usando uma API de geocodificação reversa gratuita e sem chave
                        const response = await fetch(`https://geocode.maps.co/reverse?lat=${latitude}&lon=${longitude}`);
                        const data = await response.json();
                        if (data && data.address) {
                            const city = data.address.city || data.address.town || data.address.village;
                            const country = data.address.country;
                            resolve(city && country ? `${city}, ${country}` : null);
                        } else { resolve(null); }
                    } catch (error) { resolve(null); }
                },
                () => resolve(null) // Erro ou permissão negada
            );
        });
    }

    // Inicia a escuta por posts assim que o script começa
    listenForPosts();

    function listenForPosts() {
        // Se já houver um listener ativo, cancela-o antes de criar um novo
        if (unsubscribeFromPosts) {
            unsubscribeFromPosts();
        }

        const q = query(muralCollection, orderBy('createdAt', 'desc'));
        // Guarda a função de unsubscribe para poder ser chamada mais tarde
        unsubscribeFromPosts = onSnapshot(q, (querySnapshot) => {
            // Usa docChanges para processar apenas as alterações
            handlePostChanges(querySnapshot.docChanges());
        });
    }

    async function handleDeleteClick(event) {
        const postElement = event.target.closest('.mural-post');
        const postId = postElement.dataset.id;

        if (confirm('Tem a certeza que quer apagar esta mensagem permanentemente?')) {
            try {
                await deleteDoc(doc(db, 'mural_mensagens', postId));
                showNotification('Mensagem apagada com sucesso.', 'success');
                // O onSnapshot irá atualizar a UI automaticamente.
            } catch (error) {
                console.error("Erro ao apagar mensagem:", error);
                showNotification('Não foi possível apagar a mensagem.', 'error');
            }
        }
    }

    function handlePostChanges(changes) {
        // Remove a mensagem de "mural vazio" se ela existir e houver posts
        const emptyMessage = postsContainer.querySelector('.mural-empty');
        if (emptyMessage && postsContainer.children.length > 1) {
            emptyMessage.remove();
        }

        changes.forEach((change, index) => {
            if (change.type === "added") {
                const postElement = createPostElement(change.doc);
                // Adiciona a classe para a animação de "novo"
                postElement.classList.add('new-post-animation');
                // Adiciona um atraso para a animação de entrada inicial
                postElement.style.animationDelay = `${index * 100}ms`;
                // Insere o novo post no topo da lista
                postsContainer.prepend(postElement);
            }
            if (change.type === "modified") {
                const postElement = createPostElement(change.doc);
                const oldElement = postsContainer.querySelector(`[data-id="${change.doc.id}"]`);
                if (oldElement) {
                    postsContainer.replaceChild(postElement, oldElement);
                }
            }
            if (change.type === "removed") {
                const oldElement = postsContainer.querySelector(`[data-id="${change.doc.id}"]`);
                if (oldElement) {
                    oldElement.remove();
                }
            }
        });

        // Mostra a mensagem de "mural vazio" se não houver posts
        if (postsContainer.children.length === 0) {
            postsContainer.innerHTML = '<p class="mural-empty">Ainda ninguém deixou uma mensagem. Sê o primeiro!</p>';
        }

        // Garante que o event listener está sempre ativo
        postsContainer.removeEventListener('click', handlePostControlsClick);
        postsContainer.addEventListener('click', handlePostControlsClick);
    }

    // Inicia o temporizador para atualizar os contadores de edição
    startEditTimers();

    function createPostElement(doc) {
        const post = doc.data();
        const postElement = document.createElement('div');
        postElement.className = 'mural-post';
        postElement.dataset.id = doc.id;

        const dataFormatada = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString('pt-PT') : 'agora mesmo';

        // Guarda o timestamp para o contador de edição
        if (post.createdAt) {
            postElement.dataset.createdAt = post.createdAt.toMillis();
        }

        const postAgeInMinutes = post.createdAt ? (Date.now() - post.createdAt.toMillis()) / 60000 : 0;
        const currentAuthorId = getOrCreateAuthorId();
        const EDIT_WINDOW_MINUTES = 1;
        const canEdit = post.authorId === currentAuthorId && postAgeInMinutes < EDIT_WINDOW_MINUTES;

        let controlsHTML = '';

        if (canEdit) {
            controlsHTML += `<button class="mural-delete-btn" title="Apagar mensagem (disponível por ${EDIT_WINDOW_MINUTES} min)">×</button>`;
            controlsHTML += `<button class="mural-edit-btn" title="Editar mensagem"><i class="fa-solid fa-pencil"></i><span class="edit-timer"></span></button>`;
        }

        postElement.innerHTML = `
            <p class="mural-post-content">${escapeHTML(post.mensagem)}</p>
            <div class="mural-post-controls">${controlsHTML}</div>
            <div class="mural-post-footer">
                <span class="mural-post-author"><i class="fa-solid fa-user-pen"></i> ${escapeHTML(post.nome)}</span>
                <span class="mural-post-date"><i class="fa-regular fa-calendar-days"></i> ${dataFormatada}</span>
            </div>
        `;

        // Adiciona a animação de fade-in padrão para todos os posts criados
        postElement.classList.add('post-fade-in-animation');

        return postElement;
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
            showNotification('Mensagem editada com sucesso.', 'success');
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

    /**
     * Mostra uma notificação simples na tela.
     * @param {string} message A mensagem a ser exibida.
     * @param {string} type 'success' ou 'error'.
     */
    function showNotification(message, type = 'success') {
        const alertPlaceholder = document.getElementById('alert-placeholder');
        if (!alertPlaceholder) return;

        const notification = document.createElement('div');
        notification.className = `custom-alert ${type}`;
        notification.textContent = message;

        alertPlaceholder.appendChild(notification);

        // Remove a notificação após 3 segundos
        setTimeout(() => notification.remove(), 3000);
    }

    /**
     * Mostra um modal de confirmação personalizado.
     * @param {string} message A mensagem a ser exibida no modal.
     * @param {function} onConfirm A função a ser executada se o utilizador confirmar.
     */
    function showConfirmationModal(message, onConfirm) {
        // Remove qualquer modal existente
        const existingModal = document.getElementById('confirmation-modal');
        if (existingModal) existingModal.remove();

        const modalHTML = `
            <div id="confirmation-modal" class="confirmation-modal-overlay">
                <div class="confirmation-modal-content">
                    <p>${message}</p>
                    <div class="confirmation-modal-actions">
                        <button id="modal-cancel-btn" class="btn btn-secondary">Cancelar</button>
                        <button id="modal-confirm-btn" class="btn btn-danger">Confirmar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('confirmation-modal');
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');

        const closeModal = () => modal.remove();

        confirmBtn.addEventListener('click', () => {
            onConfirm();
            closeModal();
        });
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'confirmation-modal') closeModal();
        });
    }

    /**
     * Mostra uma notificação de novo post se o mural não estiver visível.
     */
    function showNewPostNotification(postId) {
        const muralSection = document.getElementById('mural-section');
        const observer = new IntersectionObserver((entries) => {
            if (!entries[0].isIntersecting) { // Se o mural NÃO está visível
                let notification = document.getElementById('new-post-toast');
                if (!notification) {
                    notification = document.createElement('div');
                    notification.id = 'new-post-toast';
                    notification.innerHTML = `<span>Nova mensagem no mural!</span><button class="btn-link">Ver</button>`;
                    document.body.appendChild(notification);
                    notification.addEventListener('click', () => {
                        document.querySelector(`[data-id="${postId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        notification.remove();
                    });
                }
            }
        }, { threshold: 0.1 });
        observer.observe(muralSection);
    }

    /**
     * Inicia um temporizador que atualiza o tempo restante para editar posts.
     */
    function startEditTimers() {
        if (editTimerInterval) clearInterval(editTimerInterval);

        editTimerInterval = setInterval(() => {
            const postsToUpdate = postsContainer.querySelectorAll('.mural-post[data-created-at]');
            if (postsToUpdate.length === 0) {
                clearInterval(editTimerInterval);
                editTimerInterval = null;
                return;
            }

            postsToUpdate.forEach(post => {
                const createdAt = parseInt(post.dataset.createdAt, 10);
                const editBtn = post.querySelector('.mural-edit-btn');
                if (!editBtn) return;

                const EDIT_WINDOW_MS = 1 * 60 * 1000; // 1 minuto
                const timePassed = Date.now() - createdAt;
                const timeRemaining = EDIT_WINDOW_MS - timePassed;

                if (timeRemaining > 0) {
                    const secondsLeft = Math.ceil(timeRemaining / 1000);
                    editBtn.querySelector('.edit-timer').textContent = ` (${secondsLeft}s)`;
                } else {
                    // Remove o botão de editar e o de apagar quando o tempo expira
                    post.querySelector('.mural-post-controls').innerHTML = '';
                    post.removeAttribute('data-created-at'); // Para de ser processado
                }
            });
        }, 1000);
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