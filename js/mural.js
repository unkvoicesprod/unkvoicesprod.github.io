import { db, auth } from "./firebase-init.js";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, deleteDoc, updateDoc, increment, writeBatch } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

function startMuralScript() {
    const form = document.getElementById('mural-form');
    const postsContainer = document.getElementById('mural-posts-container');
    const mensagemInput = document.getElementById('mural-mensagem');
    const nomeInput = document.getElementById('mural-nome');
    const sortControlsContainer = document.getElementById('mural-sort-controls');
    const charCounter = document.getElementById('mural-char-counter');

    if (!form || !postsContainer) {
        // Se os elementos não existem, não faz nada.
        // Isso pode acontecer se o mural.html ainda não foi carregado.
        return;
    }

    // Define o limite de caracteres para o nome do utilizador
    if (nomeInput) {
        nomeInput.maxLength = 15;
    }

    // --- Lógica para lembrar o nome do utilizador ---
    const savedName = localStorage.getItem('muralUserName');
    if (savedName && nomeInput) {
        nomeInput.value = savedName;
    }

    // --- Lógica do Contador de Caracteres ---
    if (mensagemInput && charCounter) {
        const maxLength = mensagemInput.maxLength;
        charCounter.textContent = `${mensagemInput.value.length} / ${maxLength}`; // Estado inicial

        mensagemInput.addEventListener('input', () => {
            const currentLength = mensagemInput.value.length;
            charCounter.textContent = `${currentLength} / ${maxLength}`;

            // Adiciona uma classe para feedback visual quando o limite é atingido
            charCounter.classList.toggle('limit-reached', currentLength >= maxLength);
        });
    }

    let unsubscribeFromPosts = null; // Para guardar a função de unsubscribe do onSnapshot
    let editTimerInterval = null; // Para guardar o intervalo do temporizador de edição
    let allPosts = new Map(); // Para guardar todos os posts e facilitar a construção da árvore de respostas
    let userVotes = JSON.parse(localStorage.getItem('muralUserVotes')) || {}; // Para guardar os votos do utilizador
    let userReports = JSON.parse(localStorage.getItem('muralUserReports')) || []; // Para guardar os posts reportados pelo utilizador

    let currentPage = 1;
    const postsPerPage = 10;
    let currentSortOrder = 'recent'; // 'recent' ou 'popular'

    const muralCollection = collection(db, 'mural_mensagens');

    // --- Lidar com a submissão do formulário ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

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
                authorId: getOrCreateAuthorId(), // ID anónimo para o autor
                likes: 0,
                dislikes: 0,
                votes: {} // Para rastrear quem votou
            };

            // Se for uma resposta, adiciona o parentId
            if (parentId) {
                postData.parentId = parentId;
            }

            // 2. Adicionar a localização ao postData se ela foi obtida
            if (location) {
                postData.location = location;
            }

            // Guarda o nome do utilizador para futuras visitas
            localStorage.setItem('muralUserName', nome);

            // Adiciona o documento ao Firestore
            await addDoc(muralCollection, postData);

            form.reset();
            if (parentId) cancelReply(); // Limpa o estado de resposta do formulário

        } catch (error) {
            console.error("Erro ao adicionar mensagem: ", error);
            showNotification('Ocorreu um erro ao enviar a sua mensagem. Tente novamente.', 'error');
        } finally {
            // Reativa o botão
            submitButton.disabled = false;
            submitButton.textContent = 'Submeter Mensagem';
            charCounter.textContent = `0 / ${mensagemInput.maxLength}`;
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
        unsubscribeFromPosts = onSnapshot(q, (snapshot) => {
            const changes = snapshot.docChanges();

            changes.forEach(change => {
                const postData = { id: change.doc.id, ...change.doc.data() };
                if (change.type === "added") {
                    allPosts.set(postData.id, postData);
                    // Notifica sobre o novo post se o mural não estiver visível
                    showNewPostNotification(postData.id);
                } else if (change.type === "modified") {
                    allPosts.set(postData.id, postData);
                } else if (change.type === "removed") {
                    allPosts.delete(postData.id);
                }
            });

            renderAllPosts();
        });
    }

    // --- Lógica de Ordenação ---
    sortControlsContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            currentSortOrder = e.target.dataset.sort;
            renderAllPosts(); // Re-renderiza os posts com a nova ordem
        }
    });
    async function handleDeleteClick(event) {
        const postElement = event.target.closest('.mural-post');
        const postId = postElement.dataset.id;
        const post = allPosts.get(postId);

        // Se o post tiver respostas, avisa o utilizador
        const hasReplies = Array.from(allPosts.values()).some(p => p.parentId === postId);
        const message = hasReplies ?
            'Este post tem respostas. Apagá-lo também irá apagar todas as respostas. Tem a certeza?' :
            'Tem a certeza que quer apagar esta mensagem permanentemente?';

        showConfirmationModal(message, async () => {
            try {
                // Se tiver respostas, apaga-as primeiro (ou usa uma Cloud Function para isso)
                if (hasReplies) {
                    const repliesToDelete = Array.from(allPosts.values()).filter(p => p.parentId && p.parentId === postId);
                    for (const reply of repliesToDelete) {
                        await deleteDoc(doc(db, 'mural_mensagens', reply.id));
                    }
                }
                // Apaga o post principal
                await deleteDoc(doc(db, 'mural_mensagens', postId));
                showNotification('Mensagem apagada com sucesso.', 'success');
            } catch (error) {
                console.error("Erro ao apagar mensagem:", error);
                showNotification('Não foi possível apagar a mensagem.', 'error');
            } finally {
                // Força a re-renderização para garantir que a UI está correta
                renderAllPosts();
            }
        });
    }

    function renderAllPosts() {
        postsContainer.innerHTML = ''; // Limpa o container

        // Atualiza a classe 'active' nos botões de ordenação
        sortControlsContainer.querySelectorAll('.sort-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === currentSortOrder);
        });

        let postsArray = Array.from(allPosts.values()).filter(p => !p.parentId);

        // Aplica a ordenação
        if (currentSortOrder === 'popular') {
            postsArray.sort((a, b) => (b.likes || 0) - (a.likes || 0));
        } else { // 'recent' é o padrão
            postsArray.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        }
        // Mapeia todos os posts (incluindo respostas) para construir a árvore
        const postMap = new Map(postsArray.map(p => [p.id, { ...p, children: [] }]));

        const rootPosts = [];
        postMap.forEach(post => {
            if (post.parentId && postMap.has(post.parentId)) {
                postMap.get(post.parentId).children.push(post);
            } else {
                rootPosts.push(post);
            }
        });

        // Paginação
        const paginatedRootPosts = rootPosts.slice((currentPage - 1) * postsPerPage, currentPage * postsPerPage);

        const fragment = document.createDocumentFragment();
        paginatedRootPosts.forEach(post => {
            const postElement = createPostElement(post);
            fragment.appendChild(postElement);

            // Ordena as respostas por data de criação (mais antigas primeiro)
            post.children.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());

            if (post.children.length > 0) {
                const repliesContainer = document.createElement('div');
                repliesContainer.className = 'mural-replies-container';
                post.children.forEach(reply => {
                    const replyElement = createPostElement(reply);
                    replyElement.classList.add('is-reply');
                    repliesContainer.appendChild(replyElement);
                });
                // Adiciona o formulário de resposta no final das respostas, se aplicável
                if (form.dataset.parentId === post.id) {
                    repliesContainer.appendChild(form);
                }
                postElement.appendChild(repliesContainer);
            } else {
                // Adiciona o formulário de resposta se não houver respostas ainda
                if (form.dataset.parentId === post.id) {
                    postElement.appendChild(form);
                }
            }
        });

        postsContainer.appendChild(fragment);

        // Renderiza os botões de paginação
        renderPagination(rootPosts.length);

        // Mostra a mensagem de "mural vazio" se não houver posts
        if (postsContainer.children.length === 0) {
            postsContainer.innerHTML = '<p class="mural-empty">Ainda ninguém deixou uma mensagem. Sê o primeiro!</p>';
        }

        // Garante que o event listener está sempre ativo
        postsContainer.removeEventListener('click', handlePostControlsClick);
        postsContainer.addEventListener('click', handlePostControlsClick);
    }

    function renderPagination(totalPosts) {
        const pageCount = Math.ceil(totalPosts / postsPerPage);
        const paginationContainer = document.getElementById('mural-pagination') || document.createElement('div');
        paginationContainer.id = 'mural-pagination';
        paginationContainer.className = 'pagination mural-pagination';
        paginationContainer.innerHTML = '';

        if (pageCount <= 1) {
            // Se o container de paginação já existe no DOM, remove-o
            if (paginationContainer.parentNode) {
                paginationContainer.parentNode.removeChild(paginationContainer);
            }
            return;
        }

        for (let i = 1; i <= pageCount; i++) {
            const btn = document.createElement('button');
            btn.innerText = i;
            btn.dataset.page = i;
            if (i === currentPage) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => {
                currentPage = i;
                renderAllPosts();
                // Rola para o topo do mural
                document.getElementById('mural-section')?.scrollIntoView({ behavior: 'smooth' });
            });
            paginationContainer.appendChild(btn);
        }

        // Adiciona o container de paginação após o container de posts
        postsContainer.insertAdjacentElement('afterend', paginationContainer);
    }

    // Inicia o temporizador para atualizar os contadores de edição
    startEditTimers();

    function createPostElement(post) {
        const postElement = document.createElement('div');
        postElement.className = 'mural-post';
        postElement.dataset.id = post.id;

        const dataFormatada = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString('pt-PT') : 'agora mesmo';

        // Guarda o timestamp para o contador de edição
        if (post.createdAt) {
            postElement.dataset.createdAt = post.createdAt.toMillis();
        }

        const postAgeInMinutes = post.createdAt ? (Date.now() - post.createdAt.toMillis()) / 60000 : 0;
        const currentAuthorId = getOrCreateAuthorId();
        const EDIT_WINDOW_MINUTES = 1;
        const canEdit = post.authorId === currentAuthorId && postAgeInMinutes < EDIT_WINDOW_MINUTES;
        const canReply = true; // Todos podem responder

        const hasReported = userReports.includes(post.id);
        const userVote = userVotes[post.id];
        const isLiked = userVote === 'like';
        const isDisliked = userVote === 'dislike';


        let controlsHTML = '';

        if (canEdit) {
            controlsHTML += `<button class="mural-edit-btn" title="Editar mensagem"><i class="fa-solid fa-pencil"></i> Editar<span class="edit-timer"></span></button>`;
            controlsHTML += `<button class="mural-delete-btn" title="Apagar mensagem (disponível por ${EDIT_WINDOW_MINUTES} min)"><i class="fa-solid fa-trash-can"></i> Apagar</button>`;
        }
        if (canReply) {
            controlsHTML += `<button class="mural-reply-btn" title="Responder a esta mensagem"><i class="fa-solid fa-reply"></i> Responder</button>`;
        }
        controlsHTML += `<button class="mural-report-btn" title="Reportar mensagem" ${hasReported ? 'disabled' : ''}><i class="fa-solid fa-flag"></i> ${hasReported ? 'Reportado' : 'Reportar'}</button>`;


        const votesHTML = `
            <div class="mural-post-votes">
                <button class="mural-vote-btn like-btn ${isLiked ? 'active' : ''}" data-vote="like" title="Gostei">
                    <i class="fa-solid fa-thumbs-up"></i> <span>${post.likes || 0}</span>
                </button>
                <button class="mural-vote-btn dislike-btn ${isDisliked ? 'active' : ''}" data-vote="dislike" title="Não gostei">
                    <i class="fa-solid fa-thumbs-down"></i> <span>${post.dislikes || 0}</span>
                </button>
            </div>
        `;

        const metaHTML = `
            <div class="mural-post-meta">
                ${post.location ? `<span class="mural-post-location" title="Localização (aproximada)"><i class="fa-solid fa-location-dot"></i> ${escapeHTML(post.location)}</span>` : ''}
                <span class="mural-post-date" title="${post.createdAt ? post.createdAt.toDate().toLocaleString('pt-PT') : ''}"><i class="fa-regular fa-calendar-days"></i> ${dataFormatada}</span>
            </div>
        `;

        postElement.innerHTML = `
            <p class="mural-post-content">${linkify(post.mensagem)}</p>
            <div class="mural-post-footer">
                <div class="mural-post-author"><i class="fa-solid fa-user-pen"></i> ${escapeHTML(post.nome)}</div>
                ${metaHTML}
                <div class="mural-post-footer-actions">
                    ${votesHTML}
                    <div class="mural-post-controls">${controlsHTML}</div>
                </div>
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
        const replyBtn = target.closest('.mural-reply-btn');
        const voteBtn = target.closest('.mural-vote-btn');
        const reportBtn = target.closest('.mural-report-btn');

        if (deleteBtn) handleDeleteClick(event);
        if (editBtn) handleEditClick(event);
        if (saveBtn) handleSaveClick(event);
        if (cancelBtn) handleCancelClick(event);
        if (replyBtn) handleReplyClick(event);
        if (voteBtn) handleVoteClick(event);
        if (reportBtn) handleReportClick(event);
    }

    async function handleVoteClick(event) {
        const voteBtn = event.target.closest('.mural-vote-btn');
        const postElement = event.target.closest('.mural-post');
        const postId = postElement.dataset.id;
        const voteType = voteBtn.dataset.vote; // 'like' ou 'dislike'

        const currentVote = userVotes[postId];
        let updates = {};
        let optimisticUpdates = {};

        // Desativa os botões para evitar cliques duplos
        postElement.querySelectorAll('.mural-vote-btn').forEach(b => b.disabled = true);

        if (currentVote === voteType) {
            // O utilizador está a remover o seu voto
            delete userVotes[postId];
            updates[`${voteType}s`] = increment(-1);
            optimisticUpdates[voteType] = -1;
        } else {
            // O utilizador está a votar ou a mudar o seu voto
            if (currentVote) {
                // Remove o voto anterior (ex: remove 'like' para adicionar 'dislike')
                const oppositeVote = currentVote === 'like' ? 'dislikes' : 'likes';
                updates[oppositeVote] = increment(-1);
                optimisticUpdates[oppositeVote === 'likes' ? 'like' : 'dislike'] = -1;
            }
            // Adiciona o novo voto
            userVotes[postId] = voteType;
            updates[`${voteType}s`] = increment(1);
            optimisticUpdates[voteType] = 1;
        }

        // Atualiza o localStorage
        localStorage.setItem('muralUserVotes', JSON.stringify(userVotes));

        // Atualiza a UI imediatamente com a contagem otimista
        updateVoteCountUI(postElement, optimisticUpdates);
        // Atualiza o estado (cores) dos botões
        updateVoteUI(postElement, postId);

        try {
            const postRef = doc(db, 'mural_mensagens', postId);
            await updateDoc(postRef, updates);
        } catch (error) {
            console.error("Erro ao registar o voto:", error);
            // Reverte a alteração local se o update falhar
            // (Esta parte pode ser complexa, por agora apenas logamos o erro)
        } finally {
            // Reativa os botões
            postElement.querySelectorAll('.mural-vote-btn').forEach(b => b.disabled = false);
        }
    }

    function updateVoteCountUI(postElement, changes) {
        if (changes.like) {
            const likeSpan = postElement.querySelector('.like-btn span');
            const currentLikes = parseInt(likeSpan.textContent, 10);
            likeSpan.textContent = currentLikes + changes.like;
        }
        if (changes.dislike) {
            const dislikeSpan = postElement.querySelector('.dislike-btn span');
            const currentDislikes = parseInt(dislikeSpan.textContent, 10);
            dislikeSpan.textContent = currentDislikes + changes.dislike;
        }
    }


    function updateVoteUI(postElement, postId) {
        const post = allPosts.get(postId);
        if (!post) return;

        const userVote = userVotes[postId];
        postElement.querySelector('.like-btn').classList.toggle('active', userVote === 'like');
        postElement.querySelector('.dislike-btn').classList.toggle('active', userVote === 'dislike');
    }

    function handleReportClick(event) {
        const reportBtn = event.target.closest('.mural-report-btn');
        if (reportBtn.disabled) return;

        const postElement = event.target.closest('.mural-post');
        const postId = postElement.dataset.id;

        showConfirmationModal('Tem a certeza que quer reportar esta mensagem como inapropriada?', async () => {
            try {
                // Adiciona o report à coleção no Firestore
                await addDoc(collection(db, 'mural_reports'), {
                    postId: postId,
                    reportedBy: getOrCreateAuthorId(),
                    reportedAt: serverTimestamp()
                });

                // Adiciona o ID do post à lista local de reports e ao localStorage
                userReports.push(postId);
                localStorage.setItem('muralUserReports', JSON.stringify(userReports));

                // Atualiza a UI do botão
                reportBtn.disabled = true;
                reportBtn.innerHTML = `<i class="fa-solid fa-flag"></i> Reportado`;
                showNotification('Mensagem reportada com sucesso. Obrigado pela sua ajuda.', 'success');
            } catch (error) { console.error("Erro ao reportar mensagem:", error); }
        });
    }

    function handleEditClick(event) {
        const postElement = event.target.closest('.mural-post');
        const contentElement = postElement.querySelector('.mural-post-content');
        const currentMessage = contentElement.innerText;

        // Se já estiver a editar, não faz nada
        if (postElement.classList.contains('is-editing')) return;

        postElement.classList.add('is-editing');
        postElement.querySelector('.mural-post-footer').style.display = 'none';
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
        postElement.insertAdjacentHTML('beforeend', editFormHTML);
        postElement.querySelector('.mural-edit-textarea').focus();
    }

    async function handleSaveClick(event) {
        const postElement = event.target.closest('.mural-post');
        const postId = postElement.dataset.id;
        const textarea = postElement.querySelector('.mural-edit-textarea');
        const newMessage = textarea.value.trim();

        if (newMessage) {
            const postRef = doc(db, 'mural_mensagens', postId);
            try {
                await updateDoc(postRef, { mensagem: newMessage });
                // Força a atualização da UI localmente para uma resposta visual imediata.
                handleCancelClick(event, newMessage);
            } catch (error) { console.error("Erro ao guardar a edição:", error); }
        }
    }

    function handleCancelClick(event, newMessage) {
        const postElement = event.target.closest('.mural-post');
        postElement.classList.remove('is-editing');
        postElement.querySelector('.mural-post-edit-form').remove();
        postElement.querySelector('.mural-post-content').style.display = 'block';
        postElement.querySelector('.mural-post-footer').style.display = 'flex';

        // Se uma nova mensagem for passada (após salvar), atualiza o conteúdo.
        if (typeof newMessage === 'string') {
            postElement.querySelector('.mural-post-content').innerHTML = linkify(newMessage);
        }
    }

    function handleReplyClick(event) {
        const postElement = event.target.closest('.mural-post');
        const postId = postElement.dataset.id;

        // Cancela qualquer outra resposta que esteja ativa
        if (form.dataset.parentId && form.dataset.parentId !== postId) cancelReply();

        // Se já estiver a responder a este post, cancela a resposta
        if (form.dataset.parentId === postId) {
            cancelReply();
            return;
        }

        // Move o formulário para o post alvo
        form.dataset.parentId = postId;
        form.querySelector('button[type="submit"]').textContent = 'Submeter Resposta';
        form.querySelector('textarea').placeholder = 'Escreva a sua resposta...';

        // Encontra ou cria o container de respostas
        let repliesContainer = postElement.querySelector('.mural-replies-container');
        if (!repliesContainer) {
            repliesContainer = document.createElement('div');
            repliesContainer.className = 'mural-replies-container';
            postElement.appendChild(repliesContainer);
        }

        repliesContainer.appendChild(form);
        mensagemInput.focus();
    }

    function cancelReply() {
        const muralHeader = document.querySelector('.mural-header');
        delete form.dataset.parentId;
        form.reset();
        form.querySelector('button[type="submit"]').textContent = 'Submeter Mensagem';
        form.querySelector('textarea').placeholder = 'Escreva a sua mensagem aqui...';
        muralHeader.appendChild(form); // Move o formulário de volta para o local original
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
        const muralSection = document.getElementById('mural-section'); // O container do mural
        if (!muralSection) return;

        // Verifica se o mural está visível no ecrã
        const rect = muralSection.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom >= 0;

        if (isVisible) return; // Se o mural já está visível, não faz nada

        // Remove qualquer notificação existente para evitar duplicados
        document.getElementById('new-post-toast')?.remove();

        const notification = document.createElement('div');
        notification.id = 'new-post-toast';
        notification.innerHTML = `<span>Nova mensagem no mural!</span><button class="btn-link">Ver</button>`;
        document.body.appendChild(notification);

        notification.addEventListener('click', () => {
            const postElement = document.querySelector(`[data-id="${postId}"]`);
            postElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            postElement?.classList.add('new-post-animation'); // Adiciona destaque
            notification.remove();
        });
        setTimeout(() => notification.remove(), 5000); // Remove a notificação após 5 segundos
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
                    post.querySelector('.mural-edit-btn')?.remove();
                    post.querySelector('.mural-delete-btn')?.remove();
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

/**
 * Converte URLs num texto em links clicáveis.
 * @param {string} text O texto a ser processado.
 * @returns {string} O texto com tags <a> para os links.
 */
function linkify(text) {
    if (!text) return '';
    const escapedText = escapeHTML(text);
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;

    return escapedText.replace(urlRegex, function (url) {
        const fullUrl = url.startsWith('www.') ? 'http://' + url : url;
        return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
}

// O script do mural só deve correr depois dos componentes HTML serem carregados
document.addEventListener('componentsLoaded', startMuralScript, { once: true });