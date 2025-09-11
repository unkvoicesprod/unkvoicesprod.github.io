
/*
Chaves do JSON
Beats   /   Kits    /   Posts
*/


document.addEventListener("DOMContentLoaded", () => {
    // Estado da aplicação
    let allContent = [];
    let currentFilteredContent = [];
    let currentPage = 1;
    const itemsPerPage = 5;
    // Estado do player de áudio
    const audioPlayer = new Audio();
    let currentlyPlaying = {
        button: null,
        timeoutId: null,
    };

    // Cache de elementos do DOM para evitar múltiplas buscas
    const elements = {
        container: document.getElementById("conteudo-container"),
        search: document.getElementById("search"),
        filtroGenero: document.getElementById("filtro-genero"),
        filtroCategoria: document.getElementById("filtro-categoria"),
        filtroAno: document.getElementById("filtro-ano"),
        filtroTipo: document.getElementById("filtro-tipo"),
        filtersContainer: document.querySelector(".filters"),
        toggleFiltersBtn: document.getElementById("toggle-filters-btn"),
        paginationContainer: document.getElementById("pagination-container"),
        clearFiltersBtn: document.getElementById("clear-filters-btn"),
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

            setupAudioPlayer();
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
                <div class="card card-post" data-id="${item.id}">
                    <div class="card-image-container">
                    <img src="${imagePath}" alt="${item.titulo}" loading="lazy" decoding="async" width="320" height="180">
                    </div>
                    <div class="card-content">
                    <h3 class="accordion-title">${item.titulo}</h3>
                    <div class="extra">
                        <p>${item.descricao}</p>
                        <p>${item.conteudo}</p>
                    </div>
                    <div class="card-footer">
                        <span class="post-action">Ver mais...</span>
                    </div>
                    </div>
                </div>`;
            } else {
                // --- LÓGICA DE RENDERIZAÇÃO PARA OUTROS ITENS (BEATS, KITS) ---
                const badgeClassMap = { "beats": "beat", "kits & plugins": "kit" };
                const badgeClass = badgeClassMap[item.categoria.toLowerCase()] || 'kit';

                const buttonText = item.preco === 0 ? '⬇ Baixar' : '🛒 Comprar';
                const actionButton = item.link ? `<a href="${item.link}" target="_blank" rel="noopener noreferrer" class="download">${buttonText}</a>` : '';
                const playButton = (window.location.pathname.includes("beats.html") && item.audioPreview)
                    ? `<button class="play" data-audio-src="${item.audioPreview}">▶ Play</button>`
                    : "";

                return `
                <div class="card" data-id="${item.id}">
                    <div class="card-image-container">
                    <img src="${imagePath}" alt="${item.titulo}" loading="lazy" decoding="async" width="320" height="180">
                    </div>
                    <div class="card-content">
                    <span class="badge ${badgeClass}">${item.categoria}</span>
                    <h3 class="accordion-title">${item.titulo}</h3>
                    <p><strong>${item.genero}</strong> - ${item.ano}</p>
                    <p>${item.descricao}</p>
                    <p><strong>Preço:</strong> ${item.preco > 0 ? "R$ " + item.preco.toFixed(2) : "Grátis"}</p>
                    <div class="extra">
                        <p>${item.conteudo}</p>
                    </div>
                    <div class="card-footer">
                        ${actionButton}
                        ${playButton}
                    </div>
                    </div>
                </div>`;
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

        ['genero', 'categoria', 'ano', 'tipo'].forEach(key => {
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
        fillSelect(elements.filtroTipo, getUniqueValues('tipo'));
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
            tipo: elements.filtroTipo.value,
        };

        // Na página inicial, se não houver filtro, mostrar apenas os 3 mais recentes
        const isFiltering = searchTerm || selected.genero || selected.categoria || selected.ano || selected.tipo;
        if (pageFilter.home && !isFiltering) {
            const latestContent = [...allContent]
                .sort((a, b) => b.ano - a.ano || b.id - a.id)
                .slice(0, 3);

            elements.paginationContainer.innerHTML = ''; // Limpa paginação na home
            renderContent(latestContent);
            return; // Interrompe a função para mostrar apenas os itens mais recentes
        }

        const filtered = allContent.filter(item => {
            // 1. Aplicar o filtro base da página (se houver)
            const matchesPageFilter =
                (!pageFilter.categoria || item.categoria === pageFilter.categoria) &&
                (!pageFilter.preco || item.preco > 0);

            if (!matchesPageFilter) return false;

            // 2. Aplicar filtros do usuário (pesquisa e selects)
            const matchesSearch = searchTerm === "" ||
                item.titulo.toLowerCase().includes(searchTerm) ||
                item.descricao.toLowerCase().includes(searchTerm) ||
                item.conteudo.toLowerCase().includes(searchTerm);

            const matchesFilters =
                (selected.genero === "" || item.genero === selected.genero) &&
                (selected.categoria === "" || item.categoria === selected.categoria) &&
                (selected.ano === "" || item.ano.toString() === selected.ano) &&
                (selected.tipo === "" || item.tipo === selected.tipo);

            return matchesSearch && matchesFilters;
        });

        currentFilteredContent = filtered;
        currentPage = 1;

        setupPagination();
        displayPage(currentPage);
        updateURL(); // Atualiza a URL com os filtros atuais
    }

    function handleAccordionClick(event) {
        const target = event.target;
        const card = target.closest('.card');
        if (!card) return;

        // Se for um card de post, o card inteiro ativa o acordeão.
        // Se for outro tipo de card, apenas o título ativa.
        const isPostCardClick = card.classList.contains('card-post');
        const isTitleClick = target.closest('.accordion-title');

        if (!isPostCardClick && !isTitleClick) return;

        const extra = card.querySelector('.extra');
        card.classList.toggle('active');

        if (card.classList.contains('active')) {
            extra.style.maxHeight = extra.scrollHeight + 'px';
        } else {
            extra.style.maxHeight = null;
        }
    }

    function setupEventListeners() {
        // Delegação de eventos para os cliques no acordeão
        elements.container.addEventListener('click', handleCardClick);
        elements.container.addEventListener('click', handleAccordionClick);

        // Listeners para os filtros
        elements.search.addEventListener("input", applyFilters);
        Object.values(elements).filter(el => el && el.tagName === 'SELECT').forEach(select => {
            // Em vez de chamar applyFilters diretamente, chama a função de animação
            // que por sua vez chama applyFilters.
            // Se a função de animação não existir no seu código, use a linha comentada.
            // select.addEventListener('change', applyFilters);
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

    function setupAudioPlayer() {
        // Quando o áudio termina ou é pausado, reseta o estado do botão
        audioPlayer.addEventListener('ended', resetPlayerState);
        audioPlayer.addEventListener('pause', resetPlayerState);
    }

    function resetPlayerState() {
        if (currentlyPlaying.button) {
            currentlyPlaying.button.textContent = '▶ Play';
        }
        if (currentlyPlaying.timeoutId) {
            clearTimeout(currentlyPlaying.timeoutId);
        }
        currentlyPlaying.button = null;
        currentlyPlaying.timeoutId = null;
    }

    function handleCardClick(event) {
        const playButton = event.target.closest('.play');
        if (!playButton) return;

        event.stopPropagation(); // Impede que o acordeão abra ao clicar em "Play"

        const audioSrc = playButton.dataset.audioSrc;
        const isCurrentlyPlayingThis = currentlyPlaying.button === playButton;

        // Pausa o player atual (isso também chama resetPlayerState via evento 'pause')
        audioPlayer.pause();

        // Se o botão clicado já estava tocando, a ação era apenas parar.
        if (isCurrentlyPlayingThis) {
            return;
        }

        // Inicia a reprodução do novo áudio
        audioPlayer.src = audioSrc;
        audioPlayer.currentTime = 0;
        audioPlayer.play();

        playButton.textContent = '❚❚ Pause';
        currentlyPlaying.button = playButton;

        // Define o tempo limite de 30 segundos
        currentlyPlaying.timeoutId = setTimeout(() => audioPlayer.pause(), 30000);
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
        if (elements.filtroTipo) elements.filtroTipo.value = '';

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
            tipo: elements.filtroTipo.value,
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
