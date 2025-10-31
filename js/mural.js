import { db, auth } from "./firebase-init.js";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, deleteDoc, updateDoc, increment, writeBatch } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

function startMuralScript() {
    const form = document.getElementById('mural-form');
    const postsContainer = document.getElementById('mural-posts-container');
    const mensagemInput = document.getElementById('mural-mensagem');
    const nomeInput = document.getElementById('mural-nome');
    const sortControlsContainer = document.getElementById('mural-sort-controls');
    const charCounter = document.getElementById('mural-char-counter');
    const imageUploadInput = document.getElementById('mural-imagem-upload');
    const imagePreviewContainer = document.getElementById('mural-image-preview-container');
    const imagePreview = document.getElementById('mural-image-preview');
    const removeImageBtn = document.getElementById('mural-remove-image-btn');

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
    let resizedImageDataURL = null; // Para guardar a imagem redimensionada

    let currentPage = 1;
    const postsPerPage = 10;
    let currentSortOrder = 'recent'; // 'recent' ou 'popular'

    const muralCollection = collection(db, 'mural_mensagens');

    // --- Lógica de Upload e Redimensionamento de Imagem ---
    if (imageUploadInput) {
        imageUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            resizeImage(file, 500, 500, (dataUrl) => {
                resizedImageDataURL = dataUrl;
                imagePreview.src = dataUrl;
                imagePreviewContainer.style.display = 'flex';
            });
        });
    }

    if (removeImageBtn) {
        removeImageBtn.addEventListener('click', () => {
            resizedImageDataURL = null;
            imageUploadInput.value = ''; // Limpa o input de ficheiro
            imagePreviewContainer.style.display = 'none';
        });
    }

    /**
     * Redimensiona uma imagem para as dimensões alvo, cortando-a para caber.
     * @param {File} file O ficheiro da imagem.
     * @param {number} targetWidth A largura final.
     * @param {number} targetHeight A altura final.
     * @param {function(string): void} callback Função chamada com o Data URL da imagem redimensionada.
     */
    function resizeImage(file, targetWidth, targetHeight, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');

                // Calcula a proporção para preencher o canvas e depois cortar
                const sourceAspectRatio = img.width / img.height;
                const targetAspectRatio = targetWidth / targetHeight;
                let sourceX = 0, sourceY = 0, sourceWidth = img.width, sourceHeight = img.height;

                if (sourceAspectRatio > targetAspectRatio) { // Imagem mais larga que o alvo
                    sourceWidth = img.height * targetAspectRatio;
                    sourceX = (img.width - sourceWidth) / 2;
                } else { // Imagem mais alta que o alvo
                    sourceHeight = img.width / targetAspectRatio;
                    sourceY = (img.height - sourceHeight) / 2;
                }

                // Desenha a imagem cortada e redimensionada no canvas
                ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);

                // Converte o canvas para um Data URL com compressão JPEG
                callback(canvas.toDataURL('image/jpeg', 0.85)); // 85% de qualidade
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

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
        // e inicia a animação de progresso
        submitButton.disabled = true;
        submitButton.textContent = 'A enviar...';
        submitButton.classList.add('is-submitting');

        // A animação de preenchimento tem 2s. Vamos garantir que o processo
        // pareça demorar pelo menos isso para a animação ser visível.
        const animationPromise = new Promise(resolve => setTimeout(resolve, 2000));

        try {
            const location = await getUserLocation();
            const linkPreview = await getLinkPreview(mensagem);

            const postData = {
                mensagem: mensagem,
                createdAt: serverTimestamp(), // Usa o timestamp do servidor
                nome: nome,
                authorId: getOrCreateAuthorId(), // ID anónimo para o autor
                likes: 0,
                dislikes: 0,
                votes: {}, // Para rastrear quem votou
                imageUrl: resizedImageDataURL // Adiciona a imagem (pode ser null)
            };

            if (parentId) {
                postData.parentId = parentId;
            }
            if (location) {
                postData.location = location;
            }
            if (linkPreview) {
                postData.linkPreview = linkPreview;
            }

            localStorage.setItem('muralUserName', nome);

            // Espera que o envio para o Firestore e a animação mínima terminem.
            await Promise.all([
                addDoc(muralCollection, postData),
                animationPromise
            ]);

            // Sucesso
            submitButton.classList.remove('is-submitting');
            submitButton.classList.add('is-success');
            submitButton.textContent = 'Enviado!';
            showToastNotification('Mensagem enviada com sucesso!', 'success');

            form.reset();
            if (parentId) cancelReply(); // Limpa o estado de resposta do formulário
            // Limpa a pré-visualização da imagem
            resizedImageDataURL = null;
            imageUploadInput.value = '';
            imagePreviewContainer.style.display = 'none';

        } catch (error) {
            console.error("Erro ao adicionar mensagem: ", error);
            // Erro
            submitButton.classList.remove('is-submitting');
            submitButton.classList.add('is-error');
            submitButton.textContent = 'Erro!';
            showToastNotification('Falha ao enviar a mensagem.', 'error');
        } finally {
            // Reativa o botão após um tempo para o utilizador ver o resultado
            setTimeout(() => {
                submitButton.disabled = false;
                submitButton.classList.remove('is-success', 'is-error');
                if (form.dataset.parentId) {
                    submitButton.textContent = 'Submeter Resposta';
                } else {
                    submitButton.textContent = 'Submeter Mensagem';
                }
                charCounter.textContent = `0 / ${mensagemInput.maxLength}`;
            }, 3000); // 3 segundos para mostrar o estado de sucesso/erro
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
     * Tenta obter uma pré-visualização de um link a partir de um texto.
     * @param {string} text O texto que pode conter um link.
     * @returns {Promise<object|null>} Um objeto com os dados da pré-visualização ou null.
     */
    async function getLinkPreview(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/;
        const match = text.match(urlRegex);
        if (!match) return null;

        const url = match[0]; // O primeiro link encontrado
        // Usando um proxy CORS para evitar problemas de same-origin
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`API do proxy falhou com status: ${response.status}`);

            const data = await response.json();
            const html = data.contents;

            if (!html) throw new Error("O conteúdo do link está vazio.");

            // Usar DOMParser para analisar o HTML de forma segura
            const doc = new DOMParser().parseFromString(html, 'text/html');

            const getMeta = (prop) => doc.querySelector(`meta[property='${prop}'], meta[name='${prop}']`)?.getAttribute('content') || null;

            const title = getMeta('og:title') || doc.querySelector('title')?.textContent || null;

            // Se não conseguirmos extrair um título, consideramos a busca falha e retornamos null.
            if (!title) {
                return null;
            }

            const preview = {
                url: url,
                title: title,
                description: getMeta('og:description') || '',
                image: getMeta('og:image') || null,
            };

            // Se a imagem tiver um caminho relativo, torna-a absoluta
            if (preview.image && !preview.image.startsWith('http')) {
                preview.image = new URL(preview.image, url).href;
            }

            return preview;
            return null;
        } catch (error) {
            console.error("Erro ao buscar pré-visualização do link:", error);
            return null;
        }
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

            // Após qualquer mudança, processa os posts para adicionar pré-visualizações de link
            document.querySelectorAll('.mural-post').forEach(processPostForLinkPreview);

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
        // Limpa o container apenas se for a primeira página
        if (currentPage === 1) {
            postsContainer.innerHTML = '';
        }

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

        // Fatiar os posts para a página atual
        const startIndex = (currentPage - 1) * postsPerPage;
        const endIndex = startIndex + postsPerPage;
        const paginatedRootPosts = rootPosts.slice(startIndex, endIndex);

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
        setupLoadMoreButton(rootPosts.length);

        // Mostra a mensagem de "mural vazio" se não houver posts
        if (postsContainer.children.length === 0 && currentPage === 1) {
            postsContainer.innerHTML = '<p class="mural-empty">Ainda ninguém deixou uma mensagem. Sê o primeiro!</p>';
        }

        // Garante que o event listener está sempre ativo
        postsContainer.removeEventListener('click', handlePostControlsClick);
        postsContainer.addEventListener('click', handlePostControlsClick);

        // Anima os novos posts que foram carregados
        const newPosts = Array.from(fragment.children);
        newPosts.forEach((post, index) => {
            setTimeout(() => post.classList.add('post-fade-in-animation'), index * 100);
        });
    }

    function setupLoadMoreButton(totalPosts) {
        const pageCount = Math.ceil(totalPosts / postsPerPage);
        let loadMoreBtn = document.getElementById('mural-load-more-btn');

        // Remove o botão se não houver mais páginas
        if (pageCount <= currentPage) {
            loadMoreBtn?.remove();
            return;
        }

        // Cria o botão se ele não existir
        if (!loadMoreBtn) {
            loadMoreBtn = document.createElement('button');
            loadMoreBtn.id = 'mural-load-more-btn';
            loadMoreBtn.className = 'btn load-more-btn';
            loadMoreBtn.textContent = 'Carregar Mais Mensagens';
            loadMoreBtn.addEventListener('click', () => {
                currentPage++;
                renderAllPosts();
            });
            // Insere o botão após o container de posts
            postsContainer.insertAdjacentElement('afterend', loadMoreBtn);
        }

        loadMoreBtn.style.display = 'block';
    }

    // Inicia o temporizador para atualizar os contadores de edição
    startEditTimers();

    function createPostElement(post) {
        const postElement = document.createElement('article'); // 1. Melhoria de Acessibilidade: Usar <article>
        postElement.className = 'mural-post';
        postElement.setAttribute('aria-labelledby', `post-author-${post.id}`); // 2. Acessibilidade: Associa o post ao autor
        postElement.dataset.id = post.id;

        const dataFormatada = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : 'agora mesmo';

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
            controlsHTML += `<button class="mural-edit-btn" title="Editar mensagem" aria-label="Editar mensagem"><i class="fa-solid fa-pencil" aria-hidden="true"></i> Editar<span class="edit-timer"></span></button>`;
            controlsHTML += `<button class="mural-delete-btn" title="Apagar mensagem" aria-label="Apagar mensagem"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Apagar</button>`;
        }
        if (canReply) {
            controlsHTML += `<button class="mural-reply-btn" title="Responder a esta mensagem" aria-label="Responder a esta mensagem"><i class="fa-solid fa-reply" aria-hidden="true"></i> Responder</button>`;
        }
        controlsHTML += `<button class="mural-copy-btn" title="Copiar texto da mensagem" aria-label="Copiar texto da mensagem"><i class="fa-solid fa-copy" aria-hidden="true"></i> Copiar</button>`;
        controlsHTML += `<button class="mural-report-btn" title="Reportar mensagem" aria-label="Reportar mensagem como inapropriada" ${hasReported ? 'disabled' : ''}><i class="fa-solid fa-flag" aria-hidden="true"></i> ${hasReported ? 'Reportado' : 'Reportar'}</button>`;


        const votesHTML = `
            <div class="mural-post-votes">
                <button class="mural-vote-btn like-btn ${isLiked ? 'active' : ''}" data-vote="like" title="Gostei" aria-label="Gostar do post. Atualmente com ${post.likes || 0} gostos.">
                    <i class="fa-solid fa-thumbs-up" aria-hidden="true"></i> <span>${post.likes || 0}</span>
                </button>
                <button class="mural-vote-btn dislike-btn ${isDisliked ? 'active' : ''}" data-vote="dislike" title="Não gostei" aria-label="Não gostar do post. Atualmente com ${post.dislikes || 0} não gostos.">
                    <i class="fa-solid fa-thumbs-down" aria-hidden="true"></i> <span>${post.dislikes || 0}</span>
                </button>
            </div>
        `;

        const metaHTML = `
            <div class="mural-post-meta">
                ${post.location ? `<span class="mural-post-location" title="Localização (aproximada)"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${escapeHTML(post.location)}</span>` : ''}
                <span class="mural-post-date" title="${post.createdAt ? post.createdAt.toDate().toLocaleString('pt-PT') : ''}"><i class="fa-regular fa-calendar-days" aria-hidden="true"></i> ${dataFormatada}</span>
            </div>
        `;

        const avatarInfo = createAvatar(post.nome);
        const avatarElement = avatarInfo.element;

        let linkPreviewHTML = '';
        if (post.linkPreview && post.linkPreview.title) {
            const domain = new URL(post.linkPreview.url).hostname;
            linkPreviewHTML = `
                <a href="${post.linkPreview.url}" target="_blank" rel="noopener noreferrer" class="mural-link-preview">
                    <div class="mural-link-preview-content">
                        ${post.linkPreview.image ? `<img src="${post.linkPreview.image}" alt="Pré-visualização de ${post.linkPreview.title}" class="link-preview-image">` : ''}
                        <div class="link-preview-info">
                            <div class="link-preview-title">${escapeHTML(post.linkPreview.title)}</div>
                            <div class="link-preview-description">${escapeHTML(post.linkPreview.description)}</div>
                            <div class="link-preview-url">${escapeHTML(domain)}</div>
                        </div>
                    </div>
                </a>
            `;
        }

        postElement.innerHTML = `
            ${post.imageUrl ? `
                <div class="mural-post-image-container">
                    <a href="${post.imageUrl}" target="_blank" title="Ver imagem em tamanho real">
                        <img src="${post.imageUrl}" alt="Imagem anexada por ${escapeHTML(post.nome)}" class="mural-post-image" loading="lazy">
                    </a>
                </div>
            ` : ''}
            <p class="mural-post-content">${linkify(post.mensagem)}</p>
            ${linkPreviewHTML}
            <div class="mural-post-footer">
                <div class="mural-post-author" id="post-author-${post.id}">${avatarElement.outerHTML} <span style="color: ${avatarInfo.bgColor};">${escapeHTML(post.nome)}</span></div>
                ${metaHTML}
                <div class="mural-post-footer-actions">
                    ${votesHTML}
                    <div class="mural-post-controls">${controlsHTML}</div>
                </div>
            </div>
        `;

        return postElement;
    }

    /**
     * Processa um post para encontrar um link e exibir uma pré-visualização.
     * Inclui um skeleton loader e fallback.
     * @param {HTMLElement} postElement O elemento do post a ser processado.
     */
    async function processPostForLinkPreview(postElement) {
        // Se o post já tem uma pré-visualização ou um skeleton, não faz nada.
        if (postElement.querySelector('.mural-link-preview, .mural-link-preview-skeleton')) {
            return;
        }

        const contentElement = postElement.querySelector('.mural-post-content');
        if (!contentElement) return;

        const urlRegex = /(https?:\/\/[^\s]+)/;
        const match = contentElement.textContent.match(urlRegex);
        const firstLink = match ? match[0] : null;

        if (!firstLink) return;

        // 1. Evitar pré-visualização para links diretos de imagem
        const imageRegex = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i;
        if (imageRegex.test(firstLink)) {
            return; // Não faz nada se for um link de imagem
        }

        // 1. Inserir o Skeleton Loader imediatamente
        const skeletonId = `skeleton-${postElement.dataset.id}`;
        const skeletonHTML = `
            <div id="${skeletonId}" class="mural-link-preview-skeleton">
                <div class="skeleton-image-wrapper">
                    <div class="skeleton skeleton-image"></div>
                </div>
                <div class="skeleton-info">
                    <div class="skeleton skeleton-line title"></div>
                    <div class="skeleton skeleton-line desc"></div>
                </div>
            </div>
        `;
        contentElement.insertAdjacentHTML('afterend', skeletonHTML);

        // 2. Tentar buscar os metadados
        const metadata = await getLinkPreview(contentElement.textContent);
        const skeletonElement = document.getElementById(skeletonId);

        if (!skeletonElement) return; // O post pode ter sido removido enquanto a API carregava

        let finalPreviewHTML;

        if (metadata) {
            // 3a. Sucesso: Montar a pré-visualização completa
            const domain = new URL(metadata.url).hostname;
            finalPreviewHTML = `
                <div class="mural-link-preview">
                    <button class="mural-remove-preview-btn" data-post-id="${postElement.dataset.id}" title="Remover pré-visualização">&times;</button>
                    <a href="${metadata.url}" target="_blank" rel="noopener noreferrer" class="mural-link-preview-content">
                        ${metadata.image
                    ? `<img src="${metadata.image}" alt="Pré-visualização de ${metadata.title}" class="link-preview-image">`
                    : `<div class="link-preview-no-image"><i class="fa-solid fa-link"></i></div>`
                }
                        <div class="link-preview-info">
                            <div class="link-preview-title">${escapeHTML(metadata.title)}</div>
                            <div class="link-preview-description">${escapeHTML(metadata.description)}</div>
                            <div class="link-preview-url">${escapeHTML(domain)}</div>
                        </div>
                    </a>
                </div>
            `;
        } else {
            // 3b. Falha: Montar a pré-visualização de fallback (genérica)
            const domain = new URL(firstLink).hostname;
            finalPreviewHTML = `
                <div class="mural-link-preview">
                    <button class="mural-remove-preview-btn" data-post-id="${postElement.dataset.id}" title="Remover pré-visualização">&times;</button>
                    <a href="${firstLink}" target="_blank" rel="noopener noreferrer" class="mural-link-preview-content">
                        <div class="link-preview-no-image"><i class="fa-solid fa-link"></i></div>
                        <div class="link-preview-info">
                            <div class="link-preview-title">${escapeHTML(firstLink)}</div>
                            <div class="link-preview-url">${escapeHTML(domain)}</div>
                        </div>
                    </a>
                </div>
            `;
        }

        // 4. Substituir o skeleton pelo resultado final
        // Usar `outerHTML` garante que o elemento skeleton seja completamente substituído.
        skeletonElement.outerHTML = finalPreviewHTML;
    }


    /**
     * Cria um elemento de avatar para o utilizador com as suas iniciais.
     * Gera uma cor de fundo consistente com base no nome.
     * @param {string} name O nome do autor do post.
     * @returns {HTMLElement} O elemento do avatar.
     */
    function createAvatar(name) {
        const avatar = document.createElement('div');
        avatar.className = 'mural-avatar';
        avatar.setAttribute('aria-hidden', 'true'); // Melhoria de Acessibilidade

        const nameParts = name.trim().split(/\s+/);
        let initials = '';
        if (nameParts.length > 1) {
            initials = nameParts[0][0] + nameParts[nameParts.length - 1][0];
        } else if (name.length > 1) {
            // Pega a primeira e a última letra, mesmo de uma só palavra
            initials = name[0] + name[name.length - 1];
        } else if (name.length === 1) {
            // Se for apenas uma letra, usa só ela
            initials = name[0];
        }

        avatar.textContent = initials.toUpperCase();

        // Gera uma cor de fundo aleatória e consistente baseada no nome
        const colors = [
            '#c62828', '#ad1457', '#6a1b9a', '#4527a0', '#283593', '#1565c0', '#0277bd', '#00838f', '#00695c', '#2e7d32',
            '#558b2f', '#ef6c00', '#d84315', '#4e342e', '#424242', '#37474f'
        ];
        const charCodeSum = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const bgColor = colors[charCodeSum % colors.length];

        avatar.style.backgroundColor = bgColor;
        avatar.style.color = getContrastingShade(bgColor);

        return { element: avatar, bgColor: bgColor };
    }

    /**
     * Gera uma tonalidade mais clara ou mais escura de uma cor para garantir o contraste do texto.
     * Retorna branco ou preto com base na luminosidade da cor de fundo.
     * @param {string} bgColor Cor de fundo em formato hexadecimal (ex: '#RRGGBB').
     * @returns {string} A cor '#FFFFFF' (branco) ou '#000000' (preto).
     */
    function getContrastingShade(bgColor) {
        const hex = bgColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Caso especial: se a cor for predominantemente azul (componente azul é o maior),
        // e não for um azul muito claro, força a cor do texto para branco.
        if (b > r && b > g && luminance < 0.6) {
            return '#FFFFFF';
        }

        // Retorna branco para fundos escuros e preto para fundos claros.
        return luminance > 0.5 ? '#000000' : '#FFFFFF';
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
        const copyBtn = target.closest('.mural-copy-btn'); // Novo
        const removePreviewBtn = target.closest('.mural-remove-preview-btn');

        if (deleteBtn) handleDeleteClick(event);
        if (editBtn) handleEditClick(event);
        if (saveBtn) handleSaveClick(event);
        if (cancelBtn) handleCancelClick(event);
        if (replyBtn) handleReplyClick(event);
        if (voteBtn) handleVoteClick(event);
        if (reportBtn) handleReportClick(event);
        if (copyBtn) handleCopyClick(event); // Novo
        if (removePreviewBtn) handleRemovePreviewClick(event);
    }

    /**
     * Remove a pré-visualização de um link de um post.
     * @param {Event} event O evento de clique.
     */
    async function handleRemovePreviewClick(event) {
        const removeBtn = event.target;
        const postId = removeBtn.dataset.postId;
        if (!postId) return;

        removeBtn.disabled = true; // Desativa para evitar cliques múltiplos

        const postRef = doc(db, 'mural_mensagens', postId);
        try { await updateDoc(postRef, { linkPreview: null }); }
        catch (error) { console.error("Erro ao remover pré-visualização:", error); }
    }

    function handleCopyClick(event) {
        const copyBtn = event.target.closest('.mural-copy-btn');
        const postElement = copyBtn.closest('.mural-post');
        const contentElement = postElement.querySelector('.mural-post-content');
        const textToCopy = contentElement.innerText;

        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = `<i class="fa-solid fa-check" aria-hidden="true"></i> Copiado!`;
            copyBtn.disabled = true;
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.disabled = false;
            }, 2000);
        }).catch(err => {
            console.error('Falha ao copiar texto: ', err);
            showNotification('Não foi possível copiar o texto.', 'error');
        });
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
            const saveButton = postElement.querySelector('.mural-save-btn');
            saveButton.disabled = true;
            saveButton.textContent = 'A guardar...';

            try {
                // 2. Reavalia o link ao editar
                const newLinkPreview = await getLinkPreview(newMessage);
                await updateDoc(postRef, {
                    mensagem: newMessage,
                    linkPreview: newLinkPreview // Atualiza ou remove a pré-visualização
                });
            } catch (error) { console.error("Erro ao guardar a edição:", error); }
        }
    }

    function handleCancelClick(event, newMessage) {
        const postElement = event.target.closest('.mural-post');
        postElement.classList.remove('is-editing');
        postElement.querySelector('.mural-post-edit-form').remove();
        postElement.querySelector('.mural-post-content').style.display = 'block';
        postElement.querySelector('.mural-post-footer').style.display = 'grid';

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
     * Mostra uma notificação "toast" global no topo da página.
     * @param {string} message A mensagem a ser exibida.
     * @param {string} type 'success' ou 'error'.
     */
    function showToastNotification(message, type = 'success') {
        // Remove qualquer toast existente para evitar sobreposição
        document.getElementById('toast-notification')?.remove();

        const notification = document.createElement('div');
        notification.id = 'toast-notification';
        notification.className = type; // 'success' ou 'error'
        notification.textContent = message;
        document.body.appendChild(notification);

        // Adiciona a classe para a animação de entrada
        requestAnimationFrame(() => notification.classList.add('show'));

        // Agenda a remoção da notificação
        setTimeout(() => {
            notification.classList.remove('show');
            notification.classList.add('hide');
            // Remove o elemento do DOM após a animação de saída
            notification.addEventListener('animationend', () => notification.remove());
        }, 4000); // O toast fica visível por 4 segundos
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
    const textWithBreaks = escapedText.replace(/\n/g, '<br>');
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;

    return textWithBreaks.replace(urlRegex, function (url) {
        const fullUrl = url.startsWith('www.') ? 'http://' + url : url;
        return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
}

// O script do mural só deve correr depois dos componentes HTML serem carregados
document.addEventListener('componentsLoaded', startMuralScript, { once: true });