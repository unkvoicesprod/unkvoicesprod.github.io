
/*
Chaves do JSON
Beats   /   Kits    /   Posts
*/


document.addEventListener("DOMContentLoaded", () => {
    // Estado da aplicação
    let allContent = [];
    let currentFilteredContent = [];
    let currentPage = 1;
    const itemsPerPage = 4;

    // Cache de elementos do DOM para evitar múltiplas buscas
    const elements = {
        container: document.getElementById("conteudo-container"),
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

        try {
            const response = await fetch("data/conteudo.json");
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            allContent = await response.json();

            const appliedFromURL = applyFiltersFromURL();
            setupEventListeners();
            populateFilters();
            if (!appliedFromURL) {
                applyFilters(); // Chamada inicial apenas se não houver filtros na URL
            }
        } catch (error) {
            console.error("Falha ao carregar o conteúdo:", error);
            elements.container.innerHTML = `<p class="error-message">Não foi possível carregar o conteúdo. Tente novamente mais tarde.</p>`;
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
            const isPost = item.categoria.toLowerCase() === 'posts';
            const imagePath = item.capa;

            if (isPost) {
                // --- LÓGICA DE RENDERIZAÇÃO PARA POSTS ---
                return `
                <a href="item.html?id=${item.id}" class="card card-post" data-id="${item.id}">
                    <div class="card-image-container">
                    <img src="${imagePath}" alt="${item.titulo}" loading="lazy" decoding="async" width="320" height="180">
                    </div>
                    <div class="card-content">
                    <h3>${item.titulo}</h3>
                    <div class="card-footer">
                    </div>
                    </div>
                </a>`;
            } else {
                // --- LÓGICA DE RENDERIZAÇÃO PARA OUTROS ITENS (BEATS, KITS) ---
                const badgeClassMap = { "beats": "beat", "kits & plugins": "kit" };
                const badgeClass = badgeClassMap[item.categoria.toLowerCase()] || 'kit';

                const actionButtonText = item.preco === 0 ? '<i class="fa-solid fa-download"></i> Download' : '<i class="fa-solid fa-cart-shopping"></i> Comprar';
                const actionButton = item.link ? `<a href="${item.link}" target="_blank" rel="noopener noreferrer" class="download">${actionButtonText}</a>` : '';

                // Botão de play que será sobreposto na imagem
                const playOverlayButton = item.audioPreview
                    ? `<button class="play-overlay-btn" aria-label="Tocar prévia de ${item.titulo}">▶</button>`
                    : "";

                return `
                <div class="card" data-id="${item.id}" data-audio-src="${item.audioPreview || ''}" data-title="${item.titulo}" data-cover="${imagePath}">
                    <a href="item.html?id=${item.id}" class="card-link-wrapper">
                        <div class="card-image-container">
                            <img src="${imagePath}" alt="${item.titulo}" loading="lazy" decoding="async" width="320" height="180">
                        </div>
                        <div class="card-content">
                            <span class="badge ${badgeClass}">${item.categoria}</span>
                            <h3>${item.titulo}</h3>
                            <p><strong>${item.genero}</strong> - ${item.ano}</p>
                        </div>
                    </a>
                    <div class="card-footer-wrapper">
                         <div class="card-footer">
                            ${actionButton}
                         </div>
                    </div>
                </div>
                `;
            }

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
        const getUniqueValues = (key) => [...new Set(allContent.map(item => item[key]).filter(Boolean))];

        fillSelect(elements.filtroGenero, getUniqueValues('genero'));
        fillSelect(elements.filtroCategoria, getUniqueValues('categoria'));
        fillSelect(elements.filtroAno, getUniqueValues('ano').sort((a, b) => b - a)); // Ordena anos do mais recente para o mais antigo
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
    }

    function applyFilters() {
        const pageFilter = getPageFilter();

        const searchTerm = elements.search.value.toLowerCase();
        const selected = {
            genero: elements.filtroGenero.value,
            categoria: elements.filtroCategoria.value,
            ano: elements.filtroAno.value,
        };

        const filtered = allContent.filter(item => {
            // 1. Aplicar o filtro base da página (se houver)
            const matchesPageFilter =
                (!pageFilter.categoria || item.categoria === pageFilter.categoria) &&
                (!pageFilter.preco || item.preco > 0);

            if (!matchesPageFilter) return false;

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

        currentFilteredContent = filtered;
        currentPage = 1;

        updateResultsCounter();
        setupPagination();
        displayPage(currentPage);
        updateURL(); // Atualiza a URL com os filtros atuais
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
        const playButton = event.target.closest('.play-overlay-btn');
        if (!playButton) return;

        event.preventDefault(); // Impede que o link do card seja seguido ao clicar em "Play"
        event.stopPropagation();

        const card = playButton.closest('.card');
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

    function getPageFilter() {
        if (window.location.pathname.includes("beats.html")) return { categoria: "Beats" };
        if (window.location.pathname.includes("kits.html")) return { categoria: "Kits & Plugins" };
        if (window.location.pathname.includes("loja.html")) return { preco: ">0" };
        if (window.location.pathname.includes("posts.html")) return { categoria: "Posts" };
        if (window.location.pathname.includes("index.html") || window.location.pathname.endsWith('/')) return { home: true };
        return {};
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
});
