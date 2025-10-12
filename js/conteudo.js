
/*
Chaves do JSON
Beats   /   Kits    /   Posts
*/
import { db } from './firebase-init.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


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
    };

    // Função principal que inicia a aplicação
    async function init() {
        // Exibe o loader antes de iniciar o carregamento
        elements.container.innerHTML = `<div class="loader"></div>`;

        loadPageConfig();
        applyPageUiSettings(); // Aplica configurações de UI, como esconder filtros

        try {
            // Carrega os dados e as contagens de visualizações em paralelo
            const [contentResponse, postsResponse, fetchedViewCounts] = await Promise.all([
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

    async function processYouTubePosts(posts) {
        const postPromises = posts.map(async (post, index) => {
            try {
                const response = await fetch(`https://noembed.com/embed?url=${post.youtubeUrl}`);
                const data = await response.json();

                const url = new URL(post.youtubeUrl);
                const videoId = url.searchParams.get('v');
                const postId = 1000 + index;

                return {
                    id: postId,
                    titulo: data.title || `Post do YouTube #${index + 1}`, // Usa o título real ou um fallback
                    capa: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    genero: "audio",
                    categoria: "Beats", // Altera a categoria para "Beats"
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

    function renderContent(list) {
        if (!list.length) {
            elements.container.innerHTML = `
                <div class="no-results-container">
                    <span class="icon">😕</span>
                    <h4>Nenhum resultado encontrado</h4>
                    <p>Tente ajustar os filtros ou o termo de pesquisa.</p>
                </div>
            `;
            return;
        }

        elements.container.innerHTML = list.map(item => {
            const imagePath = item.capa;

            // --- LÓGICA DE RENDERIZAÇÃO PARA ITENS (BEATS, KITS) ---
            const badgeClassMap = { "beats": "beat", "kits & plugins": "kit", "vst": "kit", "post": "post" };
            const badgeClass = badgeClassMap[item.categoria.toLowerCase()] || 'kit';

            // Lógica para formatar o preço
            const priceText = item.preco === 0 ? 'Grátis' : `$${item.preco.toFixed(2)}`;
            const priceClass = item.preco === 0 ? 'free' : 'paid';

            // Botão de play que será sobreposto na imagem
            const playOverlayButton = item.audioPreview
                ? `<button class="play-overlay-btn" aria-label="Tocar prévia de ${item.titulo}">▶</button>`
                : "";

            // O link principal do card. Para posts, não leva a 'item.html'
            const mainLink = item.isYouTubePost ? '#' : `item.html?id=${item.id}`;
            const linkClass = item.isYouTubePost ? 'card-link-wrapper no-action' : 'card-link-wrapper';

            // Determina o link a ser copiado. Usamos a URL absoluta para garantir que funcione em qualquer contexto.
            const linkToCopy = item.isYouTubePost
                ? item.link
                : `${window.location.origin}${window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'))}/item.html?id=${item.id}`;

            const viewCount = viewCounts[item.id] || 0;
            const viewCountHtml = `<span class="card-views"><i class="fa-solid fa-eye"></i> ${viewCount.toLocaleString('pt-PT')}</span>`;

            return `
            <div class="card" data-id="${item.id}" data-audio-src="${item.audioPreview || ''}" data-title="${item.titulo}" data-cover="${imagePath}">
                <a href="${mainLink}" class="${linkClass}">
                    <div class="card-image-container" data-src-full="${imagePath}">
                        <img src="${item.capaPlaceholder || ''}" class="img-placeholder" alt="Placeholder para ${item.titulo}" loading="eager" decoding="async" width="320" height="180">
                        <img data-src="${imagePath}" class="img-full" alt="${item.titulo}" decoding="async" width="320" height="180">
                        ${playOverlayButton}
                    </div>
                </a>
                <div class="card-content">
                    <span class="badge ${badgeClass}">${item.categoria}</span>
                    <div class="card-title-line">
                        <h3>${item.titulo}</h3>
                        <span class="card-price ${priceClass}">${priceText}</span>
                    </div>
                    <p><strong>${item.genero}</strong> - ${item.ano}</p>
                    ${viewCountHtml}
                </div>
                <div class="card-footer"></div>
            </div>
            `;

        }).join('');

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
        const pageContent = allContent.filter(item => {
            const matchesPageConfig =
                (!pageConfig.categorias || pageConfig.categorias.includes(item.categoria)) &&
                (!pageConfig.precoMin || item.preco >= pageConfig.precoMin) &&
                (!pageConfig.showOnlyYouTube || item.isYouTubePost === true) &&
                (!pageConfig.home || true);
            return matchesPageConfig;
        });

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
            displayPage(currentPage);
            updateURL(); // Atualiza a URL com os filtros atuais
        }, cards.length > 0 ? animationDuration : 0); // Se não houver cards, executa imediatamente
    }

    function filterContent(searchTerm, selected) {
        return allContent.filter(item => {
            const matchesPageConfig =
                (!pageConfig.categorias || pageConfig.categorias.includes(item.categoria)) &&
                (!pageConfig.precoMin || item.preco >= pageConfig.precoMin) &&
                (!pageConfig.showOnlyYouTube || item.isYouTubePost === true) &&
                (!pageConfig.home || true); // Lógica para a home page, se necessário

            if (!matchesPageConfig) return false;

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

        // Listener para destacar a faixa que está a tocar
        document.addEventListener('trackChanged', handleTrackHighlight);
    }

    function handleCardClick(event) {
        const card = event.target.closest('.card');
        if (!card) return; // Sai se o clique não foi dentro de um card

        const itemId = card.dataset.id;
        const item = allContent.find(i => i.id.toString() === itemId);

        // Se o item for um post do YouTube, mostra o alerta e para a execução.
        if (item && item.isYouTubePost) {
            event.preventDefault(); // Previne qualquer outra ação padrão (como seguir um link)
            document.dispatchEvent(new CustomEvent('showAlert', {
                detail: {
                    message: `Está prestes a ser redirecionado para o YouTube para ver "${item.titulo}".`,
                    actionText: '<i class="fa-brands fa-youtube"></i> Ver no YouTube',
                    action: () => window.open(item.link, '_blank')
                }
            }));
            return; // Interrompe a função aqui
        }

        // Se não for um post do YouTube, continua com a lógica de tocar a prévia
        const playButton = event.target.closest('.play-overlay-btn');
        if (!playButton) return; // Se o clique não foi no botão de play, não faz nada (o link <a> tratará da navegação)

        event.preventDefault(); // Impede que o link do card seja seguido ao clicar em "Play"
        event.stopPropagation();
        const clickedId = card.dataset.id;

        // Cria a playlist apenas com itens que têm áudio
        const playlist = currentFilteredContent
            .filter(item => item.audioPreview)
            .map(item => ({
                id: item.id,
                title: item.titulo,
                cover: item.capa,
                audioSrc: item.audioPreview,
                link: item.link,
                preco: item.preco
            }));

        const startIndex = playlist.findIndex(track => track.id.toString() === clickedId);

        if (startIndex === -1) return; // Não deveria acontecer

        // Dispara um evento customizado com os dados da música
        document.dispatchEvent(new CustomEvent('playPlaylist', { detail: { playlist, startIndex } }));
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

    function handleTrackHighlight(event) {
        const { trackId, source } = event.detail;

        // Remove o destaque de todos os cards
        const allCards = elements.container.querySelectorAll('.card');
        allCards.forEach(card => card.classList.remove('is-playing'));

        if (trackId) {
            let playingCard = elements.container.querySelector(`.card[data-id="${trackId}"]`);

            if (playingCard) {
                // Se o card já está na página, destaca e rola se necessário
                playingCard.classList.add('is-playing');
                if (source === 'navigation') { // Só rola se a ação veio do player (next/prev)
                    playingCard.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }
            } else {
                // Se o card não está na página, encontra a página correta e muda para ela
                const trackIndexInFullList = currentFilteredContent.findIndex(item => item.id.toString() === trackId.toString());

                if (trackIndexInFullList !== -1) {
                    const targetPage = Math.floor(trackIndexInFullList / itemsPerPage) + 1;
                    if (targetPage !== currentPage) {
                        // A função displayPage irá re-renderizar os cards.
                        // O evento 'trackChanged' será tratado novamente pelo novo DOM,
                        // e o card será encontrado e destacado na segunda passagem.
                        displayPage(targetPage);
                    }
                }
            }
        }
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
        window.scrollTo(0, 0); // Rola para o topo da página ao mudar de página
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
