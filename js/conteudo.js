
/*
Chaves do JSON
Beats   /   Kits    /   Posts
*/
import { db } from "./firebase-init.js";
import { collection, onSnapshot, doc, setDoc, increment } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { toggleFavorite, isFavorite, getFavorites } from './favorites.js';


function startContentScript() {
    // Estado da aplicação
    let allContent = [];
    let pageConfig = {};
    let viewCounts = {}; // Novo: para armazenar as contagens de views
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
                    capa: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    capaPlaceholder: `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`, // Usar uma imagem de qualidade menor como placeholder
                    genero: data.author_name || "YouTube",
                    categoria: "Post", // Atribui a categoria correta para consistência
                    ano: new Date().getFullYear(),
                    isYouTubePost: true, // Adiciona um identificador para estes itens
                    preco: 0,
                    link: post.youtubeUrl,
                    descricao: `Um vídeo do canal ${data.author_name || 'UNKVOICES'}. Clique para assistir no YouTube.`
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
        const favoriteIds = getFavorites();
        return (
            (!pageConfig.showOnlyFavorites || favoriteIds.includes(item.id.toString())) &&
            (!pageConfig.categorias || pageConfig.categorias.includes(item.categoria)) &&
            (!pageConfig.precoMin || item.preco >= pageConfig.precoMin)
        );
    }
    function renderContent(list) {
        // Limpa o container antes de adicionar novos elementos
        elements.container.innerHTML = '';
        const fragment = document.createDocumentFragment(); // Usar um fragmento para melhor performance

        if (!list.length) {
            elements.container.innerHTML = `
                <div class="no-results-container" style="display: ${pageConfig.showOnlyFavorites ? 'none' : 'block'};">
                    <span class="icon">😕</span>
                    <h4>Nenhum resultado encontrado</h4>
                    <p>Tente ajustar os filtros ou o termo de pesquisa.</p>
                </div>
            `;
            return;
        }
        if (list.length === 0 && pageConfig.showOnlyFavorites) {
            elements.container.innerHTML = `
                <div class="no-results-container">
                    <span class="icon"><i class="fa-regular fa-heart"></i></span>
                    <h4>Nenhum favorito encontrado</h4>
                    <p>Clique no ícone de coração nos itens para adicioná-los aqui.</p>
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

            // --- Botão de Favorito ---
            const favoriteBtn = cardClone.querySelector('.card-favorite-btn');
            if (favoriteBtn) {
                favoriteBtn.dataset.itemId = item.id;
                favoriteBtn.classList.toggle('is-favorite', isFavorite(item.id.toString()));
                favoriteBtn.querySelector('i').className = isFavorite(item.id.toString()) ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
            }

            // --- Link principal ---
            const mainLink = cardClone.querySelector('.card-link-wrapper');
            // Para posts do YouTube, o link principal abre o vídeo. Para outros, a página de detalhes.
            mainLink.href = item.isYouTubePost ? item.link : `item.html?id=${item.id}`;
            if (item.isYouTubePost) mainLink.target = '_blank';

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
            const viewCount = viewCounts[item.id] || 0;
            cardClone.querySelector('.card-views').innerHTML = `<i class="fa-solid fa-eye"></i> ${viewCount.toLocaleString('pt-PT')}`;

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
            };

            const filtered = filterContent(searchTerm, selected);

            currentFilteredContent = filtered;
            currentPage = 1;

            updateResultsCounter();
            setupPagination();
            displayPage(currentPage); // A primeira exibição não precisa destacar nada
            updateURL(); // Atualiza a URL com os filtros atuais
        }, cards.length > 0 ? animationDuration : 0); // Se não houver cards, executa imediatamente
    }

    function filterContent(searchTerm, selected) {
        return allContent.filter(item => {
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

        // Listener para o evento de mudança de favoritos
        window.addEventListener('favoritesChanged', (event) => {
            if (pageConfig.showOnlyFavorites) {
                applyFilters(); // Re-filtra a página de favoritos
            } else {
                updateFavoriteIcons(event.detail.favorites); // Apenas atualiza os ícones
            }
        });
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
        const favoriteBtn = event.target.closest('.card-favorite-btn');

        // Se o clique foi no botão de favorito
        if (favoriteBtn) {
            toggleFavorite(favoriteBtn.dataset.itemId);
            return; // Interrompe para não contar como clique no card
        }

        if (!card) return; // Sai se o clique não foi dentro de um card

        // Ação: Incrementar a visualização a cada clique no card.
        // A lógica para posts do YouTube foi simplificada. O link principal agora cuida da navegação.
        // O modal não é mais necessário, pois o clique no card inteiro leva ao YouTube.
        const itemId = card.dataset.id;
        const item = allContent.find(i => i.id.toString() === itemId);

        // Incrementa a view para qualquer tipo de item clicado.
        if (item) incrementViewCount(itemId);
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

    function updateFavoriteIcons(favoriteIds) {
        const cards = elements.container.querySelectorAll('.card');
        cards.forEach(card => {
            const favoriteBtn = card.querySelector('.card-favorite-btn');
            if (favoriteBtn) {
                const itemId = favoriteBtn.dataset.itemId;
                const isFav = favoriteIds.includes(itemId);
                favoriteBtn.classList.toggle('is-favorite', isFav);
                favoriteBtn.querySelector('i').className = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
            }
        });
    }

    function updateURL() {
        const params = new URLSearchParams();

        const searchTerm = elements.search.value;
        if (searchTerm) params.set('search', searchTerm);

        const selected = {
            genero: elements.filtroGenero.value,
            categoria: elements.filtroCategoria.value,
            ano: elements.filtroAno.value,
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

    function displayPage(page) {
        currentPage = page;
        const start = (page - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const paginatedItems = currentFilteredContent.slice(start, end);

        renderContent(paginatedItems);

        updatePaginationButtons();
    }

    function setupPagination() {
        elements.paginationContainer.innerHTML = '';
        const pageCount = Math.ceil(currentFilteredContent.length / itemsPerPage);

        if (pageCount <= 1) return;

        for (let i = 1; i <= pageCount; i++) {
            const btn = document.createElement('button');
            btn.innerText = i;
            btn.dataset.page = i;
            btn.addEventListener('click', (e) => {
                const pageNum = parseInt(e.target.dataset.page, 10);
                displayPage(pageNum);
            });
            elements.paginationContainer.appendChild(btn);
        }
    }

    function updatePaginationButtons() {
        const buttons = elements.paginationContainer.querySelectorAll('button');
        buttons.forEach(button => {
            button.classList.remove('active');
            if (parseInt(button.dataset.page, 10) === currentPage) {
                button.classList.add('active');
            }
        });
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
