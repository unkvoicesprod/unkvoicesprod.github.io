
/*
Chaves do JSON
Beats   /   Kits    /   Posts
*/
import { db } from "./firebase-init.js";
import { collection, onSnapshot, doc, setDoc, increment } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

function startContentScript() {
    // Estado da aplicação
    let allContent = [];
    let pageConfig = {};
    let viewCounts = {}; // Novo: para armazenar as contagens de views
    let likeCounts = {}; // Para armazenar as contagens de likes
    let likedItems = []; // Para armazenar os IDs dos itens que o utilizador gostou
    let currentFilteredContent = [];
    let currentPage = 1;
    const itemsPerPage = 8;

    // Cache de elementos do DOM para evitar múltiplas buscas
    const elements = {
        container: document.getElementById("conteudo-container"),
        main: document.querySelector("main"), // Adicionado para ler a configuração
        search: document.getElementById("search"),
        filtroGenero: document.getElementById("filtro-genero"),
        filtroCategoria: document.getElementById("filtro-categoria"),
        filtroAno: document.getElementById("filtro-ano"),
        filtroOrdem: document.getElementById("filtro-ordem"), // Novo filtro de ordem
        filtersContainer: document.querySelector(".filters"),
        toggleFiltersBtn: document.getElementById("toggle-filters-btn"),
        paginationContainer: document.getElementById("pagination-container"),
        clearFiltersBtn: document.getElementById("clear-filters-btn"),
        resultsCounter: document.getElementById("results-counter"),
        cardTemplate: document.getElementById("card-template"), // Novo: cache do template
    };

    // Função principal que inicia a aplicação
    async function init() {
        // O Skeleton Loader já está no HTML, então não precisamos mais inserir um loader via JS.
        // elements.container.innerHTML = `<div class="loader"></div>`;

        // Carrega os itens que o utilizador já gostou a partir do localStorage
        likedItems = JSON.parse(localStorage.getItem('unkvoices_liked_items')) || [];

        loadPageConfig();
        applyPageUiSettings(); // Aplica configurações de UI, como esconder filtros

        try {
            // Carrega os dados e as contagens de visualizações em paralelo
            const [contentResponse, postsResponse] = await Promise.all([
                fetch("data/conteudo.json"),
                fetch("data/posts.json"),
            ]);

            if (!contentResponse.ok) throw new Error(`Erro ao carregar conteudo.json: ${contentResponse.status}`);
            if (!postsResponse.ok) throw new Error(`Erro ao carregar posts.json: ${postsResponse.status}`);

            const contentItems = await contentResponse.json();
            const postItems = await postsResponse.json();

            const processedPosts = await processYouTubePosts(postItems);
            allContent = [...contentItems, ...processedPosts];

            // Se a configuração da página pedir aleatoriedade, embaralha os itens
            if (pageConfig.randomize) {
                for (let i = allContent.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [allContent[i], allContent[j]] = [allContent[j], allContent[i]];
                }
            }

            const appliedFromURL = applyFiltersFromURL();
            setupEventListeners();
            populateFilters();
            if (!appliedFromURL) {
                applyFilters(); // Chamada inicial apenas se não houver filtros na URL
            }

            // Inicia o listener para as visualizações em tempo real
            listenForViewCounts();
            listenForLikeCounts();

        } catch (error) {
            console.error("Falha ao carregar o conteúdo:", error);
            elements.container.innerHTML = `<p class="error-message">Não foi possível carregar o conteúdo. Tente novamente mais tarde.</p>`;
        }
    }

    /**
     * Inicia um listener em tempo real para as contagens de visualizações do Firestore.
     */
    function listenForViewCounts() {
        if (!db) return;
        try {
            onSnapshot(collection(db, "views"), (querySnapshot) => {
                querySnapshot.forEach((doc) => {
                    viewCounts[doc.id] = doc.data().count;
                });
                // Atualiza as contagens nos cards que já estão na tela
                updateDisplayedViewCounts();
            });
        } catch (error) { console.error("Erro ao buscar contagens de views:", error); }
    }

    /**
     * Inicia um listener em tempo real para as contagens de "likes" do Firestore.
     */
    function listenForLikeCounts() {
        if (!db) return;
        try {
            onSnapshot(collection(db, "likes"), (querySnapshot) => {
                querySnapshot.forEach((doc) => {
                    likeCounts[doc.id] = doc.data().count;
                });
                updateDisplayedLikeCounts();
            });
        } catch (error) { console.error("Erro ao buscar contagens de likes:", error); }
    }
    /**
     * Atualiza o texto da contagem de visualizações nos cards visíveis na página.
     */
    function updateDisplayedViewCounts() {
        const cards = elements.container.querySelectorAll('.card');
        cards.forEach(card => {
            const itemId = card.dataset.id;
            const viewCountSpan = card.querySelector('.card-views');
            if (itemId && viewCounts[itemId] && viewCountSpan) {
                viewCountSpan.innerHTML = `<i class="fa-solid fa-eye"></i> ${viewCounts[itemId].toLocaleString('pt-PT')}`;
            }
        });
    }

    /**
     * Atualiza o texto e o estado da contagem de "likes" nos cards visíveis.
     */
    function updateDisplayedLikeCounts() {
        const cards = elements.container.querySelectorAll('.card');
        cards.forEach(card => {
            const itemId = card.dataset.id;
            const likeElement = card.querySelector('.card-likes');
            if (itemId && likeCounts[itemId] && likeElement) {
                likeElement.innerHTML = `<i class="fa-solid fa-thumbs-up"></i> ${likeCounts[itemId].toLocaleString('pt-PT')}`;
                likeElement.classList.toggle('is-liked', likedItems.includes(itemId));
            }
        });
    }

    /**
     * Incrementa a contagem de visualizações de um item no Firestore.
     * @param {string} itemId O ID do item.
     */
    async function incrementViewCount(itemId) {
        if (!db || !itemId) return;
        try {
            const viewRef = doc(db, "views", itemId.toString());
            await setDoc(viewRef, { count: increment(1) }, { merge: true });
        } catch (error) { console.error("Falha ao incrementar visualização:", error); }
    }

    /**
     * Decrementa a contagem de "likes" de um item no Firestore.
     * @param {string} itemId O ID do item.
     */
    async function decrementLikeCount(itemId) {
        if (!db || !itemId) return;
        try {
            const likeRef = doc(db, "likes", itemId.toString());
            await setDoc(likeRef, { count: increment(-1) }, { merge: true });
        } catch (error) { console.error("Falha ao decrementar like:", error); }
    }

    /**
     * Incrementa a contagem de "likes" de um item no Firestore.
     * @param {string} itemId O ID do item.
     */
    async function incrementLikeCount(itemId) {
        if (!db || !itemId) return;
        try {
            const likeRef = doc(db, "likes", itemId.toString());
            await setDoc(likeRef, { count: increment(1) }, { merge: true });
        } catch (error) { console.error("Falha ao incrementar like:", error); }
    }


    async function processYouTubePosts(posts) {
        const postPromises = posts.map(async (post, index) => {
            try {
                const response = await fetch(`https://noembed.com/embed?url=${post.youtubeUrl}`);
                const data = await response.json();

                const url = new URL(post.youtubeUrl);
                const videoId = url.searchParams.get('v') || url.pathname.split('/').pop();
                const postId = `yt_${videoId || index}`; // ID mais robusto e único
                return {
                    id: postId,
                    videoId: videoId, // Adiciona o ID do vídeo para uso posterior
                    titulo: data.title || `Post do YouTube #${index + 1}`,
                    capa: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    capaPlaceholder: `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
                    dataPublicacao: data.upload_date, // Adiciona a data de publicação
                    genero: "Beats", // Considerar todos os vídeos como gênero "Beats"
                    categoria: "Beats", // Considerar todos os vídeos como categoria "Beats"
                    ano: data.upload_date ? new Date(data.upload_date).getFullYear() : new Date().getFullYear(), // Extrai o ano ou usa o ano atual como fallback
                    isYouTubePost: true, // Adiciona um identificador para estes itens
                    preco: 0,
                    link: post.youtubeUrl,
                    descricao: data.title || `Um vídeo do canal ${data.author_name || 'UNKVOICES'}. Clique para assistir no YouTube.`
                };
            } catch (error) {
                console.error(`Falha ao buscar dados do vídeo: ${post.youtubeUrl}`, error);
                return null; // Retorna null se a busca falhar
            }
        });
        const resolvedPosts = await Promise.all(postPromises);
        return resolvedPosts.filter(post => post !== null); // Filtra os posts que falharam
    }

    function loadPageConfig() {
        const configAttr = elements.main.dataset.pageConfig;
        if (configAttr) {
            try {
                pageConfig = JSON.parse(configAttr);
            } catch (e) { console.error("Erro ao analisar a configuração da página (data-page-config):", e); }
        }
    }

    function applyPageUiSettings() {
        if (pageConfig.hideFilters && Array.isArray(pageConfig.hideFilters)) {
            pageConfig.hideFilters.forEach(filterKey => {
                // Constrói o nome da chave do elemento (ex: 'filtro' + 'Categoria' -> 'filtroCategoria')
                const elementKey = `filtro${filterKey.charAt(0).toUpperCase() + filterKey.slice(1)}`;
                if (elements[elementKey]) {
                    elements[elementKey].style.display = 'none';
                }
            });
        }
    }

    function itemMatchesPageConfig(item) {
        return (
            (!pageConfig.categorias || pageConfig.categorias.includes(item.categoria)) &&
            (!pageConfig.precoMin || item.preco >= pageConfig.precoMin)
        );
    }
    function renderContent(list, append = false) {
        // Limpa o container antes de adicionar novos elementos
        if (!append) {
            elements.container.innerHTML = '';
        }
        const fragment = document.createDocumentFragment(); // Usar um fragmento para melhor performance

        if (!list.length && !append) {
            elements.container.innerHTML = `
                <div class="no-results-container">
                    <span class="icon">😕</span>
                    <h4>Nenhum resultado encontrado</h4>
                    <p>Tente ajustar os filtros ou o termo de pesquisa.</p>
                </div>
            `;
        }

        list.forEach(item => {
            const cardClone = elements.cardTemplate.content.cloneNode(true);
            const cardElement = cardClone.querySelector('.card');

            // --- Configuração dos dados do card ---
            cardElement.dataset.id = item.id;
            cardElement.dataset.title = item.titulo;
            cardElement.dataset.cover = item.capa;

            // --- Link principal ---
            const mainLink = cardClone.querySelector('.card-link-wrapper');
            // Todos os cards agora levam para a página de detalhes.
            mainLink.href = `item.html?id=${item.id}`;

            const imageContainer = cardClone.querySelector('.card-image-container');
            imageContainer.dataset.srcFull = item.capa;

            const imgPlaceholder = cardClone.querySelector('.img-placeholder');
            imgPlaceholder.src = item.capaPlaceholder || '';
            imgPlaceholder.alt = `Placeholder para ${item.titulo}`;

            const imgFull = cardClone.querySelector('.img-full');
            imgFull.dataset.src = item.capa;
            imgFull.alt = item.titulo;

            // --- Conteúdo do Card (textos) ---
            const badgeClassMap = { "beats": "beat", "kits & plugins": "kit", "vst": "kit", "post": "post" };
            cardClone.querySelector('.badge').textContent = item.categoria;
            cardClone.querySelector('.badge').className = `badge ${badgeClassMap[item.categoria.toLowerCase()] || 'kit'}`;

            cardClone.querySelector('h3').textContent = item.titulo;

            const priceText = item.preco === 0 ? 'Grátis' : `$${item.preco.toFixed(2)}`;
            const priceElement = cardClone.querySelector('.card-price');
            priceElement.textContent = priceText;
            priceElement.className = `card-price ${item.preco === 0 ? 'free' : 'paid'}`;

            cardClone.querySelector('.card-meta').innerHTML = `<strong>${item.genero}</strong> - ${item.ano}`;

            // --- Contagem de Views ---
            cardClone.querySelector('.card-views').innerHTML = `<i class="fa-solid fa-eye"></i> ${(viewCounts[item.id] || 0).toLocaleString('pt-PT')}`;

            // --- Contagem de Likes ---
            const likeElement = cardClone.querySelector('.card-likes');
            const likeCount = likeCounts[item.id] || 0;
            const isLiked = likedItems.includes(item.id.toString());
            const likeIcon = isLiked ? 'fa-solid fa-thumbs-up' : 'fa-regular fa-thumbs-up';
            likeElement.innerHTML = `<i class="${likeIcon}"></i> ${likeCount.toLocaleString('pt-PT')}`;
            likeElement.classList.toggle('is-liked', isLiked);

            fragment.appendChild(cardClone);
        });

        elements.container.appendChild(fragment);

        // Adiciona um pequeno atraso para garantir que os elementos estejam no DOM
        // antes de aplicar o observador de interseção para a animação.
        setTimeout(() => {
            const cards = elements.container.querySelectorAll('.card');
            observeCards(cards);
        }, 0);
    }

    function applyFiltersFromURL() {
        const params = new URLSearchParams(window.location.search);
        let hasParams = false;

        const searchTerm = params.get('search');
        if (searchTerm) {
            elements.search.value = searchTerm;
            hasParams = true;
        }

        ['genero', 'categoria', 'ano'].forEach(key => {
            const filterElement = elements[`filtro${key.charAt(0).toUpperCase() + key.slice(1)}`];
            const value = params.get(key);
            if (value && filterElement) {
                // Aguarda a população dos filtros para definir o valor
                setTimeout(() => { filterElement.value = value; }, 0);
                hasParams = true;
            }
        });

        if (hasParams) {
            // Atraso para garantir que os valores dos selects sejam definidos
            // antes de aplicar os filtros.
            setTimeout(() => {
                applyFilters();
                if (elements.filtersContainer.offsetParent === null && elements.toggleFiltersBtn) {
                    elements.filtersContainer.classList.add('is-open');
                }
            }, 100);
        }
        return hasParams;
    }

    function populateFilters() {
        // Filtra o conteúdo com base na configuração da página antes de popular os filtros
        const pageContent = allContent.filter(itemMatchesPageConfig);

        const getUniqueValues = (key) => [...new Set(pageContent.map(item => item[key]).filter(Boolean))];

        fillSelect(elements.filtroGenero, getUniqueValues('genero'));
        fillSelect(elements.filtroCategoria, getUniqueValues('categoria'));
        fillSelect(elements.filtroAno, getUniqueValues('ano').sort((a, b) => b - a));
    }

    function fillSelect(selectElement, values) {
        if (!selectElement) return;
        const fragment = document.createDocumentFragment();
        values.forEach(value => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            fragment.appendChild(option);
        });
        selectElement.appendChild(fragment);

        // Se houver apenas uma opção (além do "placeholder"), esconde o filtro
        if (values.length === 1 && selectElement.options.length === 2) {
            selectElement.value = values[0]; // Pré-seleciona a única opção
            selectElement.style.display = 'none';
        }
    }

    function applyFilters() {
        const cards = elements.container.querySelectorAll('.card');
        const animationDuration = 300; // ms, deve corresponder à transição em CSS

        // 1. Anima a saída dos cards atuais
        if (cards.length > 0) {
            cards.forEach(card => card.classList.add('is-hiding'));
        }

        // 2. Após a animação, executa a lógica de filtragem e renderiza os novos cards
        setTimeout(() => {
            const searchTerm = elements.search.value.toLowerCase();
            const selected = {
                genero: elements.filtroGenero.value,
                categoria: elements.filtroCategoria.value,
                ano: elements.filtroAno.value,
                ordem: elements.filtroOrdem ? elements.filtroOrdem.value : 'recent', // Obtém o valor da ordem, com fallback
            };

            const filtered = filterContent(searchTerm, selected); // A ordenação agora é feita aqui dentro

            currentFilteredContent = filtered;
            currentPage = 1;

            updateResultsCounter(); // Atualiza o contador com o número de itens filtrados
            setupLoadMoreButton();
            displayPage(currentPage); // A primeira exibição não precisa destacar nada
            updateURL(); // Atualiza a URL com os filtros atuais
        }, cards.length > 0 ? animationDuration : 0); // Se não houver cards, executa imediatamente
    }

    function filterContent(searchTerm, selected, sortOrder) {
        const filteredItems = allContent.filter(item => {
            if (!itemMatchesPageConfig(item)) return false;

            // 2. Aplicar filtros do usuário (pesquisa e selects)
            const matchesSearch = searchTerm === "" ||
                item.titulo.toLowerCase().includes(searchTerm) ||
                item.descricao.toLowerCase().includes(searchTerm);

            const matchesFilters =
                (selected.genero === "" || item.genero === selected.genero) &&
                (selected.categoria === "" || item.categoria === selected.categoria) &&
                (selected.ano === "" || item.ano.toString() === selected.ano);

            return matchesSearch && matchesFilters;
        });

        return filteredItems.sort((a, b) => {
            // Aplica a ordenação após a filtragem
            switch (selected.ordem) {
                case 'popular':
                    // Nova lógica de popularidade: Score = (Likes * 10) + Views
                    // Um like tem um peso 10x maior que uma visualização.
                    const scoreA = ((likeCounts[a.id] || 0) * 10) + (viewCounts[a.id] || 0);
                    const scoreB = ((likeCounts[b.id] || 0) * 10) + (viewCounts[b.id] || 0);

                    // Ordena pelo score, decrescente (mais popular primeiro)
                    return scoreB - scoreA;

                case 'recent': // Agora ordena pela data de publicação exata
                    // Ordena pela data de publicação, decrescente (mais recentes primeiro)
                    return new Date(b.dataPublicacao || 0) - new Date(a.dataPublicacao || 0);
                case 'title_asc':
                    return a.titulo.localeCompare(b.titulo);
                default:
                    return 0; // Ordem padrão (do JSON ou aleatória)
            }
        });
    }

    function updateResultsCounter() {
        if (!elements.resultsCounter) return;

        const count = currentFilteredContent.length;
        if (count > 0) {
            const resultText = count === 1 ? 'resultado encontrado' : 'resultados encontrados';
            elements.resultsCounter.innerHTML = `<strong>${count}</strong> ${resultText}`;
            elements.resultsCounter.style.display = 'block';
        } else {
            // Esconde o contador se não houver resultados (a mensagem "Nenhum resultado" já é exibida)
            elements.resultsCounter.style.display = 'none';
        }
    }

    function setupEventListeners() {
        // Delegação de eventos para os cliques nos cards (play, etc.)
        elements.container.addEventListener('click', handleCardClick);

        // Listeners para os filtros
        elements.search.addEventListener("input", handleFilterChange);
        Object.values(elements).filter(el => el && el.tagName === 'SELECT').forEach(select => {
            select.addEventListener('change', handleFilterChange);
        });

        // Listener para o botão de toggle dos filtros em telas pequenas
        if (elements.toggleFiltersBtn && elements.filtersContainer) {
            elements.toggleFiltersBtn.addEventListener('click', () => {
                elements.filtersContainer.classList.toggle('is-open');
            });
        }

        // Listener para o botão de limpar filtros
        if (elements.clearFiltersBtn) {
            elements.clearFiltersBtn.addEventListener('click', resetFilters);
        }

    }

    function handleCardClick(event) {
        const card = event.target.closest('.card');
        const likeBtn = event.target.closest('.card-likes');

        // Ação de like/dislike só é acionada se o clique for diretamente no ícone (tag <i>)
        if (likeBtn && event.target.tagName === 'I') {
            event.preventDefault(); // Previne a navegação do link do card
            const itemId = card.dataset.id;
            const isLiked = likedItems.includes(itemId);

            // Adiciona a classe para a animação e remove-a quando a animação terminar
            likeBtn.classList.add('is-animating');
            likeBtn.addEventListener('animationend', () => {
                likeBtn.classList.remove('is-animating');
            }, { once: true });

            if (isLiked) {
                // O utilizador quer remover o like (dislike)
                decrementLikeCount(itemId);
                likedItems = likedItems.filter(id => id !== itemId);
                likeBtn.classList.remove('is-liked');
                likeCounts[itemId] = (likeCounts[itemId] || 1) - 1;
                likeBtn.innerHTML = `<i class="fa-regular fa-thumbs-up"></i> ${likeCounts[itemId].toLocaleString('pt-PT')}`;
            } else {
                // O utilizador quer dar like
                // Incrementa no Firebase
                incrementLikeCount(itemId);
                // Adiciona à lista local e ao localStorage
                likedItems.push(itemId);
                // Atualiza a UI imediatamente
                likeBtn.classList.add('is-liked');
                likeCounts[itemId] = (likeCounts[itemId] || 0) + 1;
                // Atualiza o HTML interno para garantir que o ícone e o texto sejam mantidos
                likeBtn.innerHTML = `<i class="fa-solid fa-thumbs-up"></i> ${likeCounts[itemId].toLocaleString('pt-PT')}`;
            }
            // Salva o estado atualizado no localStorage
            localStorage.setItem('unkvoices_liked_items', JSON.stringify(likedItems));
            return;
        }

        if (card) { // Ação de clique no card (fora do botão de like)
            // Ação: Incrementar a visualização a cada clique no card.
            // O modal não é mais necessário, pois o clique no card inteiro leva ao YouTube.
            const itemId = card.dataset.id;
            const item = allContent.find(i => i.id.toString() === itemId);

            // Incrementa a view para qualquer tipo de item clicado.
            if (item) incrementViewCount(itemId);
        }

    }

    function handleFilterChange(event) {
        applyFilters(); // Aplica os filtros como antes

        // Anima o filtro selecionado
        const selectedFilter = event.currentTarget;
        if (selectedFilter.classList.contains('is-animating')) return; // Previne re-animação

        selectedFilter.classList.add('is-animating');
        // Remove a classe após a animação para que possa ser reativada
        selectedFilter.addEventListener('animationend', () => {
            selectedFilter.classList.remove('is-animating');
        }, { once: true });
    }

    function resetFilters() {
        elements.search.value = '';
        if (elements.filtroGenero) elements.filtroGenero.value = '';
        if (elements.filtroCategoria) elements.filtroCategoria.value = '';
        if (elements.filtroAno) elements.filtroAno.value = '';

        // Re-aplica os filtros (agora vazios) para resetar a visualização
        applyFilters();
    }

    function updateURL() {
        const params = new URLSearchParams();

        const searchTerm = elements.search.value;
        if (searchTerm) params.set('search', searchTerm);

        const selected = {
            genero: elements.filtroGenero.value,
            categoria: elements.filtroCategoria.value,
            ano: elements.filtroAno.value,
            ordem: elements.filtroOrdem ? elements.filtroOrdem.value : 'recent',
        };

        for (const [key, value] of Object.entries(selected)) {
            if (value) params.set(key, value);
        }

        const newUrl = `${window.location.pathname}?${params.toString()}`;
        history.replaceState({ path: newUrl }, '', newUrl);
    }

    function observeCards(cards) {
        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target); // Deixa de observar o elemento após a animação
                }
            });
        }, { threshold: 0.1 }); // A animação começa quando 10% do card está visível

        cards.forEach(card => {
            observer.observe(card);
        });

        // Observador para carregar imagens de alta qualidade (lazy loading)
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const container = entry.target;
                    const imgFull = container.querySelector('.img-full');
                    imgFull.src = imgFull.dataset.src; // Inicia o carregamento
                    imgFull.onload = () => container.classList.add('is-loaded'); // Mostra a imagem quando carregada
                    observer.unobserve(container); // Para de observar
                }
            });
        }, { rootMargin: "100px" }); // Começa a carregar 100px antes de entrar na tela

        elements.container.querySelectorAll('.card-image-container').forEach(img => imageObserver.observe(img));
    }

    function displayPage(page, append = false) {
        currentPage = page;
        const start = (page - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const paginatedItems = currentFilteredContent.slice(start, end);

        renderContent(paginatedItems, append);

        updateLoadMoreButton();
    }

    function setupLoadMoreButton() {
        elements.paginationContainer.innerHTML = '';
        const pageCount = Math.ceil(currentFilteredContent.length / itemsPerPage);

        if (pageCount <= 1) return;

        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'load-more-btn';
        loadMoreBtn.className = 'btn load-more-btn'; // Reutilizando a classe de botão principal
        loadMoreBtn.textContent = 'Carregar Mais';

        loadMoreBtn.addEventListener('click', () => {
            displayPage(currentPage + 1, true); // Carrega a próxima página e apensa
        });

        elements.paginationContainer.appendChild(loadMoreBtn);
        updateLoadMoreButton();
    }

    function updateLoadMoreButton() {
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (!loadMoreBtn) return;

        const allItemsLoaded = (currentPage * itemsPerPage) >= currentFilteredContent.length;
        loadMoreBtn.style.display = allItemsLoaded ? 'none' : 'block';
    }

    // Inicia a aplicação
    init();
}

// Espera o DOM carregar e, em seguida, espera os componentes serem carregados pelo layout.js
document.addEventListener("DOMContentLoaded", () => {
    // Se os componentes já foram carregados (caso o evento dispare antes), inicia imediatamente.
    // Caso contrário, espera pelo evento.
    document.addEventListener('componentsLoaded', startContentScript, { once: true });
});
